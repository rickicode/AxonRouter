# WorkerProxy

Cloudflare Worker relay proxy for AxonRouter. Also runs on any VPS with Node.js 18+.

## How it works

AxonRouter sends requests with these headers:
- `x-relay-target`: `https://api.openai.com` (protocol + host)
- `x-relay-path`: `/v1/chat/completions?stream=true` (path + query)

The worker strips relay headers, forwards the request to the target, and streams the response back.

Alternative URL-rewrite mode:
- `/go/https://api.openai.com/v1/chat/completions`

## Deploy on Cloudflare Workers

```bash
npm install
npm run deploy
```

## Run on VPS (Node.js)

### Development
```bash
npm install
npm run dev:node
```

### Production
```bash
npm install
npm run build
PORT=8787 npm start
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | Listen port |
| `HOST` | `0.0.0.0` | Listen host |
| `ALLOWED_HOSTS` | `*` (all) | Comma-separated allowed target hosts |

### Systemd Service (VPS)

Create `/etc/systemd/system/axon-relay-proxy.service`:

```ini
[Unit]
Description=AxonRouter Relay Proxy
After=network.target

[Service]
Type=simple
User=axon
WorkingDirectory=/opt/axon-relay-proxy
ExecStart=/usr/bin/node dist/server.js
Environment=PORT=8787
Environment=ALLOWED_HOSTS=api.openai.com,api.anthropic.com
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable axon-relay-proxy
sudo systemctl start axon-relay-proxy
```

### Docker (VPS)

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
EXPOSE 8787
CMD ["node", "dist/server.js"]
```

```bash
docker build -t axon-relay-proxy .
docker run -d -p 8787:8787 -e ALLOWED_HOSTS=api.openai.com axon-relay-proxy
```

## Configure in AxonRouter

1. Go to **Proxy Pools** → **Add Proxy Pool**
2. Name it (e.g. "CF Worker Proxy" or "VPS Relay Proxy")
3. Set proxy URL to:
   - Cloudflare: `https://your-worker.workers.dev`
   - VPS: `http://your-vps-ip:8787`
4. Pool type auto-detected as `relay`
5. Bind to connections as usual

## Security

- Only forwards to `https://` targets (no HTTP, no localhost bypass)
- Blocks private IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x)
- Blocks cloud metadata endpoint (169.254.169.254)
- Optional: restrict allowed target hosts via `ALLOWED_HOSTS` env var
