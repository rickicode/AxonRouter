<div align="center">
  <img src="./screenshots/overview.png" alt="AxonRouter Dashboard" width="800"/>
  
  # AxonRouter — Enterprise-Grade AI Routing Gateway

  **Connect all your AI coding agents to 40+ LLM providers with pure PostgreSQL 17 concurrency, dedicated Hono API gateway, and zero file-lock bottlenecks.**

  [![GitHub Stars](https://img.shields.io/github/stars/rickicode/AxonRouter.svg?style=flat)](https://github.com/rickicode/AxonRouter)
  [![License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
  [![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL_17-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
  [![Docker](https://img.shields.io/badge/Deployment-Docker_Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

[⚡ AxonRouter vs 9Router](#-axonrouter-vs-9router) • [🚀 Quick Start (Docker)](#-quick-start-docker-compose---recommended) • [💡 Features](#-key-features) • [🛠️ Supported Tools](#%EF%B8%8F-supported-cli-tools) • [🌐 Providers](#-supported-providers) • [📖 Setup](#-setup-guide)

  <table>
    <tr>
      <td align="center"><img src="./screenshots/login.png" alt="Login" width="260"/></td>
      <td align="center"><img src="./screenshots/overview.png" alt="Overview" width="260"/></td>
      <td align="center"><img src="./screenshots/providers.png" alt="Providers" width="260"/></td>
    </tr>
    <tr>
      <td align="center"><sub>Login</sub></td>
      <td align="center"><sub>Overview & Routing</sub></td>
      <td align="center"><sub>Providers</sub></td>
    </tr>
  </table>

</div>

---

## ⚡ AxonRouter vs 9Router

AxonRouter is an enterprise-grade, high-concurrency fork of [decolua/9router (9Router)](https://github.com/decolua/9router). While 9Router targets local single-user developer setups using embedded SQLite (`data.sqlite`), AxonRouter is purpose-built for heavy multi-agent concurrency, containerized environments, and production deployments.

> **Fork Lineage:** `decolua/9router` (local SQLite) → `rickicode/9router-X` → **AxonRouter** (Pure PostgreSQL 17 SSOT + Dedicated Hono Gateway cluster).

| Architectural Component | 9Router Original | AxonRouter (Enterprise Edition) |
|---|---|---|
| **Database Engine** | SQLite file-based (`better-sqlite3` / `sql.js`) — locks on parallel writes | **Pure PostgreSQL 17** — connection pooling via `postgres.js`, ACID transactions, zero file locks |
| **API Gateway Layer** | Integrated inside Next.js server event loop | **Dedicated Hono API Gateway (`gateway/server.js`)** — multi-worker Node cluster on port `3778` |
| **Cache & Cooldowns** | In-memory `Map` (unindexed, wipes on reload) | **In-Memory Speed Layer (`memoryStore.js`)** — TTL keys, owner-token mutexes, zero hot-path DB tax |
| **Usage Logging** | Monolithic unpartitioned tables | **Native Monthly Range Partitioning** (`usage_history`, `request_details`) with auto-rolling tables |
| **Failover & Recovery** | Basic sequential fallback | **Combo Fusion, Difficulty Scoring & Circuit Breaker** — negative-availability memoization |
| **Client Error Isolation** | Client 4xx errors can lock provider accounts | **Strict 4xx Error Isolation** — client errors (400, 404, 413, 499) never freeze upstream accounts |
| **Deployment Model** | Local Single-User CLI / Web | **Docker Compose Production Stack** (Web Dashboard `3777` + Hono Gateway `3778` + PostgreSQL 17) |

---

## 🚀 Standalone API Gateway — Built for Speed

The public LLM API (`/v1/*`) runs in a **dedicated Hono gateway process** (`axonrouter-api`, port 3778), fully separated from the dashboard (`axonrouter-web`, port 3777). Heavy streaming traffic from dozens of concurrent coding agents never contends with the dashboard's event loop.

- **Fast path routing**: `/v1/chat/completions`, `/v1/messages`, `/v1/models`, `/v1/embeddings`, audio/video endpoints.
- **Cluster mode**: Spawns worker processes (`GATEWAY_WORKERS=4`) across CPU cores.
- **Path alias resolution**: Integrated `@/...` module alias resolver without Next.js webpack build overhead.

---

## 💡 Key Features

- ✅ **Dedicated High-Throughput Hono Gateway** — Independent cluster on port `3778` for low-latency streaming
- ✅ **Pure PostgreSQL 17 Backend** — Handles high-concurrency multi-agent requests with zero SQLite lock contention
- ✅ **Monthly Range Partitioning** — Automatic rolling partition tables for request details and token usage history
- ✅ **In-Memory Speed Layer** — Process-local TTL caching for provider cooldowns, model locks, and dead circuits
- ✅ **Universal Protocol Translation** — Bidirectional wire translation between OpenAI, Anthropic Claude, Google Gemini, Antigravity, and Kiro
- ✅ **Model Combos & Smart Failover** — Automatic failover across subscription, cheap, and free provider accounts
- ✅ **Real-Time Observability** — Live console streaming via circular buffer and token consumption analytics
- ✅ **Production Container Ready** — Docker Compose stack with automatic image publishing to GHCR

---

## 🔄 Request Pipeline

```
Incoming Request (Claude Code, Cursor, Codex, OpenClaw, Cline...)
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│  Port 3778: Dedicated Hono API Gateway (Cluster Mode)       │
│  or Port 3777: Next.js Standalone Reverse Proxy Rewrites    │
└─────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│  src/sse/services/auth.js                                   │
│  • Provider / combo credential resolution via mutex locks   │
│  • Negative-availability pre-check (fast-fail on exhaustion)│
│  • LKG (Last-Known-Good) route memory                       │
└─────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│  open-sse/handlers/chatCore.js                              │
│  • Format detection (OpenAI / Claude / Gemini / Kiro)       │
│  • Bidirectional wire format normalization & translation    │
│  • Upstream dispatch, retry backoff & stream forwarding     │
└─────────────────────────────────────────────────────────────┘
        │                             │
        ▼                             ▼
┌──────────────────┐          ┌──────────────────┐
│  PostgreSQL 17   │          │ In-Memory Speed  │
│ (Partitioned DB) │          │ Layer (TTL Maps) │
└──────────────────┘          └──────────────────┘
```

---

## 🚀 Quick Start (Docker Compose - Recommended)

AxonRouter ships as a containerized stack: **Docker is required** (the installer will offer to install it for you if missing). Running without Docker is supported only for manual local development — see [Local Node.js Development](#local-nodejs-development).

The production stack orchestrates:
- **axonrouter-api** (Dedicated High-Throughput Hono API Gateway): `http://localhost:3778`
- **axonrouter-web** (Dashboard & Management Gateway): `http://localhost:3777`
- **postgres** (PostgreSQL 17 ACID database with healthcheck): port `5432`

All published GHCR images are **multi-arch** (`linux/amd64` + `linux/arm64`) — the same compose stack works on x86 servers and ARM boxes (Raspberry Pi, Graviton, Ampere).

### Option 1: One-Line Installer (Recommended)

The installer does everything interactively:
1. Detects Docker — if missing, it prompts `Install Docker now? (yes/no)` and runs `curl -sSL https://get.docker.com | sh` when you answer `yes`.
2. Clones the repo to `./AxonRouter` (the `docker-compose.yml` lives there).
3. Auto-generates all secrets into `.env` (`JWT_SECRET`, `API_KEY_SECRET`, `ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, `INITIAL_PASSWORD`) — press Enter to accept each generated value, or type your own. **No manual `.env` editing needed.**
4. Asks `Start the stack now? (yes/no)` and runs `docker compose up -d` from the clone directory.

```bash
curl -sSL https://raw.githubusercontent.com/rickicode/AxonRouter/main/scripts/install.sh | sh
```

If you skipped the auto-start, launch it any time:

```bash
cd AxonRouter && docker compose up -d
```

Manage the stack from the same directory: `docker compose ps` / `logs -f` / `down`.

### Option 2: Manual Setup

**1. Install Docker** (skip if the installer already offered and you accepted):
```bash
curl -sSL https://get.docker.com | sh
```

**2. Clone & Configure:**
```bash
git clone https://github.com/rickicode/AxonRouter.git
cp .env.example .env
```

Configure `.env` with your secure secrets (e.g. via `openssl rand -hex 32`):
- `JWT_SECRET` — Session cookie signing key
- `INITIAL_PASSWORD` — Initial dashboard admin password
- `API_KEY_SECRET` — HMAC secret for gateway tokens
- `POSTGRES_PASSWORD` — PostgreSQL database password
- `DATABASE_URL` — PostgreSQL connection string

**3. Launch Container Stack:**
```bash
# Run production stack using GHCR images:
docker compose up -d

# Or build locally from source:
docker compose -f docker-compose.build.yml up -d --build
```

### Access Services
- **AxonRouter Web Dashboard**: `http://localhost:3777/dashboard`
- **Hono API Gateway Endpoint**: `http://localhost:3778/v1`

---

## 🧱 Dual-Process Architecture — Why Ports 3777 and 3778

AxonRouter intentionally separates the web dashboard and the public LLM API into two independent processes:

| Aspect | Dashboard (Port 3777) | API Gateway (Port 3778) |
|---|---|---|
| **Process** | Next.js standalone server | Standalone Hono multi-worker cluster |
| **Entry** | `custom-server.js` | `gateway/server.js` |
| **Purpose** | Management UI, settings, live observability | High-throughput `/v1/*` inference routing |
| **Concurrency** | Single Node event loop | Node cluster across CPU cores (`GATEWAY_WORKERS`) |
| **Failure isolation** | Dashboard restart never drops live agent streams | Gateway crash never kills the dashboard |

**Advantages of this split:**
- **Zero event-loop contention**: Dozens of concurrent coding agents streaming SSE never block dashboard renders or admin actions.
- **Independent scaling & restarts**: Scale gateway workers or re-deploy the dashboard without dropping active inference traffic.
- **Secure blast radius**: Public API keys and streaming load are isolated from session/cookie-based admin UI.
- **Stateless gateway**: The gateway reads credentials from PostgreSQL, so any worker can serve any request.

> Local Docker networks and agentic workspaces can reach the gateway via container DNS: `http://axonrouter-api:3778/v1`, or from WSL/VM hosts via `http://host.docker.internal:3778/v1`.
## 🌐 Supported Providers (40+)

AxonRouter supports direct credential rotation and wire translation across 40+ providers:

- **Flagship Commercial**: OpenAI, Anthropic, Google Gemini / Vertex AI, Azure OpenAI, xAI (Grok), Mistral, Cohere, DeepSeek
- **Inference Platforms**: OpenRouter, Groq, Cerebras, Together AI, Fireworks, SiliconFlow, Sambanova, Chutes, Hyperbolic, Nebius
- **Coding Assistants & Subscriptions**: Antigravity, Kiro AI, Codex, Qoder, CodeBuddy (CN/Intl), WorkBuddy, Trae, Windsurf, Devin CLI, Zed
- **Chinese Cloud Providers**: GLM (Zhipu), Minimax, Kimi (Moonshot), Baidu Qianfan, Alibaba Bailian / Tongyi, Tencent Hunyuan, BytePlus
- **Local & Self-Hosted**: Ollama, Local Device, Self-hosted STT/TTS/Embedding engines

---

## 📖 Setup Guide & Local Development

### Running with Docker (Recommended)

```bash
docker compose up -d
```

### Local Node.js Development

Mode manual — hanya untuk pengembangan lokal. Produksi berjalan dengan Docker saja. Membutuhkan Node.js 22+ dan PostgreSQL 17 yang sudah berjalan:

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Set DATABASE_URL=postgres://axonrouter:password123@localhost:5432/axonrouter

# 3. Start development servers
npm run dev               # Web Dashboard on port 3777
node gateway/server.js    # Standalone Hono Gateway on port 3778
```

---

## 📄 License

AxonRouter is open-source software licensed under the [MIT License](./LICENSE).
