# syntax=docker/dockerfile:1.7
# Pin Debian base to keep libc/runtime and npm stable.
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5
FROM ${NODE_IMAGE} AS base
WORKDIR /app

FROM base AS builder

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci
COPY . ./
RUN npm run build


# Runtime tools are independent of application sources/build output.
FROM ${NODE_IMAGE} AS runtime-deps
WORKDIR /app

RUN apt-get -o Acquire::Retries=3 update && \
  apt-get -o Acquire::Retries=3 install -y --no-install-recommends gosu curl tar ca-certificates iptables && \
  rm -rf /var/lib/apt/lists/*


FROM runtime-deps AS runner

LABEL org.opencontainers.image.title="axonrouter"

ENV NODE_ENV=production
ENV PORT=3777
ENV HOSTNAME=0.0.0.0
ENV DATA_DIR=/app/data

# Production runtime dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Application sources and built SPA assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/open-sse ./open-sse
COPY --from=builder /app/gateway ./gateway
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/node_modules/node-machine-id ./node_modules/node-machine-id

RUN mkdir -p /app/data /app/data-home && chown -R node:node /app/data /app/data-home && \
  ln -sf /app/data-home /root/.axonrouter 2>/dev/null || true

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3777

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3777/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "--max-old-space-size=1024", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "src/server/webServer.mjs"]
