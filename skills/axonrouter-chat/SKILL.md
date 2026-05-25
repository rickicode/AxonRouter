---
name: axonrouter-chat
description: Chat / code generation via AxonRouter using OpenAI /v1/chat/completions or Anthropic /v1/messages format with streaming + auto-fallback combos. Use when the user wants to ask an LLM, generate code, summarize text, or run prompts through AxonRouter.
---

# AxonRouter — Chat

Requires `AXONROUTER_URL` (and `AXONROUTER_KEY` if auth enabled). See https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter/SKILL.md for setup.

## Endpoints

- `POST $AXONROUTER_URL/v1/chat/completions` — OpenAI format
- `POST $AXONROUTER_URL/v1/messages` — Anthropic format

## Discover

```bash
curl $AXONROUTER_URL/v1/models | jq '.data[].id'
# Per-model metadata (contextWindow, params)
curl "$AXONROUTER_URL/v1/models/info?id=openai/gpt-5"
```

Combos (e.g. `vip`, `my-coding-stack`) auto-fallback through multiple providers.

## OpenAI format

| Field | Required | Notes |
|---|---|---|
| `model` | yes | from `/v1/models` (e.g. `openai/gpt-5`, `cc/claude-opus-4-6`) |
| `messages` | yes | array of `{role, content}` |
| `stream` | no | `true` for SSE streaming |
| `max_tokens` | no | max output tokens |
| `temperature` | no | 0–2 |
| `top_p` | no | nucleus sampling |
| `tools` | no | function calling tools array |
| `tool_choice` | no | `auto` / `none` / specific tool |
| `response_format` | no | `{"type":"json_object"}` for JSON mode |

```bash
curl -X POST $AXONROUTER_URL/v1/chat/completions \
  -H "Authorization: Bearer $AXONROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-5","messages":[{"role":"user","content":"Hi"}],"stream":false}'
```

JS (OpenAI SDK):

```js
import OpenAI from "openai";
const client = new OpenAI({ baseURL: `${process.env.AXONROUTER_URL}/v1`, apiKey: process.env.AXONROUTER_KEY });
const res = await client.chat.completions.create({
  model: "openai/gpt-5",
  messages: [{ role: "user", content: "Hi" }],
  stream: true,
});
for await (const chunk of res) process.stdout.write(chunk.choices[0]?.delta?.content || "");
```

Python (OpenAI SDK):

```python
from openai import OpenAI
import os

client = OpenAI(base_url=f"{os.environ['AXONROUTER_URL']}/v1", api_key=os.environ["AXONROUTER_KEY"])
stream = client.chat.completions.create(
    model="cc/claude-opus-4-6",
    messages=[{"role": "user", "content": "Hi"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
```

## Anthropic format

| Field | Required | Notes |
|---|---|---|
| `model` | yes | e.g. `cc/claude-opus-4-6` |
| `messages` | yes | array of `{role, content}` |
| `max_tokens` | yes | required by Anthropic spec |
| `system` | no | system prompt string |
| `stream` | no | `true` for SSE streaming |

```bash
curl -X POST $AXONROUTER_URL/v1/messages \
  -H "Authorization: Bearer $AXONROUTER_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"cc/claude-opus-4-6","max_tokens":1024,"messages":[{"role":"user","content":"Hi"}]}'
```

## Response shape

OpenAI (`/v1/chat/completions`):
```json
{ "id": "chatcmpl-...", "object": "chat.completion", "model": "openai/gpt-5",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "Hello!" }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 8, "completion_tokens": 2, "total_tokens": 10 } }
```

Streaming (`stream:true`) emits SSE: `data: {"choices":[{"delta":{"content":"..."}}]}\n\n` ... `data: [DONE]\n\n`.

Anthropic (`/v1/messages`):
```json
{ "id": "msg_...", "type": "message", "role": "assistant", "model": "cc/claude-opus-4-6",
  "content": [{ "type": "text", "text": "Hello!" }],
  "stop_reason": "end_turn", "usage": { "input_tokens": 8, "output_tokens": 2 } }
```

## Format translation

AxonRouter auto-translates between formats:
- Send OpenAI format → provider receives native format (Claude, Gemini, etc.)
- Send Anthropic format → provider receives native format
- Response always matches the format you sent

## Provider model prefixes

| Prefix | Provider | Example |
|---|---|---|
| `cc/` | Claude Code (subscription) | `cc/claude-opus-4-6` |
| `cx/` | Codex (subscription) | `cx/gpt-5.2-codex` |
| `gc/` | Gemini CLI (free) | `gc/gemini-3-flash-preview` |
| `gh/` | GitHub Copilot | `gh/gpt-5` |
| `if/` | iFlow (free) | `if/kimi-k2-thinking` |
| `qw/` | Qwen (free) | `qw/qwen3-coder-plus` |
| `kr/` | Kiro (free) | `kr/claude-sonnet-4.5` |
| `glm/` | GLM (cheap) | `glm/glm-4.7` |
| `openai/` | OpenAI API | `openai/gpt-5` |
| `anthropic/` | Anthropic API | `anthropic/claude-opus-4` |
