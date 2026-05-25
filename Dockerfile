# syntax=docker/dockerfile:1.7
ARG BUN_IMAGE=oven/bun:1.3.13-alpine
FROM ${BUN_IMAGE} AS base
WORKDIR /app

FROM base AS builder

ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache nodejs python3 make g++ linux-headers

COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --frozen-lockfile

COPY . .
RUN NODE_ENV=production bun run build

FROM golang:1.22-alpine AS go-router-builder
WORKDIR /src

ARG TARGETOS=linux
ARG TARGETARCH=amd64

COPY go-router/go.mod ./
RUN go mod download

COPY go-router/ ./
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
  go build -trimpath -ldflags="-s -w" -o /out/axonrouter-go-router ./cmd/axonrouter-go-router

FROM ${BUN_IMAGE} AS runner
WORKDIR /app

# Node.js is required because the native TypeScript runtime entrypoint is scripts/start.ts.
RUN apk add --no-cache nodejs su-exec ca-certificates

LABEL org.opencontainers.image.title="axonrouter"

ENV NODE_ENV=production \
  PORT=12711 \
  HOSTNAME=0.0.0.0 \
  NEXT_TELEMETRY_DISABLED=1

COPY --chown=bun:bun --from=builder /app/public ./public
COPY --chown=bun:bun --from=builder /app/.next/static ./.next/static
COPY --chown=bun:bun --from=builder /app/.next/standalone ./
COPY --chown=bun:bun --from=builder /app/scripts ./scripts
COPY --chown=bun:bun --from=builder /app/open-sse ./open-sse
# Next file tracing can omit sibling files; MITM runs server.ts as a separate process.
COPY --chown=bun:bun --from=builder /app/src/mitm ./src/mitm
# Standalone node_modules may omit deps only required by the MITM child process.
COPY --chown=bun:bun --from=builder /app/node_modules/node-forge ./node_modules/node-forge
COPY --from=go-router-builder /out/axonrouter-go-router /usr/local/lib/axonrouter/axonrouter-go-router

RUN mkdir -p /home/bun/.axonrouter && \
  chown bun:bun /home/bun/.axonrouter && \
  printf '#!/bin/sh\nset -eu\nmkdir -p /home/bun/.axonrouter/bin\ncp /usr/local/lib/axonrouter/axonrouter-go-router /home/bun/.axonrouter/bin/axonrouter-go-router\nchmod 755 /home/bun/.axonrouter/bin/axonrouter-go-router\nchown -R bun:bun /home/bun/.axonrouter 2>/dev/null\nexec su-exec bun "$@"\n' > /entrypoint.sh && \
  chmod +x /entrypoint.sh

EXPOSE 12711 12778

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "--experimental-strip-types", "./scripts/start.ts"]
