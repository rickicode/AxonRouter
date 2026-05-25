const REPO = "rickicode/axonrouter";
const BRANCH = "main";
const SKILL_PATH = "skills";

export const SKILLS_REPO_URL = `https://github.com/${REPO}`;
export const SKILLS_LOCAL_BASE = "/api/skills";
export const SKILLS_RAW_BASE = `https://raw.githubusercontent.com/${REPO}/refs/heads/${BRANCH}/${SKILL_PATH}`;
export const SKILLS_BLOB_BASE = `https://github.com/${REPO}/blob/${BRANCH}/${SKILL_PATH}`;

export const SKILLS = [
  {
    id: "axonrouter",
    name: "AxonRouter (Entry)",
    description: "Setup + index of all capabilities. Start here for auth, model discovery, and links to every capability skill.",
    endpoint: null,
    icon: "hub",
    isEntry: true,
  },
  {
    id: "axonrouter-unified",
    name: "Unified Routing API",
    description: "Single multimodal contract for text, image, audio, and future video routing with a shared response envelope.",
    endpoint: "/v1/unified",
    icon: "hub",
    examples: [
      {
        title: "Text",
        payload: {
          mode: "text",
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "Explain the routing decision in one sentence." }]
        }
      },
      {
        title: "Image",
        payload: {
          mode: "image",
          model: "openai/gpt-image-1",
          prompt: "A schematic poster of a multimodal router control plane."
        }
      },
      {
        title: "Audio",
        payload: {
          mode: "audio",
          model: "openai/tts-1",
          input: "Routing checks complete. All primary paths are healthy."
        }
      }
    ],
  },
  {
    id: "axonrouter-chat",
    name: "Chat",
    description: "Chat / code generation via OpenAI or Anthropic format with streaming.",
    endpoint: "/v1/chat/completions",
    icon: "chat",
  },
  {
    id: "axonrouter-image",
    name: "Image Generation",
    description: "Text-to-image via DALL-E, Imagen, FLUX, MiniMax, SDWebUI, and more.",
    endpoint: "/v1/images/generations",
    icon: "image",
  },
  {
    id: "axonrouter-tts",
    name: "Text-to-Speech",
    description: "Speech synthesis via OpenAI, ElevenLabs, Edge, Google, and Deepgram voices.",
    endpoint: "/v1/audio/speech",
    icon: "record_voice_over",
  },
  {
    id: "axonrouter-stt",
    name: "Speech-to-Text",
    description: "Transcribe audio via OpenAI Whisper, Groq, Gemini, Deepgram, AssemblyAI, and more.",
    endpoint: "/v1/audio/transcriptions",
    icon: "mic",
  },
  {
    id: "axonrouter-embeddings",
    name: "Embeddings",
    description: "Vectors for RAG and semantic search via OpenAI, Gemini, Mistral, and others.",
    endpoint: "/v1/embeddings",
    icon: "scatter_plot",
  },
  {
    id: "axonrouter-web-search",
    name: "Web Search",
    description: "Search via Tavily, Exa, Brave, Serper, SearXNG, and related providers.",
    endpoint: "/v1/search",
    icon: "search",
  },
  {
    id: "axonrouter-web-fetch",
    name: "Web Fetch",
    description: "Fetch URL content as markdown/text/HTML via Firecrawl, Jina, Tavily, and Exa.",
    endpoint: "/v1/web/fetch",
    icon: "language",
  },
];

export function getSkillLocalUrl(id: string) {
  return `${SKILLS_LOCAL_BASE}/${id}`;
}

export function getSkillRawUrl(id) {
  return `${SKILLS_RAW_BASE}/${id}/SKILL.md`;
}

export function getSkillBlobUrl(id) {
  return `${SKILLS_BLOB_BASE}/${id}/SKILL.md`;
}
