---
name: axonrouter-unified
description: Unified multimodal routing via AxonRouter /v1/unified — single endpoint for text, image, audio, and video with a shared response envelope. Use when the user wants a single API contract for multiple modalities or needs to switch between text/image/audio without changing endpoints.
---

# AxonRouter — Unified Multimodal API

Requires `AXONROUTER_URL` (and `AXONROUTER_KEY` if auth enabled). See https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter/SKILL.md for setup.

> **AxonRouter exclusive** — unified multimodal routing endpoint.

## Endpoint

`POST $AXONROUTER_URL/v1/unified`

Single endpoint that routes to the correct capability based on `mode`.

## Request fields

| Field | Required | Notes |
|---|---|---|
| `mode` | yes | `text` / `image` / `audio` / `video` |
| `model` | yes | provider/model-name or combo name |
| `messages` | mode=text | array of `{role, content}` |
| `prompt` | mode=image,video | generation prompt |
| `input` | mode=audio | text to speak (TTS) |
| `voice` | no | voice ID for audio mode |
| `stream` | no | `true` for text mode streaming |
| `size` | no | image size (e.g. `1024x1024`) |
| `max_tokens` | no | text mode output limit |

## Examples

### Text (Chat)

```bash
curl -X POST $AXONROUTER_URL/v1/unified \
  -H "Authorization: Bearer $AXONROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"mode":"text","model":"openai/gpt-5","messages":[{"role":"user","content":"Hello"}],"stream":false}'
```

### Image Generation

```bash
curl -X POST $AXONROUTER_URL/v1/unified \
  -H "Authorization: Bearer $AXONROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"mode":"image","model":"openai/dall-e-3","prompt":"A futuristic city skyline at sunset"}'
```

### Audio (TTS)

```bash
curl -X POST "$AXONROUTER_URL/v1/unified" \
  -H "Authorization: Bearer $AXONROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"mode":"audio","model":"openai/tts-1","input":"Hello world","voice":"alloy"}' \
  --output speech.mp3
```

JS:

```js
// Text mode
const textRes = await fetch(`${process.env.AXONROUTER_URL}/v1/unified`, {
  method: "POST",
  headers: { "Authorization": `Bearer ${process.env.AXONROUTER_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "text", model: "openai/gpt-5", messages: [{ role: "user", content: "Hi" }] }),
});
const { data } = await textRes.json();
console.log(data.choices[0].message.content);

// Image mode
const imgRes = await fetch(`${process.env.AXONROUTER_URL}/v1/unified`, {
  method: "POST",
  headers: { "Authorization": `Bearer ${process.env.AXONROUTER_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "image", model: "openai/dall-e-3", prompt: "neon city" }),
});
const imgData = await imgRes.json();
console.log(imgData.data.url);
```

## Response envelope

All modes return a unified envelope:

```json
{
  "id": "unified-abc123",
  "mode": "text",
  "model": "openai/gpt-5",
  "provider": "openai",
  "created": 1735000000,
  "data": { ... }
}
```

### `data` by mode

**text**: Same as `/v1/chat/completions` response body (choices, usage).

**image**: Same as `/v1/images/generations` response body (data array with url/b64_json).

**audio**: Raw audio bytes (Content-Type `audio/mp3`) or JSON `{audio, format}` depending on accept header.

## Notes

- Uses the same auth (Bearer API key) as other `/v1/*` endpoints
- Model format: `provider/model-name` or combo name
- Fallback and routing rules apply the same as individual endpoints
- Streaming only supported for `mode: text`
- Useful for agents that need a single endpoint for all modalities
