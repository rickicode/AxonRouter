# syntax=docker/dockerfile:1.7

# ── Common base with runtime deps ──────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app

RUN apk add --no-cache ca-certificates

# ── Builder ────────────────────────────────────────────────────────────────
FROM base AS builder

ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache python3 make g++ linux-headers

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --ignore-scripts && \
  npm rebuild better-sqlite3

COPY . .
RUN NODE_ENV=production npm run build

# Prepare @swc/helpers for runner-base (not always traced by standalone output)
RUN mkdir -p /app/.swc-helpers && \
    if [ -d node_modules/@swc/helpers ]; then \
      cp -r node_modules/@swc/helpers /app/.swc-helpers/; \
    fi

# ── Runner base ────────────────────────────────────────────────────────────
FROM base AS runner-base

LABEL org.opencontainers.image.title="axonrouter" \
  org.opencontainers.image.description="Fast, local-first AI routing gateway" \
  org.opencontainers.image.licenses="MIT"

RUN apk add --no-cache su-exec

ENV NODE_ENV=production \
  PORT=12711 \
  HOSTNAME=0.0.0.0 \
  NEXT_TELEMETRY_DISABLED=1 \
  AXONROUTER_MEMORY_MB=1024

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/open-sse ./open-sse
# Next file tracing can omit sibling files; MITM runs server.ts as a separate process.
COPY --from=builder /app/src/mitm ./src/mitm
# Standalone tracing can miss native bindings — copy them explicitly.
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/node_modules/node-forge ./node_modules/node-forge
# SQLite migration files are read at runtime via fs.
COPY --from=builder /app/src/lib/migrations ./src/lib/migrations

# @swc/helpers not always traced by standalone output but needed at runtime
COPY --from=builder /app/.swc-helpers ./node_modules/@swc-helpers-tmp
RUN if [ -d ./node_modules/@swc-helpers-tmp/@swc/helpers ]; then \
      cp -r ./node_modules/@swc-helpers-tmp/@swc/helpers ./node_modules/@swc/helpers; \
    fi && \
    rm -rf ./node_modules/@swc-helpers-tmp

# Data directory + ownership
RUN mkdir -p /home/node/.axonrouter && \
  chown node:node /home/node/.axonrouter

# Permission-check + memory-config entrypoint
COPY --chmod=755 - <<'ENTRYPOINT_SH' /entrypoint.sh
#!/bin/sh
set -eu

# Configure Node.js memory limit from env (runtime-configurable)
export NODE_OPTIONS="--max-old-space-size=${AXONROUTER_MEMORY_MB:-1024}"

mkdir -p /home/node/.axonrouter
if [ ! -w /home/node/.axonrouter ]; then
  echo "[AxonRouter] WARNING: /home/node/.axonrouter is not writable by the container user."
  echo "[AxonRouter] Fix on host: sudo chown -R $(id -u):$(id -g) ~/.axonrouter"
fi
exec su-exec node "$@"
ENTRYPOINT_SH

RUN chown -R node:node /app

EXPOSE 12711

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:12711/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "./scripts/start.js"]

# ── Runner Web (web-cookie providers: Gemini Web, Claude Turnstile) ────────
#
#  Two image flavors:
#    runner-base  →  axonrouter:VERSION        Lean base (~300 MB). No browsers.
#    runner-web   →  axonrouter:VERSION-web    +Chromium (~500 MB).
#
#  Use runner-web when you need web-cookie providers. For all other providers
#  runner-base is sufficient.
#
#  Build:
#    docker build --target runner-web -t axonrouter:web .
FROM runner-base AS runner-web

USER root

# Install Chromium via apk (Alpine-native). Playwright can use the system
# Chromium binary without needing --with-deps (Debian-only flag).
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright
RUN apk add --no-cache chromium && \
  npx playwright install chromium; \
  chown -R node:node /home/node/.cache

USER node

# ── Runner CLI (git, docker, AI CLI tools) ────────────────────────────────
#
#  runner-cli  →  axonrouter:VERSION-cli    +git +docker +AI CLIs (~700 MB).
#
#  Use runner-cli when you need Codex, Claude Code, or other CLI tools that
#  AxonRouter can spawn for tool-use integrations.
#
#  Build:
#    docker build --target runner-cli -t axonrouter:cli .
FROM runner-base AS runner-cli

USER root

# System dependencies for CLI tools (git SSH references, Docker API access)
RUN apk add --no-cache git docker-cli docker-compose

# Install AI CLI tools globally
RUN --mount=type=cache,target=/root/.npm \
  npm install -g --no-audit --no-fund @openai/codex @anthropic-ai/claude-code && \
  git config --system url."https://github.com/".insteadOf "ssh://git@github.com/"

USER node
