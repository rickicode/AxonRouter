# AxonRouter — Agent Skills

Drop-in skills for any AI agent (Claude, Cursor, ChatGPT, Kiro, Codex, custom SDK). Just **copy a link** below and paste it to your AI — it will fetch the skill and use AxonRouter for you.

> Tip: start with the **axonrouter** entry skill — it covers setup and links to all capability skills.

## Skills

| Capability | Copy link below and paste to your AI |
|---|---|
| **Entry / Setup** (start here) | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter/SKILL.md |
| Chat / code-gen | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter-chat/SKILL.md |
| Image generation | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter-image/SKILL.md |
| Text-to-speech | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter-tts/SKILL.md |
| Speech-to-text | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter-stt/SKILL.md |
| Embeddings | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter-embeddings/SKILL.md |
| Web search | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter-web-search/SKILL.md |
| Web fetch (URL → markdown) | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter-web-fetch/SKILL.md |
| Unified multimodal | https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter-unified/SKILL.md |

## How to use

Paste to your AI (Claude, Cursor, ChatGPT, Kiro, Codex, …):

```
Read this skill and use it: https://raw.githubusercontent.com/rickicode/axonrouter/refs/heads/main/skills/axonrouter/SKILL.md
```

Then ask normally — *"generate an image of a cat"*, *"transcribe this URL"*, *"search the web for..."*, etc.

## Configure your shell once

```bash
export AXONROUTER_URL="http://localhost:12711"   # local default, or your VPS / tunnel URL
export AXONROUTER_KEY="sk-..."                   # from Dashboard → Keys (only if requireApiKey=true)
```

Verify: `curl $AXONROUTER_URL/api/health` → `{"ok":true}`.

## Local skill serving

AxonRouter also serves skills via its built-in API:

```
GET http://localhost:12711/api/skills/axonrouter          → entry skill markdown
GET http://localhost:12711/api/skills/axonrouter-chat     → chat skill markdown
GET http://localhost:12711/api/skills/<slug>              → any built-in or custom skill
```

Create custom skills in Dashboard → Skills → Custom Skills.

## Links

- Source: https://github.com/rickicode/axonrouter
- Dashboard: https://axonrouter.com
