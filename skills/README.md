# AxonRouter — Agent Skills

Drop-in skills for any AI agent (Claude, Cursor, ChatGPT, custom SDK). Just **copy a link** below and paste it to your AI — it will fetch the skill and use AxonRouter for you.

> Tip: start with the **axonrouter** entry skill — it covers setup and links to all capability skills.

## Skills

| Capability | Copy link below and paste to your AI |
|---|---|
| **Entry / Setup** (start here) | https://raw.githubusercontent.com/rickicode/AxonRouter/main/skills/axonrouter/SKILL.md |
| Chat / code-gen | https://raw.githubusercontent.com/rickicode/AxonRouter/main/skills/axonrouter-chat/SKILL.md |
| Image generation | https://raw.githubusercontent.com/rickicode/AxonRouter/main/skills/axonrouter-image/SKILL.md |
| Video generation (xAI Grok Imagine) | https://raw.githubusercontent.com/rickicode/AxonRouter/main/skills/axonrouter-video/SKILL.md |
| Text-to-speech | https://raw.githubusercontent.com/rickicode/AxonRouter/main/skills/axonrouter-tts/SKILL.md |
| Speech-to-text | https://raw.githubusercontent.com/rickicode/AxonRouter/main/skills/axonrouter-stt/SKILL.md |
| Embeddings | https://raw.githubusercontent.com/rickicode/AxonRouter/main/skills/axonrouter-embeddings/SKILL.md |
| Web search | https://raw.githubusercontent.com/rickicode/AxonRouter/main/skills/axonrouter-web-search/SKILL.md |
| Web fetch (URL → markdown) | https://raw.githubusercontent.com/rickicode/AxonRouter/main/skills/axonrouter-web-fetch/SKILL.md |

## How to use

Paste to your AI (Claude, Cursor, ChatGPT, …):

```
Read this skill and use it: https://raw.githubusercontent.com/rickicode/AxonRouter/main/skills/axonrouter/SKILL.md
```

Then ask normally — *"generate an image of a cat"*, *"transcribe this URL"*, etc.

## Configure your shell once

```bash
export AXONROUTER_URL="http://localhost:3778"   # local default, or your VPS / tunnel URL
export AXONROUTER_KEY="sk-..."                   # from Dashboard → Keys (only if requireApiKey=true)
```

Verify: `curl $AXONROUTER_URL/api/health` → `{"ok":true}`.

## Links

- Source: https://github.com/rickicode/AxonRouter
- Dashboard: https://axonrouter.com
