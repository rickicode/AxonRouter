# AxonRouter Docs

Detailed setup notes for AxonRouter. For the shortest path, use the README first.

## Runtime Defaults

| Item | Default |
|------|---------|
| Dashboard | `http://localhost:12711/dashboard` |
| API endpoint | `http://localhost:12711/v1` |
| Local storage | `~/.axonrouter` on macOS/Linux |
| Windows storage | `%APPDATA%\axonrouter` |
| Package binary | `axonrouter` |

## Provider Setup

Open **Dashboard -> Providers** and add at least one provider.

Provider types:

- **OAuth/device providers**: Claude Code, Codex, Gemini CLI, GitHub Copilot, Cursor, iFlow, Qwen, Kiro.
- **API-key providers**: OpenRouter, OpenAI, Anthropic, Gemini, GLM, MiniMax, Kimi, DeepSeek, Groq, Mistral, Together, Fireworks, Cerebras, Cohere, and compatible custom endpoints.

After adding providers, you can create an AxonRouter API key in **Dashboard -> Keys**. API-key routing is open by default until you create or configure an AxonRouter API key; after that, use the key in clients that call `/v1`.

## Combos

Combos let you define ordered fallback paths.

```text
Dashboard -> Combos -> Create

Name: coding-primary
Models:
  1. cc/claude-opus-4-6
  2. cx/gpt-5.2-codex
  3. glm/glm-4.7
  4. if/kimi-k2-thinking
```

Use the combo name as the model in your client:

```text
Model: coding-primary
```

## Client Configuration

### OpenAI-Compatible Clients

```text
Base URL: http://localhost:12711/v1
API Key:  [Dashboard -> Keys, or omit before any AxonRouter API key is set up]
Model:    [model id or combo name]
```

### Codex CLI

```bash
export OPENAI_BASE_URL="http://localhost:12711"
export OPENAI_API_KEY="your-axonrouter-api-key"
codex "write a small test"
```

### Claude Code

Use **Dashboard -> CLI Tools -> Claude Code** to apply the current AxonRouter settings.

For local MCP stdio, use `axonrouter mcp` instead of a separate helper binary. The main `axonrouter` process already serves HTTP MCP endpoints such as `/api/mcp/stream` and `/api/mcp/sse`.

### Cursor, Cline, Continue, RooCode

Use provider type **OpenAI Compatible**:

```text
Base URL: http://localhost:12711/v1
API Key:  [Dashboard -> Keys, or omit before any AxonRouter API key is set up]
Model:    [model id or combo name]
```

### OpenClaw

Use **Dashboard -> CLI Tools -> OpenClaw**. If configuring manually, prefer `127.0.0.1`:

```json
{
  "models": {
    "providers": {
      "axonrouter": {
        "baseUrl": "http://127.0.0.1:12711/v1",
        "apiKey": "your-axonrouter-api-key",
        "api": "openai-completions"
      }
    }
  }
}
```

## API Surfaces

Primary router routes include OpenAI-compatible, Responses-style, and Anthropic/Claude-style surfaces:

- `/v1/chat/completions`
- `/v1/responses`
- `/v1/messages`
- `/v1/models`
- `/v1/embeddings`
- `/v1/audio/speech`
- `/v1/audio/transcriptions`
- `/v1/images/generations`
- `/v1/video/generations`

Additional surfaces:

- `/morphllm/*`
- `/morphllm/v1/*`
- `/api/mcp/*`
- `/api/protocols/*`

## Docker

Build and run:

```bash
docker build -t axonrouter .
docker run -d \
  --name axonrouter \
  -p 12711:12711 \
  -v "$HOME/.axonrouter:/home/node/.axonrouter" \
  axonrouter
```

Compose deployment:

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

The container stores AxonRouter data at `/home/node/.axonrouter`.

## Security

Recommended production settings:

- Set a strong dashboard password before exposing the dashboard. Password changes are handled from Dashboard -> Settings.
- Keep dashboard access behind localhost, VPN, or a trusted reverse proxy.
- Enable secure cookies when running behind HTTPS.
- Use AxonRouter API keys for externally reachable `/v1/*` traffic.
- Keep `~/.axonrouter` persistent across restarts.
- Treat request logs as sensitive when `ENABLE_REQUEST_LOGS=true`.

Management APIs are protected by dashboard authentication or explicit route-level checks. Critical routes such as shutdown, database settings, updater, and tunnel controls should not be exposed without auth.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PORT` | Service port, default `12711` |
| `HOSTNAME` | Bind host |
| `NODE_ENV` | Runtime mode |
| `BASE_URL` | Server-side internal base URL for sync jobs |
| `CLOUD_URL` | Cloud sync endpoint base URL |
| `API_KEY_SECRET` | HMAC secret for generated local API keys |
| `ENABLE_REQUEST_LOGS` | Enables request/response logs under `logs/` |
| `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` | Optional upstream proxy settings |
| `GEMINI_OAUTH_CLIENT_ID`, `GEMINI_OAUTH_CLIENT_SECRET` | Optional Gemini OAuth app credentials |
| `GEMINI_CLI_OAUTH_CLIENT_ID`, `GEMINI_CLI_OAUTH_CLIENT_SECRET` | Optional Gemini CLI OAuth override |
| `ANTIGRAVITY_OAUTH_CLIENT_ID`, `ANTIGRAVITY_OAUTH_CLIENT_SECRET` | Optional Antigravity OAuth app credentials |
| `IFLOW_OAUTH_CLIENT_ID`, `IFLOW_OAUTH_CLIENT_SECRET` | Optional iFlow OAuth app credentials |
| `QODER_OAUTH_CLIENT_ID`, `QODER_OAUTH_CLIENT_SECRET` | Optional Qoder OAuth app credentials |

## Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
