# syntax=docker/dockerfile:1.7
# Pin Debian base (not upstream Alpine) to keep libc/runtime and npm stable.
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
ENV NEXT_TELEMETRY_DISABLED=1
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
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATA_DIR=/app/data

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/custom-server.js ./custom-server.js
COPY --from=builder /app/open-sse ./open-sse
# Ensure `next` is available at runtime in case tracing did not include it.
COPY --from=builder /app/node_modules/next ./node_modules/next
# node-machine-id is createRequire-loaded at runtime; tracing omits it.
COPY --from=builder /app/node_modules/node-machine-id ./node_modules/node-machine-id

RUN mkdir -p /app/data /app/data-home && chown -R node:node /app/data /app/data-home && \
  ln -sf /app/data-home /root/.axonrouter 2>/dev/null || true

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3777

# Health: Next serves /api/health (dashboardGuard public path).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3777/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "--max-old-space-size=4096", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "custom-server.js"]
