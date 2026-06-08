# SESSION STATUS — AxonRouter Stability + Features

_Updated: June 3, 2026_

## Status: ✅ ALL COMPLETE — Audit Passed

Build stable, tests 1178/0, real server verified, Dockerfile with runner variants, auto-password working.

## All Changes This Session

| File | Change |
|------|--------|
| **Dockerfile** | Refactored: runner-base (~300MB), runner-web (+Chromium), runner-cli (+git/docker/AI CLIs). Permission entrypoint, runtime memory config, OCI labels, @swc/helpers. |
| **docker/docker-compose.yml** | Added AXONROUTER_IMAGE env var for target selection |
| **src/shared/constants/auth.ts** | NEW — Shared DEFAULT_DASHBOARD_PASSWORD |
| **src/lib/auth/ensureDefaultPassword.ts** | NEW — Auto-hashes + stores password at startup |
| **src/shared/services/initializeApp.ts** | Calls ensureDefaultPassword() on boot |
| **src/instrumentation.ts** | BUGFIX — Calls initializeApp() (was only importing) |
| **src/app/api/auth/login/route.ts** | Uses shared constant |
| **next.config.mjs** | outputFileTracing, 25+ serverExternalPackages, CSP, webpack force |
| **package.json** | next@16.2.6, --webpack, dev:turbopack |
| **Dockerfile** | npm ci --ignore-scripts, native copies, HEALTHCHECK |
| **docs/ARCHITECTURE.md** | Build/Bundler Strategy, Redis removal |
| **src/lib/providerHotState.ts** | Removed __setRedisClientForTests |
| **tests/unit/*.test.ts** (11 files) | Redis refs removed, config refs fixed |
| **.env.example** | AXONROUTER_PASSWORD, PORT, HOSTNAME |
| **mcp_config.json** | Installed MCP configuration from `~/.pi/agent/mcp.json` to both `~/.gemini/config/mcp_config.json` and `~/.gemini/antigravity-cli/mcp_config.json`. |

## Validation

- ✅ `npm run build` (webpack)
- ✅ `npm run test` — 1178 passed, 0 failed
- ✅ Real server: health ✅, login ✅, wrong pwd 401 ✅, hasPassword true ✅
- ✅ Zero Redis references
- ✅ Dockerfile code-reviewed (3 passes)
- ✅ MCP servers installed and loaded by `agy` CLI

## Dockerfile Runner Variants

| Target | Use Case |
|--------|----------|
| `runner-base` | Lean production (~300MB) |
| `runner-web` | +Chromium/Playwright for web-cookie providers |
| `runner-cli` | +git, docker, @openai/codex, claude-code |

## ⚠️ Convention

Update this file at end of every session so next session can continue seamlessly.

