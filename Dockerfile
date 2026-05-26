# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
WORKDIR /app

FROM base AS builder

ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache python3 make g++ linux-headers

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci

COPY . .
RUN NODE_ENV=production npm run build

FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache su-exec ca-certificates

LABEL org.opencontainers.image.title="axonrouter"

ENV NODE_ENV=production \
  PORT=12711 \
  HOSTNAME=0.0.0.0 \
  NEXT_TELEMETRY_DISABLED=1

COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/.next/static ./.next/static
COPY --chown=node:node --from=builder /app/.next/standalone ./
COPY --chown=node:node --from=builder /app/scripts ./scripts
COPY --chown=node:node --from=builder /app/open-sse ./open-sse
# Next file tracing can omit sibling files; MITM runs server.ts as a separate process.
COPY --chown=node:node --from=builder /app/src/mitm ./src/mitm
# Standalone node_modules may omit deps only required by the MITM child process.
COPY --chown=node:node --from=builder /app/node_modules/node-forge ./node_modules/node-forge
RUN mkdir -p /home/node/.axonrouter && \
  chown node:node /home/node/.axonrouter && \
  printf '#!/bin/sh\nset -eu\nmkdir -p /home/node/.axonrouter && chown -R node:node /home/node/.axonrouter 2>/dev/null\nexec su-exec node "$@"\n' > /entrypoint.sh && \
  chmod +x /entrypoint.sh

EXPOSE 12711

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "./scripts/start.js"]
