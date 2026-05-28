// Provider definitions
// TypeScript types for provider categorization

export type ServiceKind = "llm" | "embedding" | "tts" | "stt" | "image" | "imageToText" | "webSearch" | "webFetch" | "video" | "music";

export type RiskNoticeVariant = "info" | "warning" | "danger";

export interface ProviderRiskNoticeFields {
  text: string;
  apiKeyUrl?: string;
  variant?: RiskNoticeVariant;
}

export interface ProviderDefinition {
  id: string;
  alias: string;
  name: string;
  icon: string;
  color: string;
  textIcon?: string;
  website?: string;
  notice?: ProviderRiskNoticeFields;
  serviceKinds?: string[];
  deprecated?: boolean;
  deprecationNotice?: string;
  noAuth?: boolean;
  passthroughModels?: boolean;
  hidden?: boolean;
  hiddenKinds?: string[];
  systemManaged?: boolean;
  readOnly?: boolean;
  hiddenConfigInProviders?: boolean;
  providerSurface?: string;
  managedBy?: string;
  authType?: string;
  authHint?: string;
  hasProviderSpecificData?: boolean;
  thinkingConfig?: any;
  sttConfig?: any;
  modelsFetcher?: any;
  [key: string]: any;
}

// Free Providers (kiro first, iflow last)
export const FREE_PROVIDERS = {
  kiro: { id: "kiro", alias: "kr", name: "Kiro AI", icon: "psychology_alt", color: "#FF6B35" },
  "amazon-q": {
    id: "amazon-q",
    alias: "aq",
    name: "Amazon Q",
    icon: "cloud",
    color: "#FF9900",
    textIcon: "AQ",
    website: "https://aws.amazon.com/q/developer/",
    authHint: "Uses the same AWS Builder ID or imported refresh-token flow as Kiro, but keeps Amazon Q connections separate.",
  },
  qwen: { id: "qwen", alias: "qw", name: "Qwen Code", icon: "psychology", color: "#10B981", deprecated: true, deprecationNotice: "Qwen OAuth free tier was discontinued by Alibaba on 2026-04-15. New connections will not work." },
  "gemini-cli": { id: "gemini-cli", alias: "gc", name: "Gemini CLI", icon: "terminal", color: "#4285F4", deprecated: true, deprecationNotice: "Gemini CLI is designed exclusively for Gemini CLI. Using it with other tools (OpenClaw, Claude, Codex...) may result in account restrictions or bans." },
  iflow: { id: "iflow", alias: "if", name: "iFlow AI", icon: "water_drop", color: "#6366F1" },
  opencode: { id: "opencode", alias: "oc", name: "OpenCode Free", icon: "terminal", color: "#E87040", textIcon: "OC", noAuth: true, modelsFetcher: { url: "https://opencode.ai/zen/v1/models", type: "opencode-free" } },
};

// Free Tier Providers (has free access but may require account/API key)
export const FREE_TIER_PROVIDERS = {
  openrouter: { id: "openrouter", alias: "openrouter", name: "OpenRouter", icon: "router", color: "#F97316", textIcon: "OR", website: "https://openrouter.ai", notice: { text: "Free tier: 27+ free models, no credit card needed, 200 req/day. After 0 credit: 1,000 req/day.", apiKeyUrl: "https://openrouter.ai/settings/keys" }, passthroughModels: true, serviceKinds: ["llm", "embedding", "tts", "imageToText"], apiKeyCompatible: true },
  nvidia: { id: "nvidia", alias: "nvidia", name: "NVIDIA NIM", icon: "developer_board", color: "#76B900", textIcon: "NV", website: "https://developer.nvidia.com/nim", notice: { text: "Free access for NVIDIA Developer Program members (prototyping & testing).", apiKeyUrl: "https://build.nvidia.com/settings/api-keys" }, serviceKinds: ["llm", "stt"], sttConfig: { format: "nvidia-asr", authType: "apiKey", baseUrl: "https://integrate.api.nvidia.com/v1/audio/transcriptions", authHeader: "bearer" }, apiKeyCompatible: true },
  ollama: { id: "ollama", alias: "ollama", name: "Ollama Cloud", icon: "cloud", color: "#ffffffff", textIcon: "OL", website: "https://ollama.com", notice: { text: "Free tier: light usage, 1 cloud model at a time (limits reset every 5h & 7d). Pro 0/mo. Max 00/mo.", apiKeyUrl: "https://ollama.com/settings/keys" } },
  vertex: { id: "vertex", alias: "vx", name: "Vertex AI", icon: "cloud", color: "#4285F4", textIcon: "VX", website: "https://cloud.google.com/vertex-ai", notice: { text: "New Google Cloud accounts get 00 free credits. Requires GCP project + Service Account with Vertex AI API enabled.", apiKeyUrl: "https://console.cloud.google.com/iam-admin/serviceaccounts" } },
  gemini: { id: "gemini", alias: "gemini", name: "Gemini", icon: "diamond", color: "#4285F4", textIcon: "GE", website: "https://ai.google.dev", serviceKinds: ["llm", "embedding", "image", "imageToText", "webSearch", "stt", "tts"], sttConfig: { format: "gemini-stt", authType: "apiKey", baseUrl: "https://generativelanguage.googleapis.com/v1beta/models", authHeader: "bearer" } },
  freebuff: { id: "freebuff", alias: "fb", name: "Freebuff", icon: "terminal", color: "#06B6D4", textIcon: "FB", website: "https://www.codebuff.com", notice: { text: "Auth via freebuff CLI. Import detected credentials from ~/.config/manicode/credentials.json or paste the full JSON." }, hasProviderSpecificData: true, serviceKinds: ["llm"] },
};

// Thinking config definitions
export const THINKING_CONFIG = {
  extended: {
    options: ["auto", "on", "off"],
    defaultMode: "auto",
    defaultBudgetTokens: 10000
  },
  effort: {
    options: ["auto", "none", "low", "medium", "high"],
    defaultMode: "auto"
  }
};

// OAuth Providers
export const OAUTH_PROVIDERS = {
  claude: { id: "claude", alias: "cc", name: "Claude Code", icon: "smart_toy", color: "#D97757" },
  antigravity: { id: "antigravity", alias: "ag", name: "Antigravity", icon: "rocket_launch", color: "#F59E0B", deprecated: true, deprecationNotice: "AG is designed exclusively for Antigravity IDE. Using it with other tools (OpenClaw, Claude, Codex...) may result in account restrictions or bans." },
  codex: { id: "codex", alias: "cx", name: "OpenAI Codex", icon: "code", color: "#3B82F6", thinkingConfig: THINKING_CONFIG.effort },
  github: { id: "github", alias: "gh", name: "GitHub Copilot", icon: "code", color: "#333333" },
  cursor: { id: "cursor", alias: "cu", name: "Cursor IDE", icon: "edit_note", color: "#00D4AA" },
  kilocode: { id: "kilocode", alias: "kc", name: "Kilo Code", icon: "code", color: "#FF6B35", textIcon: "KC" },
  cline: { id: "cline", alias: "cl", name: "Cline", icon: "smart_toy", color: "#5B9BD5", textIcon: "CL" },
};

export const MORPH_MANAGED_PROVIDER_ID = "morph-fast";
export const MORPH_MANAGED_PROVIDER = {
  id: MORPH_MANAGED_PROVIDER_ID,
  alias: "morph",
  name: "Morph Fast Models",
  icon: "bolt",
  color: "#FF5B99",
  textIcon: "MP",
  website: "https://morphllm.com",
  passthroughModels: true,
  serviceKinds: ["llm", "embedding"],
  managedBy: "morph",
  systemManaged: true,
  readOnly: true,
  hiddenConfigInProviders: true,
  providerSurface: "morph-fast-models",
};

export const APIKEY_PROVIDERS = {
  [MORPH_MANAGED_PROVIDER_ID]: MORPH_MANAGED_PROVIDER,
  commandcode: { id: "commandcode", alias: "ccmd", name: "Command Code", icon: "terminal", color: "#6366F1", textIcon: "CC", website: "https://commandcode.ai", passthroughModels: true, serviceKinds: ["llm"], apiKeyCompatible: true },
  glm: { id: "glm", alias: "glm", name: "GLM Coding", icon: "code", color: "#2563EB", textIcon: "GL", website: "https://open.bigmodel.cn", apiKeyCompatible: true },
  "glm-cn": { id: "glm-cn", alias: "glm-cn", name: "GLM (China)", icon: "code", color: "#DC2626", textIcon: "GC", website: "https://open.bigmodel.cn", apiKeyCompatible: true },
  kimi: { id: "kimi", alias: "kimi", name: "Kimi", icon: "psychology", color: "#1E3A8A", textIcon: "KM", website: "https://kimi.moonshot.cn", serviceKinds: ["llm", "webSearch"], apiKeyCompatible: true },
  minimax: { id: "minimax", alias: "minimax", name: "Minimax Coding", icon: "memory", color: "#7C3AED", textIcon: "MM", website: "https://www.minimaxi.com", serviceKinds: ["llm", "image", "imageToText", "webSearch"], apiKeyCompatible: true },
  "minimax-cn": { id: "minimax-cn", alias: "minimax-cn", name: "Minimax (China)", icon: "memory", color: "#DC2626", textIcon: "MC", website: "https://www.minimaxi.com", apiKeyCompatible: true },
  alicode: { id: "alicode", alias: "alicode", name: "Alibaba", icon: "cloud", color: "#FF6A00", textIcon: "ALi", apiKeyCompatible: true },
  "alicode-intl": { id: "alicode-intl", alias: "alicode-intl", name: "Alibaba Intl", icon: "cloud", color: "#FF6A00", textIcon: "ALi", apiKeyCompatible: true },
  "volcengine-ark": { id: "volcengine-ark", alias: "ark", name: "Volcengine Ark", icon: "cloud", color: "#1677FF", textIcon: "ARK", website: "https://ark.cn-beijing.volces.com", apiKeyCompatible: true },
  openai: { id: "openai", alias: "openai", name: "OpenAI", icon: "auto_awesome", color: "#10A37F", textIcon: "OA", website: "https://platform.openai.com", serviceKinds: ["llm", "embedding", "tts", "image", "imageToText", "webSearch", "stt"], thinkingConfig: THINKING_CONFIG.effort, sttConfig: { format: "openai", authType: "apiKey", baseUrl: "https://api.openai.com/v1/audio/transcriptions", authHeader: "bearer" }, apiKeyCompatible: true },
  anthropic: { id: "anthropic", alias: "anthropic", name: "Anthropic", icon: "smart_toy", color: "#D97757", textIcon: "AN", website: "https://console.anthropic.com", serviceKinds: ["llm", "imageToText"], apiKeyCompatible: true },
  azure: { id: "azure", alias: "azure", name: "Azure OpenAI", icon: "cloud", color: "#0078D4", textIcon: "AZ", website: "https://azure.microsoft.com/en-us/products/ai-services/openai-service", hasProviderSpecificData: true },
  "opencode-go": { id: "opencode-go", alias: "ocg", name: "OpenCode Go", icon: "terminal", color: "#E87040", textIcon: "OC", website: "https://opencode.ai/auth", apiKeyCompatible: true, notice: { text: "OpenCode Go subscription: /mo (then 0/mo). Access to Kimi, GLM, Qwen, MiMo, MiniMax models.", apiKeyUrl: "https://opencode.ai/auth" } },
  "opencode-zen": { id: "opencode-zen", alias: "ocz", name: "OpenCode Zen", icon: "terminal", color: "#E87040", textIcon: "OC", website: "https://opencode.ai/auth", passthroughModels: true, apiKeyCompatible: true, modelsFetcher: { url: "https://opencode.ai/zen/v1/models", type: "opencode-zen" }, notice: { text: "OpenCode Zen: full access to all 43+ models (Claude, GPT, Gemini, etc.) with API key.", apiKeyUrl: "https://opencode.ai/auth" } },

  deepseek: { id: "deepseek", alias: "ds", name: "DeepSeek", icon: "bolt", color: "#4D6BFE", textIcon: "DS", website: "https://deepseek.com", apiKeyCompatible: true },
  groq: { id: "groq", alias: "groq", name: "Groq", icon: "speed", color: "#F55036", textIcon: "GQ", website: "https://groq.com", serviceKinds: ["llm", "imageToText", "stt"], sttConfig: { format: "openai", authType: "apiKey", baseUrl: "https://api.groq.com/openai/v1/audio/transcriptions", authHeader: "bearer" }, apiKeyCompatible: true },
  xai: { id: "xai", alias: "xai", name: "xAI (Grok)", icon: "auto_awesome", color: "#1DA1F2", textIcon: "XA", website: "https://x.ai", serviceKinds: ["llm", "imageToText", "webSearch"], apiKeyCompatible: true },
  mistral: { id: "mistral", alias: "mistral", name: "Mistral", icon: "air", color: "#FF7000", textIcon: "MI", website: "https://mistral.ai", serviceKinds: ["llm", "imageToText"], apiKeyCompatible: true },
  perplexity: { id: "perplexity", alias: "pplx", name: "Perplexity", icon: "search", color: "#20808D", textIcon: "PP", website: "https://www.perplexity.ai", serviceKinds: ["llm", "webSearch"], apiKeyCompatible: true },
  together: { id: "together", alias: "together", name: "Together AI", icon: "group_work", color: "#0F6FFF", textIcon: "TG", website: "https://www.together.ai", apiKeyCompatible: true },
  fireworks: { id: "fireworks", alias: "fireworks", name: "Fireworks AI", icon: "local_fire_department", color: "#7B2EF2", textIcon: "FW", website: "https://fireworks.ai", apiKeyCompatible: true },
  cerebras: { id: "cerebras", alias: "cerebras", name: "Cerebras", icon: "memory", color: "#FF4F00", textIcon: "CB", website: "https://www.cerebras.ai", apiKeyCompatible: true },
  cohere: { id: "cohere", alias: "cohere", name: "Cohere", icon: "hub", color: "#39594D", textIcon: "CO", website: "https://cohere.com", apiKeyCompatible: true },
  nebius: { id: "nebius", alias: "nebius", name: "Nebius AI", icon: "cloud", color: "#6C5CE7", textIcon: "NB", website: "https://nebius.com", apiKeyCompatible: true },
  siliconflow: { id: "siliconflow", alias: "siliconflow", name: "SiliconFlow", icon: "cloud_queue", color: "#5B6EF5", textIcon: "SF", website: "https://cloud.siliconflow.com", apiKeyCompatible: true },
  hyperbolic: { id: "hyperbolic", alias: "hyp", name: "Hyperbolic", icon: "bolt", color: "#00D4FF", textIcon: "HY", website: "https://hyperbolic.xyz", apiKeyCompatible: true },
  mimo: { id: "mimo", alias: "mimo", name: "Xiaomi MiMo", icon: "memory", color: "#FF6900", textIcon: "XM", website: "https://platform.mioffice.cn" },
  deepgram: { id: "deepgram", alias: "dg", name: "Deepgram", icon: "mic", color: "#13EF93", textIcon: "DG", website: "https://deepgram.com", serviceKinds: ["stt", "imageToText"], sttConfig: { format: "deepgram", authType: "apiKey", baseUrl: "https://api.deepgram.com/v1/listen", authHeader: "token" } },
  assemblyai: { id: "assemblyai", alias: "aai", name: "AssemblyAI", icon: "record_voice_over", color: "#0062FF", textIcon: "AA", website: "https://assemblyai.com", serviceKinds: ["stt"], sttConfig: { format: "assemblyai", authType: "apiKey", baseUrl: "https://api.assemblyai.com/v2/transcript", authHeader: "Authorization" } },
  nanobanana: { id: "nanobanana", alias: "nb", name: "NanoBanana", icon: "image", color: "#FFD700", textIcon: "NB", website: "https://nanobananaapi.ai", serviceKinds: ["image"], apiKeyCompatible: true },
  elevenlabs: { id: "elevenlabs", alias: "el", name: "ElevenLabs", icon: "record_voice_over", color: "#6C47FF", textIcon: "EL", website: "https://elevenlabs.io", serviceKinds: ["tts"] },
  cartesia: { id: "cartesia", alias: "cartesia", name: "Cartesia", icon: "spatial_audio", color: "#FF4F8B", textIcon: "CA", website: "https://cartesia.ai", serviceKinds: ["tts"], hidden: true },
  playht: { id: "playht", alias: "playht", name: "PlayHT", icon: "play_circle", color: "#00B4D8", textIcon: "PH", website: "https://play.ht", serviceKinds: ["tts"], hidden: true },
  "local-device": { id: "local-device", alias: "local-device", name: "Local Device", icon: "speaker", color: "#64748B", textIcon: "LD", serviceKinds: ["tts"], noAuth: true },
  "google-tts": { id: "google-tts", alias: "google-tts", name: "Google TTS", icon: "record_voice_over", color: "#4285F4", textIcon: "GT", serviceKinds: ["tts"], noAuth: true },
  "edge-tts": { id: "edge-tts", alias: "edge-tts", name: "Edge TTS", icon: "record_voice_over", color: "#0078D4", textIcon: "ET", serviceKinds: ["tts"], noAuth: true },
  sdwebui: { id: "sdwebui", alias: "sdwebui", name: "SD WebUI", icon: "brush", color: "#FF7043", textIcon: "SD", website: "https://github.com/AUTOMATIC1111/stable-diffusion-webui", serviceKinds: ["image"] },
  comfyui: { id: "comfyui", alias: "comfyui", name: "ComfyUI", icon: "account_tree", color: "#4CAF50", textIcon: "CF", website: "https://github.com/comfyanonymous/ComfyUI", serviceKinds: ["image"] },
  huggingface: { id: "huggingface", alias: "hf", name: "HuggingFace", icon: "huggingface", color: "#FFD21E", textIcon: "HF", website: "https://huggingface.co", serviceKinds: ["image", "imageToText", "tts", "stt"], hiddenKinds: ["tts"], sttConfig: { format: "huggingface-asr", authType: "apiKey", baseUrl: "https://api-inference.huggingface.co/models", authHeader: "bearer" } },
  blackbox: { id: "blackbox", alias: "bb", name: "Blackbox AI", icon: "smart_toy", color: "#5B5FEF", textIcon: "BB", website: "https://blackbox.ai", serviceKinds: ["llm"], apiKeyCompatible: true },
  chutes: { id: "chutes", alias: "ch", name: "Chutes AI", icon: "water_drop", color: "#ffffffff", textIcon: "CH", website: "https://chutes.ai", apiKeyCompatible: true },
  "ollama-local": { id: "ollama-local", alias: "ollama-local", name: "Ollama Local", icon: "cloud", color: "#ffffffff", textIcon: "OL", website: "https://ollama.com" },
  "vertex-partner": { id: "vertex-partner", alias: "vxp", name: "Vertex Partner", icon: "cloud", color: "#34A853", textIcon: "VP", website: "https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-partner-models" },
  tavily: { id: "tavily", alias: "tavily", name: "Tavily", icon: "search", color: "#5B21B6", textIcon: "TV", website: "https://tavily.com", serviceKinds: ["webSearch"] },
  "brave-search": { id: "brave-search", alias: "brave", name: "Brave Search", icon: "travel_explore", color: "#FB542B", textIcon: "BR", website: "https://brave.com/search/api", serviceKinds: ["webSearch"] },
  serper: { id: "serper", alias: "serper", name: "Serper", icon: "search", color: "#4F46E5", textIcon: "SP", website: "https://serper.dev", serviceKinds: ["webSearch"] },
  exa: { id: "exa", alias: "exa", name: "Exa", icon: "manage_search", color: "#2563EB", textIcon: "EX", website: "https://exa.ai", serviceKinds: ["webSearch"] },
  searxng: { id: "searxng", alias: "searxng", name: "SearXNG", icon: "saved_search", color: "#3B82F6", textIcon: "SX", website: "https://docs.searxng.org", serviceKinds: ["webSearch"], noAuth: true },
  firecrawl: { id: "firecrawl", alias: "firecrawl", name: "Firecrawl", icon: "local_fire_department", color: "#F59E0B", textIcon: "FC", website: "https://firecrawl.dev", serviceKinds: ["webFetch"] },
  // --- OmniRoute providers (new) ---
  "ai21": { id: "ai21", alias: "ai21", name: "AI21 Labs", icon: "auto_awesome", color: "#6C63FF", textIcon: "21", website: "https://ai21.com", serviceKinds: ["llm"] },
  "anyscale": { id: "anyscale", alias: "anyscale", name: "Anyscale", icon: "cloud", color: "#1B6AC9", textIcon: "AS", website: "https://anyscale.com", serviceKinds: ["llm"] },
  "baseten": { id: "baseten", alias: "baseten", name: "Baseten", icon: "dns", color: "#5046E5", textIcon: "BT", website: "https://baseten.co", serviceKinds: ["llm"] },
  "bedrock": { id: "bedrock", alias: "bedrock", name: "AWS Bedrock", icon: "cloud", color: "#FF9900", textIcon: "BR", website: "https://aws.amazon.com/bedrock", serviceKinds: ["llm", "imageToText"] },
  "cloudflare-ai": { id: "cloudflare-ai", alias: "cfai", name: "Cloudflare AI", icon: "cloud", color: "#F38020", textIcon: "CF", website: "https://ai.cloudflare.com", serviceKinds: ["llm"] },
  "databricks": { id: "databricks", alias: "databricks", name: "Databricks", icon: "analytics", color: "#FF3621", textIcon: "DB", website: "https://databricks.com", serviceKinds: ["llm"] },
  "deepinfra": { id: "deepinfra", alias: "deepinfra", name: "DeepInfra", icon: "bolt", color: "#1A73E8", textIcon: "DI", website: "https://deepinfra.com", serviceKinds: ["llm", "embedding"] },
  "friendliai": { id: "friendliai", alias: "friendliai", name: "FriendliAI", icon: "emoji_emotions", color: "#FF6B6B", textIcon: "FA", website: "https://friendli.ai", serviceKinds: ["llm"] },
  "lambda": { id: "lambda", alias: "lambda", name: "Lambda", icon: "memory", color: "#7B2EF2", textIcon: "LA", website: "https://lambda.ai", serviceKinds: ["llm"] },
  "lepton": { id: "lepton", alias: "lepton", name: "Lepton AI", icon: "science", color: "#00BFA5", textIcon: "LP", website: "https://lepton.ai", serviceKinds: ["llm"] },
  "modal": { id: "modal", alias: "modal", name: "Modal", icon: "cloud_queue", color: "#22C55E", textIcon: "MD", website: "https://modal.com", serviceKinds: ["llm"] },
  "monsterapi": { id: "monsterapi", alias: "monsterapi", name: "MonsterAPI", icon: "bug_report", color: "#9333EA", textIcon: "MA", website: "https://monsterapi.ai", serviceKinds: ["llm"] },
  "novita": { id: "novita", alias: "novita", name: "Novita AI", icon: "auto_awesome", color: "#6366F1", textIcon: "NV", website: "https://novita.ai", serviceKinds: ["llm", "image"] },
  "octoai": { id: "octoai", alias: "octoai", name: "OctoAI", icon: "hub", color: "#2563EB", textIcon: "OC", website: "https://octo.ai", serviceKinds: ["llm", "image"] },
  "predictionguard": { id: "predictionguard", alias: "predguard", name: "Prediction Guard", icon: "security", color: "#059669", textIcon: "PG", website: "https://predictionguard.com", serviceKinds: ["llm"] },
  "predibase": { id: "predibase", alias: "predibase", name: "Predibase", icon: "tune", color: "#F97316", textIcon: "PB", website: "https://predibase.com", serviceKinds: ["llm"] },
  "replicate": { id: "replicate", alias: "replicate", name: "Replicate", icon: "content_copy", color: "#262626", textIcon: "RP", website: "https://replicate.com", serviceKinds: ["llm", "image"] },
  "runpod": { id: "runpod", alias: "runpod", name: "RunPod", icon: "rocket_launch", color: "#673AB7", textIcon: "RP", website: "https://runpod.io", serviceKinds: ["llm"] },
  "sambanova": { id: "sambanova", alias: "sambanova", name: "SambaNova", icon: "memory", color: "#FF5722", textIcon: "SN", website: "https://sambanova.ai", serviceKinds: ["llm"] },
  "scaleway": { id: "scaleway", alias: "scaleway", name: "Scaleway", icon: "cloud", color: "#4F0599", textIcon: "SC", website: "https://scaleway.com", serviceKinds: ["llm"] },
  "voyage": { id: "voyage", alias: "voyage", name: "Voyage AI", icon: "sailing", color: "#0EA5E9", textIcon: "VY", website: "https://voyageai.com", serviceKinds: ["embedding"] },
  "writer": { id: "writer", alias: "writer", name: "Writer", icon: "edit", color: "#1F2937", textIcon: "WR", website: "https://writer.com", serviceKinds: ["llm"] },
  "yi": { id: "yi", alias: "yi", name: "01.AI (Yi)", icon: "psychology", color: "#0D9488", textIcon: "YI", website: "https://01.ai", serviceKinds: ["llm"] },
  "zhipu": { id: "zhipu", alias: "zhipu", name: "Zhipu AI", icon: "psychology", color: "#1E40AF", textIcon: "ZP", website: "https://open.bigmodel.cn", serviceKinds: ["llm"] },
  "moonshot": { id: "moonshot", alias: "moonshot", name: "Moonshot AI", icon: "nightlight", color: "#1E3A8A", textIcon: "MS", website: "https://moonshot.cn", serviceKinds: ["llm"] },
  "baichuan": { id: "baichuan", alias: "baichuan", name: "Baichuan", icon: "psychology", color: "#E91E63", textIcon: "BC", website: "https://baichuan-ai.com", serviceKinds: ["llm"] },
  "stepfun": { id: "stepfun", alias: "stepfun", name: "StepFun", icon: "trending_up", color: "#7C3AED", textIcon: "ST", website: "https://stepfun.com", serviceKinds: ["llm"] },
  "sensenova": { id: "sensenova", alias: "sensenova", name: "SenseNova", icon: "visibility", color: "#0070C0", textIcon: "SV", website: "https://sensenova.cn", serviceKinds: ["llm"] },
  "lingyiwanwu": { id: "lingyiwanwu", alias: "lingyi", name: "Lingyi Wanwu", icon: "auto_awesome", color: "#10B981", textIcon: "LY", website: "https://lingyiwanwu.com", serviceKinds: ["llm"] },
  "infini": { id: "infini", alias: "infini", name: "Infini AI", icon: "all_inclusive", color: "#6366F1", textIcon: "IF", website: "https://infini-ai.com", serviceKinds: ["llm"] },
  "unify": { id: "unify", alias: "unify", name: "Unify", icon: "merge", color: "#4F46E5", textIcon: "UF", website: "https://unify.ai", serviceKinds: ["llm"] },
  "martian": { id: "martian", alias: "martian", name: "Martian", icon: "rocket", color: "#DC2626", textIcon: "MT", website: "https://withmartian.com", serviceKinds: ["llm"] },
  "glhf": { id: "glhf", alias: "glhf", name: "GLHF", icon: "sports_esports", color: "#22C55E", textIcon: "GH", website: "https://glhf.chat", serviceKinds: ["llm"] },
  "kluster": { id: "kluster", alias: "kluster", name: "Kluster AI", icon: "hub", color: "#0EA5E9", textIcon: "KL", website: "https://kluster.ai", serviceKinds: ["llm"] },
  "centml": { id: "centml", alias: "centml", name: "CentML", icon: "speed", color: "#F59E0B", textIcon: "CM", website: "https://centml.ai", serviceKinds: ["llm"] },
  "crusoe": { id: "crusoe", alias: "crusoe", name: "Crusoe", icon: "cloud", color: "#1E40AF", textIcon: "CR", website: "https://crusoe.ai", serviceKinds: ["llm"] },
  "inference-net": { id: "inference-net", alias: "infnet", name: "Inference.net", icon: "dns", color: "#4F46E5", textIcon: "IN", website: "https://inference.net", serviceKinds: ["llm"] },
  "parasail": { id: "parasail", alias: "parasail", name: "Parasail", icon: "sailing", color: "#0891B2", textIcon: "PS", website: "https://parasail.io", serviceKinds: ["llm"] },
  "targon": { id: "targon", alias: "targon", name: "Targon", icon: "bolt", color: "#B91C1C", textIcon: "TG", website: "https://targon.com", serviceKinds: ["llm"] },
  "avian": { id: "avian", alias: "avian", name: "Avian", icon: "flight", color: "#4ADE80", textIcon: "AV", website: "https://avian.io", serviceKinds: ["llm"] },
  "nineteen-ai": { id: "nineteen-ai", alias: "nineteen", name: "Nineteen AI", icon: "auto_awesome", color: "#6D28D9", textIcon: "19", website: "https://nineteen.ai", serviceKinds: ["llm"] },
  "massed-compute": { id: "massed-compute", alias: "massed", name: "Massed Compute", icon: "memory", color: "#7C3AED", textIcon: "MC", website: "https://massedcompute.com", serviceKinds: ["llm"] },
  "venice": { id: "venice", alias: "venice", name: "Venice AI", icon: "landscape", color: "#0284C7", textIcon: "VE", website: "https://venice.ai", serviceKinds: ["llm", "image"] },
  "featherless": { id: "featherless", alias: "featherless", name: "Featherless", icon: "air", color: "#8B5CF6", textIcon: "FL", website: "https://featherless.ai", serviceKinds: ["llm"] },
  "ncompass": { id: "ncompass", alias: "ncompass", name: "NCompass", icon: "explore", color: "#0369A1", textIcon: "NC", website: "https://ncompass.tech", serviceKinds: ["llm"] },
  "arcee": { id: "arcee", alias: "arcee", name: "Arcee AI", icon: "hub", color: "#F43F5E", textIcon: "AR", website: "https://arcee.ai", serviceKinds: ["llm"] },
  "tensoropera": { id: "tensoropera", alias: "tensoropera", name: "TensorOpera", icon: "developer_board", color: "#EA580C", textIcon: "TO", website: "https://tensoropera.ai", serviceKinds: ["llm"] },
  "aimlapi": { id: "aimlapi", alias: "aimlapi", name: "AIML API", icon: "api", color: "#2563EB", textIcon: "AM", website: "https://aimlapi.com", serviceKinds: ["llm", "image"] },
  "constellate": { id: "constellate", alias: "constellate", name: "Constellate", icon: "star", color: "#7C3AED", textIcon: "CT", website: "https://constellate.ai", serviceKinds: ["llm"] },
  "lightning-ai": { id: "lightning-ai", alias: "lightning", name: "Lightning AI", icon: "bolt", color: "#7C3AED", textIcon: "LA", website: "https://lightning.ai", serviceKinds: ["llm"] },
  "stability": { id: "stability", alias: "stability", name: "Stability AI", icon: "brush", color: "#7C3AED", textIcon: "ST", website: "https://stability.ai", serviceKinds: ["image"] },
  "ideogram": { id: "ideogram", alias: "ideogram", name: "Ideogram", icon: "brush", color: "#1E293B", textIcon: "ID", website: "https://ideogram.ai", serviceKinds: ["image"] },
  "black-forest-labs": { id: "black-forest-labs", alias: "bfl", name: "Black Forest Labs", icon: "brush", color: "#1F2937", textIcon: "BF", website: "https://blackforestlabs.ai", serviceKinds: ["image"] },
  "luma": { id: "luma", alias: "luma", name: "Luma AI", icon: "movie", color: "#7C3AED", textIcon: "LM", website: "https://lumalabs.ai", serviceKinds: ["video", "image"] },
  "runway": { id: "runway", alias: "runway", name: "Runway", icon: "movie", color: "#0D9488", textIcon: "RW", website: "https://runwayml.com", serviceKinds: ["video"] },
  "kling": { id: "kling", alias: "kling", name: "Kling AI", icon: "movie", color: "#4F46E5", textIcon: "KG", website: "https://klingai.com", serviceKinds: ["video", "image"] },
  "suno": { id: "suno", alias: "suno", name: "Suno", icon: "music_note", color: "#1DB954", textIcon: "SU", website: "https://suno.com", serviceKinds: ["music"] },
  "udio": { id: "udio", alias: "udio", name: "Udio", icon: "music_note", color: "#6366F1", textIcon: "UD", website: "https://udio.com", serviceKinds: ["music"] },
  "pioneer": { id: "pioneer", alias: "pioneer", name: "Pioneer", icon: "explore", color: "#2563EB", textIcon: "PN", website: "https://pioneer.dev", serviceKinds: ["llm"] },
};

// Web Cookie Providers (use browser session cookie instead of API key)
export const WEB_COOKIE_PROVIDERS = {
  "grok-web": { id: "grok-web", alias: "gw", name: "Grok Web (Subscription)", icon: "auto_awesome", color: "#1DA1F2", textIcon: "GW", website: "https://grok.com", authType: "cookie", authHint: "Paste your sso= cookie value from grok.com", passthroughModels: true, serviceKinds: ["llm"] },
  "perplexity-web": { id: "perplexity-web", alias: "pw", name: "Perplexity Web (Pro/Max)", icon: "search", color: "#20808D", textIcon: "PW", website: "https://www.perplexity.ai", authType: "cookie", authHint: "Paste your __Secure-next-auth.session-token cookie value from perplexity.ai", serviceKinds: ["llm"] },
};

// Media provider kinds
export const MEDIA_PROVIDER_KINDS = [
  { id: "embedding",   label: "Embedding",      icon: "data_array",        endpoint: { method: "POST", path: "/v1/embeddings" } },
  { id: "image",       label: "Text to Image",  icon: "brush",             endpoint: { method: "POST", path: "/v1/images/generations" } },
  { id: "imageToText", label: "Image to Text",  icon: "image_search",      endpoint: { method: "POST", path: "/v1/images/understanding" } },
  { id: "tts",         label: "Text To Speech", icon: "record_voice_over", endpoint: { method: "POST", path: "/v1/audio/speech" } },
  { id: "stt",         label: "STT",            icon: "mic",               endpoint: { method: "POST", path: "/v1/audio/transcriptions" } },
  { id: "webSearch",   label: "Web Search",     icon: "travel_explore",    endpoint: { method: "POST", path: "/v1/search" } },
  { id: "webFetch",    label: "Web Fetch",      icon: "language",          endpoint: { method: "POST", path: "/v1/web/fetch" } },
  { id: "video",       label: "Video",          icon: "movie",             endpoint: { method: "POST", path: "/v1/video/generations" } },
  { id: "music",       label: "Music",          icon: "music_note",        endpoint: { method: "POST", path: "/v1/audio/music" } },
];

export const OPENAI_COMPATIBLE_PREFIX = "openai-compatible-";
export const ANTHROPIC_COMPATIBLE_PREFIX = "anthropic-compatible-";

export function isOpenAICompatibleProvider(providerId: string): boolean {
  return typeof providerId === "string" && providerId.startsWith(OPENAI_COMPATIBLE_PREFIX);
}

export function isAnthropicCompatibleProvider(providerId: string): boolean {
  return typeof providerId === "string" && providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX);
}

export function isMorphManagedProvider(providerId: string): boolean {
  return providerId === MORPH_MANAGED_PROVIDER_ID;
}

// All providers (combined)
export const AI_PROVIDERS = { ...FREE_PROVIDERS, ...FREE_TIER_PROVIDERS, ...OAUTH_PROVIDERS, ...APIKEY_PROVIDERS, ...WEB_COOKIE_PROVIDERS };

// Auth methods
export const AUTH_METHODS = {
  oauth: { id: "oauth", name: "OAuth", icon: "lock" },
  apikey: { id: "apikey", name: "API Key", icon: "key" },
  cookie: { id: "cookie", name: "Browser Cookie", icon: "cookie" },
};

// Helper: Get provider by alias
export function getProviderByAlias(alias: string) {
  for (const provider of Object.values(AI_PROVIDERS)) {
    if (provider.alias === alias || provider.id === alias) {
      return provider;
    }
  }
  return null;
}

// Helper: Get provider ID from alias
export function resolveProviderId(aliasOrId: string): string {
  const provider = getProviderByAlias(aliasOrId);
  return provider?.id || aliasOrId;
}

// Helper: Get alias from provider ID
export function getProviderAlias(providerId: string): string {
  const provider = AI_PROVIDERS[providerId];
  return provider?.alias || providerId;
}

// Alias to ID mapping (for quick lookup)
export const ALIAS_TO_ID: Record<string, string> = Object.values(AI_PROVIDERS).reduce((acc, p) => {
  acc[p.alias] = p.id;
  return acc;
}, {} as Record<string, string>);

// ID to Alias mapping
export const ID_TO_ALIAS: Record<string, string> = Object.values(AI_PROVIDERS).reduce((acc, p) => {
  acc[p.id] = p.alias;
  return acc;
}, {} as Record<string, string>);

// Helper: Get providers by service kind (e.g. "tts", "embedding", "image")
// Providers without serviceKinds default to ["llm"]
export function getProvidersByKind(kind) {
  return Object.values(AI_PROVIDERS).filter((provider) => {
    const p: any = provider;
    const kinds = Array.isArray(p.serviceKinds) ? p.serviceKinds : ["llm"];
    if (!kinds.includes(kind)) return false;
    if (p.hidden === true) return false;
    if (Array.isArray(p.hiddenKinds) && p.hiddenKinds.includes(kind)) return false;
    return true;
  });
}

export function getProviderSupportedModes(provider: any): string[] {
  const serviceKinds = provider?.serviceKinds ?? ["llm"];
  const modes: string[] = [];
  if (serviceKinds.includes("llm")) modes.push("text");
  if (serviceKinds.includes("image")) modes.push("image");
  if (serviceKinds.includes("tts") || serviceKinds.includes("stt")) modes.push("audio");
  if (serviceKinds.includes("video")) modes.push("video");
  return modes;
}

// Providers that support usage/quota API
export const USAGE_SUPPORTED_PROVIDERS = [
  "claude",
  "antigravity",
  "kiro",
  "amazon-q",
  "github",
  "codex",
];

// --- Category exports ---

// Local/self-hosted providers (run on user's own hardware)
export const LOCAL_PROVIDERS: Set<string> = new Set([
  "ollama-local",
  "sdwebui",
  "comfyui",
  "local-device",
  "searxng",
]);

// Search/web providers
export const SEARCH_PROVIDERS: Set<string> = new Set([
  "tavily",
  "brave-search",
  "serper",
  "exa",
  "searxng",
  "firecrawl",
  "perplexity",
]);

// Audio-only providers (no LLM capability)
export const AUDIO_ONLY_PROVIDERS: Set<string> = new Set([
  "deepgram",
  "assemblyai",
  "elevenlabs",
  "cartesia",
  "playht",
  "local-device",
  "google-tts",
  "edge-tts",
]);

// Upstream proxy/aggregator providers
export const UPSTREAM_PROXY_PROVIDERS: Set<string> = new Set([
  "openrouter",
  "unify",
  "martian",
  "opencode-zen",
]);

// Cloud agent providers (IDE-based OAuth)
export const CLOUD_AGENT_PROVIDERS: Set<string> = new Set([
  "claude",
  "codex",
  "github",
  "cursor",
  "kilocode",
  "cline",
  "antigravity",
]);

// System-managed providers
export const SYSTEM_PROVIDERS: Set<string> = new Set([
  MORPH_MANAGED_PROVIDER_ID,
]);

// --- Sub-category sets ---

// Image-only providers (no LLM)
export const IMAGE_ONLY_PROVIDER_IDS: Set<string> = new Set([
  "nanobanana",
  "sdwebui",
  "comfyui",
  "stability",
  "ideogram",
  "black-forest-labs",
]);

// Aggregator providers (route to multiple backends)
export const AGGREGATOR_PROVIDER_IDS: Set<string> = new Set([
  "openrouter",
  "unify",
  "martian",
  "opencode-zen",
  "aimlapi",
]);

// China-region providers
export const CHINA_REGION_PROVIDER_IDS: Set<string> = new Set([
  "glm-cn",
  "minimax-cn",
  "alicode",
  "volcengine-ark",
  "kimi",
  "moonshot",
  "baichuan",
  "stepfun",
  "sensenova",
  "lingyiwanwu",
  "zhipu",
  "yi",
  "infini",
  "mimo",
]);

// Video generation providers
export const VIDEO_PROVIDER_IDS: Set<string> = new Set([
  "luma",
  "runway",
  "kling",
]);

// Music generation providers
export const MUSIC_PROVIDER_IDS: Set<string> = new Set([
  "suno",
  "udio",
]);

// --- Helper functions ---

/** Check if a provider is local/self-hosted */
export function isLocalProvider(providerId: string): boolean {
  return LOCAL_PROVIDERS.has(providerId);
}

/** Check if a provider is a self-hosted chat provider (local LLM) */
export function isSelfHostedChatProvider(providerId: string): boolean {
  return providerId === "ollama-local" || isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);
}

/** Check if a provider supports bulk API key import */
export function supportsBulkApiKey(providerId: string): boolean {
  const provider = AI_PROVIDERS[providerId];
  if (!provider) return false;
  // Free providers, OAuth providers, cookie providers, and noAuth providers do not use API keys
  if (FREE_PROVIDERS[providerId]) return false;
  if (OAUTH_PROVIDERS[providerId]) return false;
  if (WEB_COOKIE_PROVIDERS[providerId]) return false;
  if (provider.noAuth) return false;
  if (provider.systemManaged) return false;
  return true;
}

/** Check if a provider is an audio-only provider */
export function isAudioOnlyProvider(providerId: string): boolean {
  return AUDIO_ONLY_PROVIDERS.has(providerId);
}

/** Check if a provider is a search provider */
export function isSearchProvider(providerId: string): boolean {
  return SEARCH_PROVIDERS.has(providerId);
}

/** Check if a provider is an upstream proxy/aggregator */
export function isUpstreamProxy(providerId: string): boolean {
  return UPSTREAM_PROXY_PROVIDERS.has(providerId);
}

/** Check if a provider is an image-only provider */
export function isImageOnlyProvider(providerId: string): boolean {
  return IMAGE_ONLY_PROVIDER_IDS.has(providerId);
}

/** Check if a provider is a China-region provider */
export function isChinaRegionProvider(providerId: string): boolean {
  return CHINA_REGION_PROVIDER_IDS.has(providerId);
}

/** Get the category label for a provider */
export function getProviderCategory(providerId: string): string {
  if (FREE_PROVIDERS[providerId]) return "Free";
  if (FREE_TIER_PROVIDERS[providerId]) return "Free Tier";
  if (OAUTH_PROVIDERS[providerId]) return "OAuth";
  if (WEB_COOKIE_PROVIDERS[providerId]) return "Web Cookie";
  if (SYSTEM_PROVIDERS.has(providerId)) return "System";
  if (LOCAL_PROVIDERS.has(providerId)) return "Local";
  if (AUDIO_ONLY_PROVIDERS.has(providerId)) return "Audio";
  if (SEARCH_PROVIDERS.has(providerId)) return "Search";
  if (IMAGE_ONLY_PROVIDER_IDS.has(providerId)) return "Image";
  if (isOpenAICompatibleProvider(providerId)) return "OpenAI Compatible";
  if (isAnthropicCompatibleProvider(providerId)) return "Anthropic Compatible";
  return "API Key";
}

/** Get all provider IDs that support a specific service kind */
export function getProviderIdsByKind(kind: ServiceKind): string[] {
  return Object.entries(AI_PROVIDERS)
    .filter(([, provider]) => {
      const kinds = (provider as any).serviceKinds ?? ["llm"];
      return kinds.includes(kind);
    })
    .map(([id]) => id);
}

/** Check if provider has a deprecated status */
export function isDeprecatedProvider(providerId: string): boolean {
  const provider = AI_PROVIDERS[providerId];
  return !!provider?.deprecated;
}

/** Get the total number of registered providers */
export function getProviderCount(): number {
  return Object.keys(AI_PROVIDERS).length;
}

/** Provider test contract: which test phases apply to a provider */
export interface ProviderTestContract {
  connectivity: boolean;
  authValidation: boolean;
  modelListing: boolean;
  chatCompletion: boolean;
}

/** Get which test phases are applicable for a given provider */
export function getProviderTestCapabilities(providerId: string): ProviderTestContract {
  const provider = AI_PROVIDERS[providerId];

  // Compatible providers (dynamic, not in AI_PROVIDERS)
  const isCompatible = providerId.startsWith(OPENAI_COMPATIBLE_PREFIX) || providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX);
  if (isCompatible) {
    return { connectivity: true, authValidation: true, modelListing: true, chatCompletion: true };
  }

  // Unknown provider (not in any registry) - return safe defaults
  if (!provider) {
    return { connectivity: true, authValidation: true, modelListing: false, chatCompletion: true };
  }

  const isNoAuth = !!provider.noAuth;
  const isCookie = !!WEB_COOKIE_PROVIDERS[providerId];
  const isLocal = LOCAL_PROVIDERS.has(providerId);
  const serviceKinds: string[] = (provider as any).serviceKinds ?? ["llm"];
  const hasLlm = serviceKinds.includes("llm");

  return {
    connectivity: true,
    authValidation: !isNoAuth && !isCookie && !isLocal,
    modelListing: true,
    chatCompletion: !isNoAuth && hasLlm,
  };
}
