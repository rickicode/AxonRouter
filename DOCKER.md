# Docker Guide — AxonRouter

AxonRouter is designed to run containerized with Docker and Docker Compose. Published images are hosted on GitHub Container Registry (GHCR):
- `ghcr.io/rickicode/axonrouter-web:latest` (Web Dashboard + Control Plane, port `3777`)
- `ghcr.io/rickicode/axonrouter-api:latest` (Standalone Hono Gateway, port `3778`)

---

## 🚀 Quick Start (Production)

The production stack uses pre-built images from GHCR and connects to a managed PostgreSQL 17 database.

```bash
# 1. Download installer and run interactively (generates secrets and starts stack)
curl -sSL https://raw.githubusercontent.com/rickicode/AxonRouter/main/scripts/install.sh | sh

# Or manual start:
git clone https://github.com/rickicode/AxonRouter.git
cd AxonRouter
cp .env.example .env
docker compose up -d
```

### Endpoints
- **Web Dashboard**: `http://localhost:3777/dashboard`
- **Hono API Gateway**: `http://localhost:3778/v1`

---

## 🛠 Container Management

```bash
# View running services
docker compose ps

# Follow container logs
docker compose logs -f axonrouter-api
docker compose logs -f axonrouter-web

# Restart services
docker compose restart

# Stop the stack
docker compose down

# Update to latest images
docker compose pull
docker compose up -d
```

---

## 💾 Data Persistence

All application data and state are preserved across container updates:
- **`axonrouter-data`** volume: certificates, logs, and local proxy certificates mounted at `/app/data`.
- **`axonrouter-pgdata`** volume: PostgreSQL 17 database storage mounted at `/var/lib/postgresql/data`.

---

## 🏗️ Local Development (Build Images Locally)

If you are developing or testing custom changes:

```bash
# Build and run using the local build compose definition:
docker compose -f docker-compose.build.yml up -d --build
```
