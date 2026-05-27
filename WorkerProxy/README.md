# WorkerProxy

Cloudflare Worker relay proxy for AxonRouter.

## How it works

AxonRouter sends requests with these headers:
- `x-relay-target`: `https://api.openai.com` (protocol + host)
- `x-relay-path`: `/v1/chat/completions?stream=true` (path + query)

The worker strips relay headers, forwards the request to the target, and streams the response back.

## Deploy

```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

## Configure in AxonRouter

1. Go to **Proxy Pools** → **Add Proxy Pool**
2. Name it (e.g. "CF Worker Proxy")
3. Set proxy URL to: `https://your-worker.workers.dev`
4. Pool type auto-detected as `relay`
5. Bind to connections as usual

## Security

- Only forwards to `https://` targets (no HTTP, no localhost bypass)
- Optional: restrict allowed target hosts via `ALLOWED_HOSTS` env var in wrangler.toml
