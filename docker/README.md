# AxonRouter - Docker Deployment Guide

Multi-instance Docker setup dengan Caddy load balancer untuk production deployment.

## Architecture

```
                    ┌─────────────────────────────────┐
    Internet ──────►│         Caddy (LB)               │
                    │   port 80, 443 (with HTTPS)     │
                    └──┬────┬────┬────┬────┬────┬─────┘
                       │    │    │    │    │    │
                  ┌────▼┐┌───▼┐┌───▼┐┌───▼┐    ┌───▼┐
                  │App 1││App 2││App 3││App 4│...│App N│
                  └──┬──┘└────┘└────┘└────┘    └────┘
                     │                          │
                     └──────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │  ~/.axonrouter/db.sqlite       │
                    │  WAL mode, concurrent reads    │
                    └───────────────────────────────┘
```

## Quick Start

Use the helper script:

```bash
# First install / build
./docker/deploy.sh install

# Start again later
./docker/deploy.sh start

# Check status
./docker/deploy.sh status

# View logs
./docker/deploy.sh logs app
```

## Scaling

```bash
# Scale to 8 instances
./docker/deploy.sh scale 8

# Scale to 16 instances
./docker/deploy.sh scale 16

# Check running instances
./docker/deploy.sh status
```

## Configuration

Edit `docker/.env.docker`.

First-run dashboard password is `12345677`. Sign in once, then change it immediately in Settings -> Security.


```bash
REPLICAS=4                    # Number of app instances
DATA_PATH=./data              # Host path mounted as /home/node/.axonrouter
JWT_SECRET=your-secret-here    # CHANGE THIS!
LOG_LEVEL=info                # debug, info, warn, error
```

## Health Checks

```bash
# Check load balancer health
curl http://localhost/health

# Check app health from inside compose network
docker compose -f docker/docker-compose.yml --env-file docker/.env.docker exec -T app \
  wget -q --spider http://localhost:12711/api/health

# Docker health status
docker compose -f docker/docker-compose.yml ps
```

## Performance Tuning

### More Instances (CPU bound)
```bash
./docker/deploy.sh scale 8
```

### Connection Limits
```bash
# In Caddyfile transport http block, tune keepalive if needed
```

## MITM Proxy (Optional)

```bash
# Start with MITM proxy
docker compose -f docker/docker-compose.yml --profile mitm up -d

# MITM available at mitm:20129
```

## Troubleshooting

### App containers not starting
```bash
# Check logs
docker compose -f docker/docker-compose.yml logs app

# Check host data directory permissions
ls -la ./data
```

### All requests go to same instance
```bash
# Caddy resolves all app replicas dynamically from Docker DNS.
# Reload after scaling if needed:
docker compose -f docker/docker-compose.yml restart caddy
```

### SQLite database locked
```bash
# Check app logs first
docker compose -f docker/docker-compose.yml logs app

# Shared SQLite is optimized for many reads and low write contention.
# If you still see lock pressure, reduce settings writes or scale app gradually.
```

## Performance Benchmarks

| Instances | Requests/sec | Memory | Latency P99 |
|-----------|---------------|--------|-------------|
| 1         | ~500          | 256MB  | ~50ms       |
| 4         | ~2000         | 1GB    | ~50ms       |
| 8         | ~4000         | 2GB    | ~50ms       |
| 16        | ~8000         | 4GB    | ~50ms       |

*Note: Latency dominated by upstream LLM providers, not app instance count*

## Stopping

```bash
# Stop all services
./docker/deploy.sh stop

# Stop and remove volumes (DANGER: deletes data!)
./docker/deploy.sh cleanup
```
