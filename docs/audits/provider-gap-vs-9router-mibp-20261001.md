# Provider-Surface Gap: AxonRouter vs `9router-mibp-version`

**Date:** 2026-10-01
**Scope:** Provider surface only (registry / executors / usage fetchers). MITM, transport, and dashboard subsystems are out of scope by policy — AxonRouter will not adopt MITM.
**Repos:** `/workspaces/AxonRouter` (`39f4e4e`, main, v0.1.4) vs `/workspaces/9router-mibp-version` (`67c9c5bc`, master, v1.0.17)
**Method:** path-set comparison of both trees, then semantic verification per candidate. Git histories are **unrelated** (`git cat-file -e 67c9c5bc` fails in A, and vice-versa) — no merge/cherry-pick is possible; every port is manual.

---

## 1. Real gaps (present in B, absent or stale in A)

### 1.1 `freebuff` catalog stale — A pinned 2026-09-07, upstream moved to 2026-09-25

A's `open-sse/providers/registry/freebuff.js` still ships the 2026-09-07 picker; upstream (B, commit `67c9c5bc`) synced 2026-09-25. **A also pins two model ids the upstream retired.**

| wire id | A | B | note |
|---|---|---|---|
| `openai/gpt-5.6-luna` | ✅ listed | — | **WITHDRAWN upstream 2026-09-22, PAUSED 2026-09-24** |
| `openai/gpt-6-luna` | ❌ | ✅ | replacement, same slot / flex lane |
| `anthropic/claude-fable-5` | ✅ listed | — | **superseded by 5.1** |
| `anthropic/claude-fable-5.1` | ❌ | ✅ | |
| `upstage/solar-mini4` | ❌ | ✅ | joined 2026-09-23 |
| `stealth/space-bunny-alpha` | ❌ | ✅ | joined 2026-09-23 (beta stealth row) |

A also **mislabels** two models whose wire id is unchanged but whose build changed: `deepseek/deepseek-v4-flash` now serves DeepSeek V4.1 Flash (A already labels it V4.1 — correct), and `mimo/mimo-v2.5` now serves **MiMo 2.6 Flash** (A labels it "MiMo 2.5" — stale).

Companion code that must move **in lockstep** — a registry-only edit leaves dead references:

| file | A | B | change |
|---|---|---|---|
| `open-sse/executors/freebuff.js` `FREE_ROOT_AGENT_BY_MODEL` | L125 | L126 | add `gpt-6-luna`→`base3-free-luna-6`, `solar-mini4`, `space-bunny-alpha`; swap `fable-5`→`fable-5.1` |
| `open-sse/executors/freebuff.js` `OFFER_GATED_MODELS` | L59 | L52 | `"anthropic/claude-fable-5"` → `"anthropic/claude-fable-5.1"` |
| `open-sse/providers/registry/freebuff.js` `retry.429` | `{attempts:0}` | `{attempts:2,delayMs:2000}` | A disables 429 retry; B retries |
| registry comment block | L66 | L66 | document `off_peak_only` on `deepseek-v4-flash` (closed ~00:00–10:00 UTC daily) |

Risk if only the registry is ported: `OFFER_GATED_MODELS` keeps gating the dead `fable-5` wire id, so the Fable wave trial never claims, and `gpt-6-luna` falls through `rootAgentIdForModel()` to `base2-free` (wrong root agent → the session claim is rejected upstream).

### 1.2 OpenCode Zen — free-tier model + `opencodeFingerprint` missing

- A's `opencode-zen.js` lacks **`mimo-v2.6-flash-free`** (B L109). A ships `mimo-v2.5-free` only.
- A lacks `open-sse/utils/opencodeFingerprint.js` entirely (B-only file). It is wired in B across **5 call sites**: `executors/opencode.js`, `translator/index.js`, `handlers/chatCore.js`, `handlers/chatCore/nonStreamingHandler.js`, `handlers/chatCore/sseToJsonHandler.js`. This is the tool-name cloak/restore layer for OpenCode; it is a translation-pipeline feature, not registry-only.
- A also lacks `open-sse/services/usage/opencode-zen.js` (Zen quota fetcher). Note B's copy is present in the tree but has **no importer** (`grep -rn "opencode-zen" services/usage/index.js` → empty in both), so porting it would need the wiring added too.
- A is ahead elsewhere in Zen: it lists `muse-spark-1.3-contributor-free` and has the **Jev/System One** lane (`targetFormat: systemone`) which B lacks.

### 1.3 `qoder-cn` (Qoder CN) — absent

B ships `open-sse/providers/registry/qoder-cn.js` (alias `qdcn`, OAuth + PAT, `https://gateway.qoder.com.cn/...`, usage `https://openapi.qoder.com.cn/api/v2/quota/usage`) plus `src/lib/oauth/providers/qoder-cn.js`. A has neither; A's `qoder.js` is the global `.com` provider only. A does have `open-sse/services/qoderModels.js`.

### 1.4 `grok-web` (cookie auth) — absent

B ships `registry/grok-web.js` + `executors/grok-web.js`: `authType: "cookie"`, pastes the `sso=` cookie from grok.com, transport format `grok-web`. A **does** support `authType: "cookie"` already (`perplexity-web`), so the machinery exists — this is a new provider, not a new auth class.

### 1.5 `xiaomi-mimo` desktop login + multi-region clusters — partially behind

- A lacks `src/lib/mimoLoginSession.js` (B's **server-assisted** desktop login handshake). A relies on the user already holding a MiMo Desktop passToken (`open-sse/shared/mimoAccount.js`).
- A's registry has **no `regions` block**; B declares five clusters (`cn`/`sgp`/`ams`/`ru`/`in`, host `mimo-server-<code>.xiaomimimo.com`). A hardcodes `mimo-server-cn`.
- A's dashboard also lacks the MiMo login modal rewrite (~445 lines in B).

### 1.6 Adjacent (not provider-registry, flagged for completeness)

`open-sse/services/compact.js` (context compaction) and `utils/opencodeFingerprint.js` are B-only services. `compact.js` is transport-side, not provider-side — deferred unless requested.

---

## 2. False positives — verified NOT gaps

| B-only artifact | Verdict |
|---|---|
| `registry/morph.js` (alias `morphllm`) | **A superset.** A's `registry/morphllm.js` is the same provider, richer: two transports (openai + claude), 6 current models, alias `["mrp","morph"]`. Nothing to port. |
| `registry/mmf.js` | Dead duplicate. Same baseUrl as `mimo-free`, `hidden: true`, no models worth carrying. |
| `registry/mimo-free.js` + `executors/mimo-free.js` | Upstream **ended** ("MiMo free API service has ended"), `hidden: true` in B. Not worth porting. |
| `executors/devin-cli.js` (`baseUrl: devin://acp/stdio`) | Local ACP **stdio** transport — it shells out to the Devin CLI over stdio. Not viable for AxonRouter's hosted Hono gateway; reclassify as won't-port unless a hosted variant appears. |
| `xiaomi-mimo` | A is **ahead** (dual-route + Desktop Preview models). Only the login/regions items in §1.5 apply. |

---

## 3. Where A is ahead (no action)

- **18 providers A-only:** `tokenharbor`, `unikey`, `kilocode-free`, `orcarouter`, `ovhcloud`(+`-free`), `llmtech`(+`-free`), `morphllm`, `workbuddy`, `typesafe`, `atria-asi`, `bai`, `beatapi`, `cline-free`, `llm7-free`, `vlmrun`, `ui` (+6 executors).
- Jev/System One rebuilt registry-driven (`jevChain.js`, `jevModels.js`, `jevUpstream.js`, `coreModelCombos.js`) — B has none.
- Zen Jev lane + `muse-spark-1.3-contributor-free`.

Counts: A 138 registry / 35 executors; B 126 / 32.

---

## 4. Recommended port order

1. **freebuff catalog** — **DONE (2026-10-01).** Registry + executor + `ui.js` projection + tests landed together; see the change list at the end of this section.
2. **OpenCode Zen `mimo-v2.6-flash-free`** (one-line registry add) — then decide separately on `opencodeFingerprint` (bigger, pipeline-wide).
3. **`grok-web`** (cookie machinery already exists).
4. **`qoder-cn`** (registry + oauth provider + executor region awareness).
5. **`xiaomi-mimo` login/regions** (largest; touches modal + new session lib).

Skip: `devin-cli`, `mimo-free`, `mmf`, `morph.js`.

### 4.1 Items still open

- `opencodeFingerprint` — 5 call sites across translator/chatCore; separate decision from the one-line `mimo-v2.6-flash-free` add.
- `devin-cli` — needs a decision: it is a stdio ACP transport (`devin://acp/stdio`), not viable for a hosted gateway.
- `qoder-cn`, `grok-web`, `xiaomi-mimo` login/regions — not started.

---

### 4.2 Port #1 landed — change list

Shipped under v0.1.4 (no version bump; matches the repo's pattern where a release commit carries the CHANGELOG section).

| file | change |
|---|---|
| `open-sse/providers/registry/freebuff.js` | models → 2026-09-25 picker (gpt-6-luna, solar-mini4, space-bunny-alpha, fable-5.1; drop gpt-5.6-luna, fable-5); relabel `mimo/mimo-v2.5` → MiMo 2.6 Flash; `retry.429` 0→2 attempts; notice text (off-peak, ToS) |
| `open-sse/executors/freebuff.js` | `OFFER_GATED_MODELS` → `claude-fable-5.1`; `FREE_ROOT_AGENT_BY_MODEL` + gpt-6-luna/solar-mini4/space-bunny-alpha, fable re-keyed |
| `open-sse/providers/registry/ui.js` | freebuff projection regenerated by hand (comment explicitly forbids it — regenerate tooling absent; verified byte-equal to registry models via a parity check) |
| `tests/unit/freebuff-provider.test.js` | root-agent assertions refreshed + two new tests: every registry row resolves to a `base3-free-*` root, and the withdrawn luna/fable wire ids are absent |
| `tests/unit/freebuff-usage.test.js` | fixture + assertion moved to `openai/gpt-6-luna` |
| `src/sse/services/auth.js`, `open-sse/services/proxyPoolFitness.js`, `ProxyFitnessTab.js` | stale doc-comment examples refreshed to a live model id |

Verification: `freebuff-{provider,usage,model-assignment,limited-tier}` + `param-support` → 87 tests green; `npm run build` clean; built bundle carries `gpt-6-luna`/`claude-fable-5.1`/`solar-mini4`/`space-bunny-alpha`.

Known follow-up: the `ui.js` projection has no generator in-tree; hand edits are required until one is written (or `migrate-registry.mjs` is extended).

---

## 5. Verification plan per port

- Extend/refresh `tests/unit/freebuff-provider.test.js` + `freebuff-usage.test.js` — B already updated both; assert the exact model-id set and `FREE_ROOT_AGENT_BY_MODEL` coverage for every listed id (a listed id with no root agent is the failure mode).
- `tests/__baseline__/providers-baseline.json` — regenerate and diff; it will change for any registry add.
- `npm test` (`cd tests && npx vitest run`) — must stay green; 401 existing test files in A.
