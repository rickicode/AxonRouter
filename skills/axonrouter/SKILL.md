---
name: axonrouter
description: Entry point for AxonRouter — local/remote AI gateway with OpenAI-compatible REST for chat, image, TTS, STT, embeddings, web search, web fetch, and unified multimodal routing. Use when the user mentions AxonRouter, AXONROUTER_URL, or wants AI without writing provider boilerplate. This skill covers setup + indexes capability skills; fetch the relevant capability SKILL.md from the URLs below when needed.
---

# AxonRouter

Local/remote AI gateway exposing OpenAI-compatible REST. One key, many providers, auto-fallback.

## Setup

```bash
export AXONROUTER_URL="http://localhost:12711"      # or VPS / tunnel URL
export AXONROUTER_KEY="sk-..."                      # from Dashboard → Keys (only if requireApiKey=true)
```

All requests: `${AXONROUTER_URL}/v1/...` with header `Authorization: Bearer ${AXONROUTER_KEY}` (omit if auth disabled).

Verify: `curl $AXONROUTER_URL/api/health` → `{"ok":true}`

## Discover models

```bash
curl $AXONROUTER_URL/v1/models                  # chat/LLM (default)
curl $AXONROUTER_URL/v1/models/image            # image-gen
curl $AXONROUTER_URL/v1/models/tts              # text-to-speech
curl $AXONROUTER_URL/v1/models/embedding        # embeddings
curl $AXONROUTER_URL/v1/models/web              # web search + fetch (entries have `kind` field)
curl $AXONROUTER_URL/v1/models/stt              # speech-to-text
curl $AXONROUTER_URL/v1/models/image-to-text    # vision
```

Use `data[].id` as `model` field in requests. Combos appear with `owned_by:"combo"`.

Per-model metadata (contextWindow, params, capabilities):
```bash
curl "$AXONROUTER_URL/v1/models/info?id=openai/gpt-5"
```

Response shape:
```json
{ "object": "list", "data": [
  { "id": "openai/gpt-5", "object": "model", "owned_by": "openai", "created": 1735000000 },
  { "id": "tavily/search", "object": "model", "kind": "webSearch", "owned_by": "tavily", "created": 1735000000 }
]}
```

## Capability skills

When the user needs a specific capability, fetch that skill's `SKILL.md` from its raw URL:

| Capability | Raw URL |
|---|---|
| Chat / code-gen | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter-chat/SKILL.md |
| Image generation | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter-image/SKILL.md |
| Text-to-speech | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter-tts/SKILL.md |
| Speech-to-text | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter-stt/SKILL.md |
| Embeddings | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter-embeddings/SKILL.md |
| Web search | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter-web-search/SKILL.md |
| Web fetch (URL → markdown) | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter-web-fetch/SKILL.md |
| Unified multimodal | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter-unified/SKILL.md |

## Combos (auto-fallback chains)

Combos chain multiple providers with automatic fallback. Create via Dashboard → Combos.

```bash
# List combos
curl $AXONROUTER_URL/v1/models | jq '.data[] | select(.owned_by=="combo") | .id'
```

Use combo name as `model` in any request — AxonRouter tries each provider in order until one succeeds.

## Errors

- 401 → set/refresh `AXONROUTER_KEY` (Dashboard → Keys)
- 400 `Invalid model format` → check `model` exists in `/v1/models/<kind>`
- 503 `All accounts unavailable` → wait `retry-after` or add another provider account
- 429 → rate limited; combo auto-fallback will try next provider

## Dashboard

Access at `${AXONROUTER_URL}/dashboard` for:
- Provider management (OAuth + API key)
- Combo creation and editing
- Usage analytics and quota tracking
- Custom skills editor
- API key management
