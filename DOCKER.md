# Docker

Run AxonRouter in a container. Published image: [`decolua/axonrouter`](https://hub.docker.com/r/decolua/axonrouter) — multi-platform `linux/amd64` + `linux/arm64`.

---

# 👤 For Users

## Quick start

```bash
docker run -d \
  -p 20128:20128 \
  -v "$HOME/.axonrouter:/app/data" \
  -e DATA_DIR=/app/data \
  --name axonrouter \
  decolua/axonrouter:latest
```

App listens on port `20128`. Open: http://localhost:20128

## Manage container

```bash
docker logs -f axonrouter        # view logs
docker stop axonrouter           # stop
docker start axonrouter          # start again
docker rm -f axonrouter          # remove
```

## Data persistence

```bash
-v "$HOME/.axonrouter:/app/data" \
-e DATA_DIR=/app/data
```

Without `DATA_DIR`, the app falls back to `~/.axonrouter/` (macOS/Linux) or `%APPDATA%\axonrouter\` (Windows). In the container, `DATA_DIR=/app/data` makes the bind mount work.

Data layout under `$DATA_DIR/`:

```text
$DATA_DIR/
├── mitm/                 # MITM CA certs and read-replica aliases
└── ...                   # runtime configs and local certificates
```

Database is hosted via PostgreSQL 17 (see `docker-compose.yml` for production stack with PostgreSQL and Valkey).

## Optional env vars

```bash
docker run -d \
  -p 20128:20128 \
  -v "$HOME/.axonrouter:/app/data" \
  -e DATA_DIR=/app/data \
  -e PORT=20128 \
  -e HOSTNAME=0.0.0.0 \
  -e DEBUG=true \
  --name axonrouter \
  decolua/axonrouter:latest
```

## Optional Headroom sidecar

The AxonRouter image does not bundle Python or Headroom. To use Headroom in Docker, run it as a separate service and point AxonRouter at that proxy:

```yaml
services:
  axonrouter:
    image: decolua/axonrouter:latest
    ports:
      - "20128:20128"
    volumes:
      - "$HOME/.axonrouter:/app/data"
    environment:
      DATA_DIR: /app/data
      HEADROOM_URL: http://headroom:8787
    depends_on:
      - headroom

  headroom:
    image: ghcr.io/chopratejas/headroom:latest
    ports:
      - "8787:8787"
```

In the dashboard, open `Endpoint` → `Token Saver` → `Headroom`, confirm the URL is `http://headroom:8787`, recheck status, then enable Headroom.

If Headroom runs on the Docker host instead of as a sidecar, use `http://host.docker.internal:8787` on macOS/Windows. On Linux, add `--add-host=host.docker.internal:host-gateway` or the equivalent compose `extra_hosts` entry.

## Update to latest

```bash
docker pull decolua/axonrouter:latest
docker rm -f axonrouter
# re-run the quick start command
```

---

# 🛠 For Developers

## Build image locally (test)

```bash
cd app && docker build -t axonrouter .

docker run --rm -p 20128:20128 \
  -v "$HOME/.axonrouter:/app/data" \
  -e DATA_DIR=/app/data \
  axonrouter
```

## Publish (automatic via CI)

Push a git tag `v*` → GitHub Actions builds multi-platform (amd64+arm64) and pushes to:
- `ghcr.io/decolua/axonrouter:v{version}` + `:latest`
- `decolua/axonrouter:v{version}` + `:latest`

```bash
# Use scripts/release.js (recommended)
node scripts/release.js "Release title" "Notes"

# Or manually
git tag v0.4.x && git push origin v0.4.x
```

Workflow: `app/.github/workflows/docker-publish.yml`
