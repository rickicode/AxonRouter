# Audit: proxy routing for non-chat upstream calls (classifier + capabilities)

**Date:** 2026-09-30
**Branch / commit:** `main` @ `d5ec481` — `fix(proxy): route classifier and non-chat upstreams through configured proxy pools`
**Task contract:** (1) Jev classifier proxy routing with `failClosedProxy`, `[PROXY]` logging, `Retry-After` cooldowns, LLM judge escalation; (2) sweep all bare `fetch` in `open-sse/` + `src/`, fix keyless / per-IP-quota providers; (3) every upstream call of every kind visible in `usage_history` via the `saveUsageStats` path. **No deploy, no container restart, no production DB writes.**

Related: `docs/audits/combo-vs-direct-routing-failure-20260929.md`, `docs/jev-system-one-routing.md`.

## Executive summary

Two gaps, one shared shape: outbound calls that bypassed the two choke points.

1. **Egress gap (Task 1+2).** `classifyWithJev` and most non-chat capability cores used bare `fetch`, so no configured proxy pool, no fail-closed guard, no `[PROXY]` log line. Root cause chain: `classifyWithJev` → bare `fetch(...)` → `patchedFetch(..., null)` → `resolveConnectionProxyUrl` null → `getEnvProxyUrl` empty in container → `originalFetch` direct egress. Fix: `open-sse/utils/proxyFetch.js:proxyAwareFetch` is now the single outbound choke point; `src/sse` injects per-connection proxy config via resolver callbacks (`open-sse` never imports the proxy layer, boundary preserved).
2. **Ledger gap (Task 3, "semua harus sama, harus terbaca di usage juga").** Measured baseline: `usage_history` 15986 rows, 0 blank provider, 0 blank model, superset of `request_details`. Chat path complete (must not change). Embeddings already the reference (`/v1/embeddings` 379, `/api/v1/embeddings` 113, `@cf/baai/bge-m3` 492 rows). But **classifier/judge wrote 0 rows**: no `jev`/`systemone`/`judge` model match, endpoints only `/v1/chat/completions` + `/v1/embeddings` + `/api/v1/embeddings`. `classifyWithJev` (`open-sse/services/combo.js:1424`) and `classifyWithJudge` (`open-sse/services/combo.js:1273`) wrote nothing. Fix: unconditional `recordClassifierUsage` + `callKind` discriminator on every row, zero-token capability rows kept, non-ok statuses flip the daily-rollup failed flag while the `usage_history` row keeps `status` verbatim.

## Measured network evidence (operator, raspi, last 24h)

| Probe | Result |
|---|---|
| `curl -4` to classifier upstream | **429** (shared server egress IP is rate-limited) |
| `curl -6` to classifier upstream | **200** |
| Via pool `100.90.3.48:1080` | **200 ×3** |
| Pool egress IP | `114.12.6.95` vs direct `114.10.43.34` — different IPs, different quota buckets |

This is exactly the per-IP-quota failure mode the fail-closed guard exists for: a silent direct fallback burns the shared server IP.

## Findings

### [HIGH] Bare `fetch` in `classifyWithJev` bypassed all proxy pools — FIXED
Root cause chain (pre-fix): `open-sse/services/combo.js:classifyWithJev` → bare `fetch(systemoneEndpoint)` → module-level `patchedFetch(url, opts, null)` in `open-sse/utils/proxyFetch.js` → `resolveConnectionProxyUrl` returns null (no proxyOptions) → `getEnvProxyUrl` empty in container → `originalFetch` direct egress. No pool selection, no `failClosedProxy` throw, no `[PROXY]` log.
Fix (`open-sse/services/combo.js:1424+`, `open-sse/services/jevUpstream.js`, `src/sse/services/jevProxy.js:48`):
- `resolveProxy` / `setJevProxyResolver` injection; resolver registered globally once in `src/sse/handlers/systemone.js:13` and per-request in `src/sse/handlers/chat.js:339,520`.
- Scope `${provider}::jev`; connection `providerSpecificData` first, `settings.providerStrategies[provider]` second; **fail-closed for keyless** (`failClosedProxy: true`) since egress IP is identity for per-IP quota.
- `[PROXY]` log line on every classifier call; 429/503 parked via `extractQuotaResetMs` (precise `resetsAtMs` wins over static cooldown) + `markPoolUnfit(poolId, "${provider}::jev")`; 4xx (incl. client abort 499) never parks.
- In-memory TTL cooldown map (`jevClassifierCooldownKey`, `getJevCooldownUntilMs`, `clearJevCooldowns`); hot path stays DB-free.

### [HIGH] Classifier/judge wrote zero `usage_history` rows — FIXED
`recordClassifierUsage` (`open-sse/services/combo.js:1490`) fires on **every** terminal path: success (`1688`), HTTP error (`1614`), exception (`1701`). Row carries provider, model (`jev-latest`), endpoint pathname `/v1/systemone` (groupable — satisfies the `GROUP BY endpoint` gate), status (`ok` / `error_429` / `error_503` / `error_timeout` / `error_network`), `prompt_tokens` + `completion_tokens` from `data?.usage` (zero-filled when absent), `meta.callKind = "classifier"`, `meta.isStream = false`, latency. Probes (`isTestRequest`) and `recordUsage: false` never write. Judge escalation passes `{ callKind: "judge" }` through `handleSingleModel`; `src/sse/handlers/chat.js:309-314` copies `opts.callKind` into `clientRawRequest.callKind` so `saveUsageStats` stamps `meta.callKind = "judge"`.

### [MEDIUM] `meta jsonb` scalar/array rows break `jsonb_object_keys` — FIXED
`normalizeMetaObject` (`src/lib/db/repos/usageRepo.js:82`) coerces scalar/array/string meta to `{}` before the `::jsonb` insert; `saveUsageStats` (`open-sse/handlers/chatCore/requestDetail.js:107`) accepts a `meta: extraMeta` object and merges `callKind`/`status`/`error` in.

### [MEDIUM] Non-ok statuses counted as successes in `usage_daily` — FIXED
`saveRequestUsage` derived `failed` from the entry: `entry.failed === true || (status ∉ {"ok","success"})` (`src/lib/db/repos/usageRepo.js:774-775`). Previously `failed: false` was hardcoded, so an `error_429` classifier row carried the right status in `usage_history` but incremented the *success* counter in `usage_daily`. `flushUsageQueue` already routed `failed` items to `applyFailedToDay`; no other change needed.

### [LOW] Capability cores had no proxy parameter at all — FIXED
`proxyOptions` plumbed (null = direct egress, same as before) through: `embeddingsCore.js:24`, `imageGenerationCore.js:41`, `videoCore.js:96`, `search/index.js:156`, `search/chatSearch.js:507`, `fetch/index.js:94`, `sttCore.js`, `ttsCore.js:51`, `ttsProviders/index.js:32` (+ 11 TTS adapters), image polling (`nanobanana`, `runwayml`, `blackForestLabs`, `falAi`, `cloudflareAi.buildBody`, `_base.urlToBase64`), `vertex.js:resolveProjectId`, `ssrfGuard.fetchPublic(url, init, { proxyOptions })`.

## Coverage table — non-chat upstream calls

`call-kind` | `file:line` (upstream call) | upstream | proxied? | recorded in `usage_history`? | verdict
---|---|---|---|---|---
classifier | `open-sse/services/combo.js:1614-1701` via `proxyAwareFetch` | Jev systemone (`opencode.ai/zen`, `api.typesafe.ai`) | **yes** — `resolveJevProxy`, scope `${provider}::jev`, fail-closed keyless | **yes** — `meta.callKind=classifier`, endpoint `/v1/systemone` | FIXED
judge | `open-sse/services/combo.js:1273` via `handleSingleModel` | judge router model | yes (chat-path proxy, unchanged) | **yes** — `meta.callKind=judge` | FIXED
embedding | `open-sse/handlers/embeddingsCore.js:69` | openai/openrouter/gemini/etc. | **yes** — `resolveCapabilityProxy` (`src/sse/handlers/embeddings.js`) | **yes** — `callKind=embedding` (`src/sse/handlers/embeddings.js:184`) | FIXED
tts | `open-sse/handlers/ttsProviders/genericFormats.js` + 10 adapters via `ttsCore.js:60-67` | openai/elevenlabs/edge-tts/… | **yes** — adapter `proxyOptions` | **yes** — `callKind=tts`, endpoint `/v1/audio/speech` (`src/sse/handlers/tts.js:85,124`) | FIXED
stt | `open-sse/handlers/sttCore.js:47` | deepgram etc. | **yes** — `proxyOptions` | **yes** — `callKind=stt`, endpoint `/v1/audio/transcriptions` (`src/sse/handlers/stt.js:58,97`) | FIXED
image | `open-sse/handlers/imageGenerationCore.js:70` + provider polling (`nanobanana`, `runwayml`, `blackForestLabs`, `falAi`, `cloudflareAi`) | runway/fal/BFL/CF AI | **yes** — core + `urlToBase64(url, proxyOptions)` | **yes** — `callKind=image` (`src/sse/handlers/imageGeneration.js:92,158`) | FIXED
video | `open-sse/handlers/videoCore.js:135` | xAI/unikey | **yes** — `proxyOptions` | **yes** — `callKind=video` (`src/sse/handlers/videoGeneration.js:186,273`) | FIXED
search | `open-sse/handlers/search/chatSearch.js:553`, `search/index.js:104` via `fetchPublic` | provider search APIs | **yes** — `fetchPublic(..., { proxyOptions })` | **yes** — `callKind=search` (`src/sse/handlers/search.js:155,245`) | FIXED
fetch | `open-sse/handlers/fetch/index.js:36` via `proxyAwareFetch` | jina/firecrawl/etc. | **yes** — `proxyOptions` | **yes** — `callKind=fetch` (`src/sse/handlers/fetch.js:155,228`) | FIXED
chat | chatCore handlers | all chat providers | yes (unchanged) | yes (unchanged, `callKind=chat` default) | UNCHANGED

Intentionally direct (control plane / correctness, NOT user-data egress):
- `open-sse/services/tokenRefresh.js:101`, `tokenRefresh/providers.js:509`, `gemini-cli.js:66` — OAuth token endpoints (credential control plane, must not traverse user pools).
- `open-sse/services/projectId.js:165,224` — Google Code Assist onboarding/project lookup (account control plane).
- `open-sse/services/proxyAutoFetcher.js:356` — the proxy-list fetcher itself (pool *source*; routing it through a pool is circular).
- `open-sse/translator/concerns/image.js:99` — SSRF-pinned fetch with custom `Agent` + `redirect: manual`; a proxy would break IP pinning.
- `open-sse/rtk/headroom.js:223` — local compression sidecar (loopback).
- `open-sse/services/{unikey,kiro,cursor,clinepass}Models.js`, `freebuffVersion.js` — model-catalog / version lookups (non-metered control plane).
- All remaining `src/` bare `fetch` — browser dashboard components and Next.js API-route internals, no upstream provider traffic.

## Verification

Unit (DB layer mocked at `@/lib/usageDb.js` — same boundary as the chat path):
- `tests/unit/jev-proxy-routing.test.js` — **7 passed** (proxy forwarding, 429 `Retry-After` cooldown, pool-unfit marking, 400 no-park, fetch/TTS/embeddings plumbing). Fixed during work: `getJevCooldownUntilMs` falsy-not-null assertion, `proxyAwareFetch(url, {}, proxyOptions)` 2nd-arg expectations, openai TTS adapter fixture.
- `tests/unit/classifier-usage-recording.test.js` — **11 passed** (classifier success/zero-usage/429/exception rows, probe suppression, `saveUsageStats` non-chat contract, capability rows).
- `tests/unit/combo-typesafe-jev.test.js` — **13 passed** (judge escalation).
- `tests/unit/embedding-usage-persistence.test.js` — **9 passed** (existing reference suite; `capabilityUsage` keeps `"success"` status to match).
- `tests/unit/empty-stream-response-detection.test.js` — passed (pre-existing stream change in tree).
- Regressions caught and fixed: `embeddingsCore.test.js` mock lacked `proxyAwareFetch` (26 × 502s) — mock now delegates to live global fetch; `image-generation.test.js` — `urlToBase64` `{}` init expectation; `xai-video-handler.test.js` — `model` out of scope in `handleVideoGet` (ReferenceError).

Gate-2 SQL (operator runs on raspi; no production writes from this session):
- `… WHERE model ILIKE '%jev%' OR endpoint ILIKE '%systemone%'` → > 0 once a classification runs (model `jev-latest`, endpoint `/v1/systemone`).
- `GROUP BY endpoint` gains `/v1/systemone`; `meta.callKind` ∈ {chat, classifier, judge, embedding, tts, stt, image, video, search, fetch}.

Build + full suite: see operator-terminal output below (recorded after this report was written).

## Residual risks
- New `callKind` values only appear in `usage_history` after live traffic; Gate-2 counts stay 0 until the first post-deploy classification — expected, not a bug.
- `usage_daily` failed-counts for non-chat kinds start at deploy; historical aggregates unaffected.
- `active-request-write-order` + `sse-usage-stream-topology` fail on a clean tree too (Postgres 28P01 auth + Valkey ECONNREFUSED — local infra, pre-existing, not this change).
