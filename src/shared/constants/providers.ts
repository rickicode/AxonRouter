// Provider definitions
// This file is organized into category sections for clarity.
// Each section exports a provider map used by the routing engine and dashboard.

// ============================================================================
// Types
// ============================================================================

/**
 * Service kind - declarative tag for what a provider can do beyond basic LLM chat.
 * Affects UI filtering and playground routing; does not influence request routing.
 */
export type ServiceKind =
  | "llm"
  | "embedding"
  | "image"
  | "imageToText"
  | "tts"
  | "stt"
  | "webSearch"
  | "webFetch"
  | "video"
  | "music";

export type RiskNoticeVariant = "oauth" | "webCookie" | "deprecated" | "embedded-service";

export interface ProviderRiskNoticeFields {
  subscriptionRisk?: boolean;
  riskNoticeVariant?: RiskNoticeVariant;
  isEmbeddedService?: boolean;
}

// ============================================================================
// Shared Config
// ============================================================================

// Thinking config definitions
// options: list of selectable modes ("auto" = no override from server)
// defaultMode: fallback when user hasn't configured
// extended: claude-style thinking (thinking.type + budget_tokens) - used by most providers
// effort: openai-style reasoning_effort - only openai + codex
export const THINKING_CONFIG = {
  extended: {
    options: ["auto", "on", "off"],
    defaultMode: "auto",
    defaultBudgetTokens: 10000,
  },
  effort: {
    options: ["auto", "none", "low", "medium", "high"],
    defaultMode: "auto",
  },
};

// Media provider kinds - each kind maps to a route and endpoint config
export const MEDIA_PROVIDER_KINDS = [
  { id: "embedding", label: "Embedding", icon: "data_array", endpoint: { method: "POST", path: "/v1/embeddings" } },
  { id: "image", label: "Text to Image", icon: "brush", endpoint: { method: "POST", path: "/v1/images/generations" } },
  { id: "imageToText", label: "Image to Text", icon: "image_search", endpoint: { method: "POST", path: "/v1/images/understanding" } },
  { id: "tts", label: "Text To Speech", icon: "record_voice_over", endpoint: { method: "POST", path: "/v1/audio/speech" } },
  { id: "stt", label: "STT", icon: "mic", endpoint: { method: "POST", path: "/v1/audio/transcriptions" } },
  { id: "webSearch", label: "Web Search", icon: "travel_explore", endpoint: { method: "POST", path: "/v1/search" } },
  { id: "webFetch", label: "Web Fetch", icon: "language", endpoint: { method: "POST", path: "/v1/web/fetch" } },
  { id: "video", label: "Video", icon: "movie", endpoint: { method: "POST", path: "/v1/video/generations" } },
  { id: "music", label: "Music", icon: "music_note", endpoint: { method: "POST", path: "/v1/audio/music" } },
];

// ============================================================================
// FREE PROVIDERS (fully free, no API key required)
// ============================================================================

// Free Providers (kiro first, iflow last)
export const FREE_PROVIDERS = {
  kiro: { id: "kiro", alias: "kr", name: "Kiro AI", icon: "psychology_alt", color: "#FF6B35", hasFree: true },
  "amazon-q": {
    id: "amazon-q",
    alias: "aq",
    name: "Amazon Q",
    icon: "cloud",
    color: "#FF9900",
    textIcon: "AQ",
    website: "https://aws.amazon.com/q/developer/",
    hasFree: true,
    authHint: "Uses the same AWS Builder ID or imported refresh-token flow as Kiro, but keeps Amazon Q connections separate.",
  },
  qwen: { id: "qwen", alias: "qw", name: "Qwen Code", icon: "psychology", color: "#10B981", deprecated: true, deprecationNotice: "Qwen OAuth free tier was discontinued by Alibaba on 2026-04-15. New connections will not work." },
  "gemini-cli": { id: "gemini-cli", alias: "gc", name: "Gemini CLI", icon: "terminal", color: "#4285F4", deprecated: true, deprecationNotice: "Gemini CLI is designed exclusively for Gemini CLI. Using it with other tools (OpenClaw, Claude, Codex...) may result in account restrictions or bans." },
  iflow: { id: "iflow", alias: "if", name: "iFlow AI", icon: "water_drop", color: "#6366F1" },
  opencode: { id: "opencode", alias: "oc", name: "OpenCode Free", icon: "terminal", color: "#E87040", textIcon: "OC", noAuth: true, hasFree: true, passthroughModels: true, authHint: "No API key required - uses OpenCode public free endpoint.", freeNote: "No API key required - public OpenCode endpoint with Kimi, GLM, Qwen, MiMo, MiniMax models.", modelsFetcher: { url: "https://opencode.ai/zen/v1/models", type: "opencode-free" } },
};

// Free Tier Providers (has free access but may require account/API key)
export const FREE_TIER_PROVIDERS = {
  openrouter: { id: "openrouter", alias: "openrouter", name: "OpenRouter", icon: "router", color: "#F97316", textIcon: "OR", website: "https://openrouter.ai", notice: { text: "Free tier: 27+ free models, no credit card needed, 200 req/day. After 0 credit: 1,000 req/day.", apiKeyUrl: "https://openrouter.ai/settings/keys" }, modelsFetcher: { url: "https://openrouter.ai/api/v1/models", type: "openrouter-free" }, passthroughModels: true, hasFree: true, freeNote: "Free models at \/bin/sh/token with :free suffix - 20 RPM / 200 RPD", serviceKinds: ["llm", "embedding", "tts", "imageToText"] },
  nvidia: { id: "nvidia", alias: "nvidia", name: "NVIDIA NIM", icon: "developer_board", color: "#76B900", textIcon: "NV", website: "https://developer.nvidia.com/nim", notice: { text: "Free access for NVIDIA Developer Program members (prototyping & testing).", apiKeyUrl: "https://build.nvidia.com/settings/api-keys" }, hasFree: true, freeNote: "Free dev access: ~40 RPM, 70+ models", serviceKinds: ["llm", "stt"], sttConfig: { format: "nvidia-asr", authType: "apiKey", baseUrl: "https://integrate.api.nvidia.com/v1/audio/transcriptions", authHeader: "bearer" } },
  ollama: { id: "ollama", alias: "ollama", name: "Ollama Cloud", icon: "cloud", color: "#ffffffff", textIcon: "OL", website: "https://ollama.com", notice: { text: "Free tier: light usage, 1 cloud model at a time (limits reset every 5h & 7d). Pro $/mo.", apiKeyUrl: "https://ollama.com/settings/keys" }, hasFree: true },
  vertex: { id: "vertex", alias: "vx", name: "Vertex AI", icon: "cloud", color: "#4285F4", textIcon: "VX", website: "https://cloud.google.com/vertex-ai", notice: { text: "New Google Cloud accounts get $ free credits. Requires GCP project + Service Account with Vertex AI API enabled.", apiKeyUrl: "https://console.cloud.google.com/iam-admin/serviceaccounts" }, hasFree: true, authHint: "Provide Service Account JSON or OAuth access_token" },
  gemini: { id: "gemini", alias: "gemini", name: "Gemini", icon: "diamond", color: "#4285F4", textIcon: "GE", website: "https://ai.google.dev", hasFree: true, freeNote: "Free forever: 1,500 req/day for Gemini 2.5 Flash - no credit card", serviceKinds: ["llm", "embedding", "image", "imageToText", "webSearch", "stt", "tts"], sttConfig: { format: "gemini-stt", authType: "apiKey", baseUrl: "https://generativelanguage.googleapis.com/v1beta/models", authHeader: "bearer" } },
};

// ============================================================================
// OAUTH PROVIDERS
// ============================================================================

export const OAUTH_PROVIDERS = {
  claude: { id: "claude", alias: "cc", name: "Claude Code", icon: "smart_toy", color: "#D97757", subscriptionRisk: true, riskNoticeVariant: "oauth" },
  antigravity: { id: "antigravity", alias: "ag", name: "Antigravity", icon: "rocket_launch", color: "#F59E0B", deprecated: true, deprecationNotice: "AG is designed exclusively for Antigravity IDE. Using it with other tools (OpenClaw, Claude, Codex...) may result in account restrictions or bans.", subscriptionRisk: true, riskNoticeVariant: "oauth" },
  codex: { id: "codex", alias: "cx", name: "OpenAI Codex", icon: "code", color: "#3B82F6", thinkingConfig: THINKING_CONFIG.effort, subscriptionRisk: true, riskNoticeVariant: "oauth" },
  github: { id: "github", alias: "gh", name: "GitHub Copilot", icon: "code", color: "#333333" },
  cursor: { id: "cursor", alias: "cu", name: "Cursor IDE", icon: "edit_note", color: "#00D4AA", subscriptionRisk: true, riskNoticeVariant: "oauth" },
  "kimi-coding": { id: "kimi-coding", alias: "kmc", name: "Kimi Coding", icon: "psychology", color: "#1E40AF", textIcon: "KC", subscriptionRisk: true, riskNoticeVariant: "oauth" },
  kilocode: { id: "kilocode", alias: "kc", name: "Kilo Code", icon: "code", color: "#FF6B35", textIcon: "KC", subscriptionRisk: true, riskNoticeVariant: "oauth" },
  cline: { id: "cline", alias: "cl", name: "Cline", icon: "smart_toy", color: "#5B9BD5", textIcon: "CL", subscriptionRisk: true, riskNoticeVariant: "oauth" },
  qoder: { id: "qoder", alias: "qd", name: "Qoder AI", icon: "water_drop", color: "#6366F1", subscriptionRisk: true, riskNoticeVariant: "oauth", hasFree: true },
  "gitlab-duo": { id: "gitlab-duo", alias: "gitlab-duo", name: "GitLab Duo", icon: "hub", color: "#FC6D26", textIcon: "GL", website: "https://docs.gitlab.com/user/duo_agent_platform/code_suggestions/", authHint: "OAuth application with ai_features + read_user scopes." },
  zed: { id: "zed", alias: "zd", name: "Zed IDE", icon: "code", color: "#084CCF", textIcon: "ZD", website: "https://zed.dev", authHint: "Zed stores LLM provider credentials in the OS keychain. Use the Import button to discover and import them automatically." },
  trae: { id: "trae", alias: "tr", name: "Trae", icon: "edit_square", color: "#FF7849", textIcon: "TR", website: "https://trae.ai", authHint: "Trae is an AI-native IDE by ByteDance. Sign in inside Trae and paste your API token or use OAuth device flow." },
  windsurf: { id: "windsurf", alias: "ws", name: "Windsurf", icon: "air", color: "#00C5A0", textIcon: "WS", subscriptionRisk: true, riskNoticeVariant: "oauth", authHint: "Sign in at windsurf.com to get your token.", website: "https://windsurf.com" },
  "devin-cli": { id: "devin-cli", alias: "dv", name: "Devin CLI", icon: "terminal", color: "#6366F1", textIcon: "DV", authHint: "Requires the Devin CLI binary. Run devin auth login to authenticate.", website: "https://cli.devin.ai" },
};

// ============================================================================
// MORPH MANAGED PROVIDER
// ============================================================================

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

// ============================================================================
// APIKEY PROVIDERS
// ============================================================================

export const APIKEY_PROVIDERS = {
  [MORPH_MANAGED_PROVIDER_ID]: MORPH_MANAGED_PROVIDER,
  commandcode: { id: "commandcode", alias: "ccmd", name: "Command Code", icon: "terminal", color: "#6366F1", textIcon: "CC", website: "https://commandcode.ai", passthroughModels: true, serviceKinds: ["llm"] },
  "command-code": { id: "command-code", alias: "cmd", name: "Command Code", icon: "terminal", color: "#111827", textIcon: "CC", website: "https://commandcode.ai", passthroughModels: true, authHint: "Use a Command Code API key." },
  glm: { id: "glm", alias: "glm", name: "GLM Coding", icon: "code", color: "#2563EB", textIcon: "GL", website: "https://open.bigmodel.cn" },
  "glm-cn": { id: "glm-cn", alias: "glm-cn", name: "GLM (China)", icon: "code", color: "#DC2626", textIcon: "GC", website: "https://open.bigmodel.cn" },
  glmt: { id: "glmt", alias: "glmt", name: "GLM Thinking", icon: "psychology", color: "#1D4ED8", textIcon: "GT", website: "https://open.bigmodel.cn", apiHint: "Preset GLM profile with higher token budget, thinking enabled, and longer timeout." },
  kimi: { id: "kimi", alias: "kimi", name: "Kimi", icon: "psychology", color: "#1E3A8A", textIcon: "KM", website: "https://kimi.moonshot.cn", serviceKinds: ["llm", "webSearch"] },
  "kimi-coding-apikey": { id: "kimi-coding-apikey", alias: "kmca", name: "Kimi Coding (API Key)", icon: "psychology", color: "#1E40AF", textIcon: "KC", website: "https://www.kimi.com/code" },
  minimax: { id: "minimax", alias: "minimax", name: "Minimax Coding", icon: "memory", color: "#7C3AED", textIcon: "MM", website: "https://www.minimaxi.com", serviceKinds: ["llm", "image", "imageToText", "webSearch"] },
  "minimax-cn": { id: "minimax-cn", alias: "minimax-cn", name: "Minimax (China)", icon: "memory", color: "#DC2626", textIcon: "MC", website: "https://www.minimaxi.com" },
  alicode: { id: "alicode", alias: "alicode", name: "Alibaba", icon: "cloud", color: "#FF6A00", textIcon: "ALi" },
  "alicode-intl": { id: "alicode-intl", alias: "alicode-intl", name: "Alibaba Intl", icon: "cloud", color: "#FF6A00", textIcon: "ALi" },
  "bailian-coding-plan": { id: "bailian-coding-plan", alias: "bcp", name: "Alibaba Coding Plan", icon: "code", color: "#FF6A00", textIcon: "BCP", website: "https://www.alibabacloud.com/help/en/model-studio/coding-plan" },
  alibaba: { id: "alibaba", alias: "ali", name: "Alibaba", icon: "cloud_queue", color: "#FF6600", textIcon: "AL", website: "https://dashscope-intl.aliyuncs.com" },
  "alibaba-cn": { id: "alibaba-cn", alias: "ali-cn", name: "Alibaba (China)", icon: "cloud_queue", color: "#FF6600", textIcon: "AL", website: "https://dashscope.aliyuncs.com" },
  "volcengine-ark": { id: "volcengine-ark", alias: "ark", name: "Volcengine Ark", icon: "cloud", color: "#1677FF", textIcon: "ARK", website: "https://ark.cn-beijing.volces.com" },
  volcengine: { id: "volcengine", alias: "volcengine", name: "Volcengine", icon: "local_fire_department", color: "#DC2626", textIcon: "VE", website: "https://www.volcengine.com" },
  openai: { id: "openai", alias: "openai", name: "OpenAI", icon: "auto_awesome", color: "#10A37F", textIcon: "OA", website: "https://platform.openai.com", serviceKinds: ["llm", "embedding", "tts", "image", "imageToText", "webSearch", "stt"], thinkingConfig: THINKING_CONFIG.effort, sttConfig: { format: "openai", authType: "apiKey", baseUrl: "https://api.openai.com/v1/audio/transcriptions", authHeader: "bearer" } },
  anthropic: { id: "anthropic", alias: "anthropic", name: "Anthropic", icon: "smart_toy", color: "#D97757", textIcon: "AN", website: "https://console.anthropic.com", serviceKinds: ["llm", "imageToText"] },
  azure: { id: "azure", alias: "azure", name: "Azure OpenAI", icon: "cloud", color: "#0078D4", textIcon: "AZ", website: "https://azure.microsoft.com/en-us/products/ai-services/openai-service", hasProviderSpecificData: true },
  "azure-openai": { id: "azure-openai", alias: "azure-openai", name: "Azure OpenAI", icon: "cloud", color: "#0078D4", textIcon: "AZ", website: "https://azure.microsoft.com/products/ai-services/openai-service", authHint: "Use your Azure OpenAI API key. Base URL should be your resource endpoint.", passthroughModels: true },
  "azure-ai": { id: "azure-ai", alias: "azure-ai", name: "Azure AI Foundry", icon: "cloud", color: "#2563EB", textIcon: "AF", website: "https://learn.microsoft.com/azure/ai-foundry", authHint: "Use your Azure AI Foundry key.", passthroughModels: true },
  bedrock: { id: "bedrock", alias: "bedrock", name: "Amazon Bedrock", icon: "cloud", color: "#FF9900", textIcon: "BR", website: "https://aws.amazon.com/bedrock", authHint: "Use your Amazon Bedrock API key and configure the AWS region.", passthroughModels: true },
  watsonx: { id: "watsonx", alias: "watsonx", name: "IBM watsonx.ai Gateway", icon: "hub", color: "#0F62FE", textIcon: "WX", website: "https://www.ibm.com/products/watsonx-ai", authHint: "Use your watsonx bearer token.", passthroughModels: true },
  oci: { id: "oci", alias: "oci", name: "OCI Generative AI", icon: "cloud", color: "#C74634", textIcon: "OCI", website: "https://www.oracle.com/artificial-intelligence/generative-ai", passthroughModels: true },
  sap: { id: "sap", alias: "sap", name: "SAP Generative AI Hub", icon: "business", color: "#0FAAFF", textIcon: "SAP", website: "https://help.sap.com/docs/sap-ai-core", passthroughModels: true },
  "opencode-go": { id: "opencode-go", alias: "ocg", name: "OpenCode Go", icon: "terminal", color: "#E87040", textIcon: "OC", website: "https://opencode.ai/auth", notice: { text: "OpenCode Go subscription: $5/mo (then $10/mo). Access to Kimi, GLM, Qwen, MiMo, MiniMax models.", apiKeyUrl: "https://opencode.ai/auth" } },
  "opencode-zen": { id: "opencode-zen", alias: "opencode-zen", name: "OpenCode Zen", icon: "terminal", color: "#6366f1", website: "https://opencode.ai/zen" },
  deepseek: { id: "deepseek", alias: "ds", name: "DeepSeek", icon: "bolt", color: "#4D6BFE", textIcon: "DS", website: "https://deepseek.com", hasFree: true, freeNote: "5M free tokens on signup - no credit card required" },
  groq: { id: "groq", alias: "groq", name: "Groq", icon: "speed", color: "#F55036", textIcon: "GQ", website: "https://groq.com", hasFree: true, freeNote: "Free tier: 30 RPM / 14.4K RPD - no credit card", serviceKinds: ["llm", "imageToText", "stt"], sttConfig: { format: "openai", authType: "apiKey", baseUrl: "https://api.groq.com/openai/v1/audio/transcriptions", authHeader: "bearer" } },
  xai: { id: "xai", alias: "xai", name: "xAI (Grok)", icon: "auto_awesome", color: "#1DA1F2", textIcon: "XA", website: "https://x.ai", serviceKinds: ["llm", "imageToText", "webSearch"] },
  mistral: { id: "mistral", alias: "mistral", name: "Mistral", icon: "air", color: "#FF7000", textIcon: "MI", website: "https://mistral.ai", hasFree: true, freeNote: "Free Experiment tier: rate-limited access to all models", serviceKinds: ["llm", "imageToText"] },
  perplexity: { id: "perplexity", alias: "pplx", name: "Perplexity", icon: "search", color: "#20808D", textIcon: "PP", website: "https://www.perplexity.ai", serviceKinds: ["llm", "webSearch"] },
  together: { id: "together", alias: "together", name: "Together AI", icon: "group_work", color: "#0F6FFF", textIcon: "TG", website: "https://www.together.ai", hasFree: true, freeNote: "$25 signup credits + 3 permanently free models" },
  fireworks: { id: "fireworks", alias: "fireworks", name: "Fireworks AI", icon: "local_fire_department", color: "#7B2EF2", textIcon: "FW", website: "https://fireworks.ai", hasFree: true, freeNote: "$1 free starter credits on signup" },
  cerebras: { id: "cerebras", alias: "cerebras", name: "Cerebras", icon: "memory", color: "#FF4F00", textIcon: "CB", website: "https://www.cerebras.ai", hasFree: true, freeNote: "Free: 1M tokens/day, 60K TPM" },
  cohere: { id: "cohere", alias: "cohere", name: "Cohere", icon: "hub", color: "#39594D", textIcon: "CO", website: "https://cohere.com", hasFree: true, freeNote: "Free Trial: 1,000 API calls/month" },
  nebius: { id: "nebius", alias: "nebius", name: "Nebius AI", icon: "cloud", color: "#6C5CE7", textIcon: "NB", website: "https://nebius.com", hasFree: true, freeNote: "~$1 trial credits on signup" },
  siliconflow: { id: "siliconflow", alias: "siliconflow", name: "SiliconFlow", icon: "cloud_queue", color: "#5B6EF5", textIcon: "SF", website: "https://cloud.siliconflow.com", hasFree: true, freeNote: "$1 free credits plus permanently free models after identity verification" },
  hyperbolic: { id: "hyperbolic", alias: "hyp", name: "Hyperbolic", icon: "bolt", color: "#00D4FF", textIcon: "HY", website: "https://hyperbolic.xyz", hasFree: true, freeNote: "$1-5 trial credits on signup" },
  mimo: { id: "mimo", alias: "mimo", name: "Xiaomi MiMo", icon: "memory", color: "#FF6900", textIcon: "XM", website: "https://platform.mioffice.cn" },
  "xiaomi-mimo": { id: "xiaomi-mimo", alias: "xiaomi-mimo", name: "Xiaomi MiMo", icon: "devices", color: "#EA580C", textIcon: "MM", website: "https://mimo.mi.com" },
  deepgram: { id: "deepgram", alias: "dg", name: "Deepgram", icon: "mic", color: "#13EF93", textIcon: "DG", website: "https://deepgram.com", serviceKinds: ["stt", "imageToText"], sttConfig: { format: "deepgram", authType: "apiKey", baseUrl: "https://api.deepgram.com/v1/listen", authHeader: "token" } },
  assemblyai: { id: "assemblyai", alias: "aai", name: "AssemblyAI", icon: "record_voice_over", color: "#0062FF", textIcon: "AA", website: "https://assemblyai.com", serviceKinds: ["stt"], sttConfig: { format: "assemblyai", authType: "apiKey", baseUrl: "https://api.assemblyai.com/v2/transcript", authHeader: "Authorization" } },
  nanobanana: { id: "nanobanana", alias: "nb", name: "NanoBanana", icon: "image", color: "#FFD700", textIcon: "NB", website: "https://nanobananaapi.ai", serviceKinds: ["image"] },
  elevenlabs: { id: "elevenlabs", alias: "el", name: "ElevenLabs", icon: "record_voice_over", color: "#6C47FF", textIcon: "EL", website: "https://elevenlabs.io", serviceKinds: ["tts"] },
  cartesia: { id: "cartesia", alias: "cartesia", name: "Cartesia", icon: "spatial_audio", color: "#FF4F8B", textIcon: "CA", website: "https://cartesia.ai", serviceKinds: ["tts"], hidden: true },
  playht: { id: "playht", alias: "playht", name: "PlayHT", icon: "play_circle", color: "#00B4D8", textIcon: "PH", website: "https://play.ht", serviceKinds: ["tts"], hidden: true },
  "local-device": { id: "local-device", alias: "local-device", name: "Local Device", icon: "speaker", color: "#64748B", textIcon: "LD", serviceKinds: ["tts"], noAuth: true },
  "google-tts": { id: "google-tts", alias: "google-tts", name: "Google TTS", icon: "record_voice_over", color: "#4285F4", textIcon: "GT", serviceKinds: ["tts"], noAuth: true },
  "edge-tts": { id: "edge-tts", alias: "edge-tts", name: "Edge TTS", icon: "record_voice_over", color: "#0078D4", textIcon: "ET", serviceKinds: ["tts"], noAuth: true },
  sdwebui: { id: "sdwebui", alias: "sdwebui", name: "SD WebUI", icon: "brush", color: "#FF7043", textIcon: "SD", website: "https://github.com/AUTOMATIC1111/stable-diffusion-webui", serviceKinds: ["image"] },
  comfyui: { id: "comfyui", alias: "comfyui", name: "ComfyUI", icon: "account_tree", color: "#4CAF50", textIcon: "CF", website: "https://github.com/comfyanonymous/ComfyUI", serviceKinds: ["image"] },
  huggingface: { id: "huggingface", alias: "hf", name: "HuggingFace", icon: "huggingface", color: "#FFD21E", textIcon: "HF", website: "https://huggingface.co", hasFree: true, freeNote: "Free Inference API for thousands of models", serviceKinds: ["image", "imageToText", "tts", "stt"], hiddenKinds: ["tts"], sttConfig: { format: "huggingface-asr", authType: "apiKey", baseUrl: "https://api-inference.huggingface.co/models", authHeader: "bearer" } },
  blackbox: { id: "blackbox", alias: "bb", name: "Blackbox AI", icon: "smart_toy", color: "#5B5FEF", textIcon: "BB", website: "https://blackbox.ai", hasFree: true, freeNote: "Free tier: unlimited basic chat", serviceKinds: ["llm"] },
  chutes: { id: "chutes", alias: "ch", name: "Chutes AI", icon: "water_drop", color: "#ffffffff", textIcon: "CH", website: "https://chutes.ai", hasFree: true, passthroughModels: true },
  "ollama-local": { id: "ollama-local", alias: "ollama-local", name: "Ollama Local", icon: "cloud", color: "#ffffffff", textIcon: "OL", website: "https://ollama.com" },
  "vertex-partner": { id: "vertex-partner", alias: "vxp", name: "Vertex Partner", icon: "cloud", color: "#34A853", textIcon: "VP", website: "https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-partner-models" },
  tavily: { id: "tavily", alias: "tavily", name: "Tavily", icon: "search", color: "#5B21B6", textIcon: "TV", website: "https://tavily.com", serviceKinds: ["webSearch"] },
  "brave-search": { id: "brave-search", alias: "brave", name: "Brave Search", icon: "travel_explore", color: "#FB542B", textIcon: "BR", website: "https://brave.com/search/api", serviceKinds: ["webSearch"] },
  serper: { id: "serper", alias: "serper", name: "Serper", icon: "search", color: "#4F46E5", textIcon: "SP", website: "https://serper.dev", serviceKinds: ["webSearch"] },
  exa: { id: "exa", alias: "exa", name: "Exa", icon: "manage_search", color: "#2563EB", textIcon: "EX", website: "https://exa.ai", serviceKinds: ["webSearch"] },
  searxng: { id: "searxng", alias: "searxng", name: "SearXNG", icon: "saved_search", color: "#3B82F6", textIcon: "SX", website: "https://docs.searxng.org", serviceKinds: ["webSearch"], noAuth: true },
  firecrawl: { id: "firecrawl", alias: "firecrawl", name: "Firecrawl", icon: "local_fire_department", color: "#F59E0B", textIcon: "FC", website: "https://firecrawl.dev", hasFree: true, serviceKinds: ["webFetch"] },
  // New providers from OmniRoute
  agentrouter: { id: "agentrouter", alias: "agentrouter", name: "AgentRouter", icon: "router", color: "#10B981", textIcon: "AR", passthroughModels: true, website: "https://agentrouter.org", hasFree: true, freeNote: "$200 free credits on signup - multi-model routing gateway" },
  "api-airforce": { id: "api-airforce", alias: "af", name: "Api.airforce", icon: "flight", color: "#1E3A5F", textIcon: "AF", website: "https://api.airforce", hasFree: true, freeNote: "55 free tier models including Grok-3, Claude 3.7, Qwen3" },
  astraflow: { id: "astraflow", alias: "astraflow", name: "Astraflow (UCloud Global)", icon: "cloud", color: "#0052D9", textIcon: "AF", passthroughModels: true, website: "https://astraflow.ucloud-global.com" },
  "astraflow-cn": { id: "astraflow-cn", alias: "astraflow-cn", name: "Astraflow (UCloud China)", icon: "cloud", color: "#0052D9", textIcon: "AFC", passthroughModels: true, website: "https://astraflow.ucloud.cn" },
  qianfan: { id: "qianfan", alias: "qianfan", name: "Baidu Qianfan", icon: "cloud", color: "#2468F2", textIcon: "BD", website: "https://cloud.baidu.com/product/wenxinworkshop" },
  crof: { id: "crof", alias: "crof", name: "CrofAI", icon: "auto_awesome", color: "#0EA5E9", textIcon: "CR", website: "https://crof.ai" },
  modal: { id: "modal", alias: "mdl", name: "Modal", icon: "cloud_queue", color: "#7C3AED", textIcon: "MDL", website: "https://modal.com/docs", hasFree: true, freeNote: "$30/month free credits for new accounts", passthroughModels: true },
  reka: { id: "reka", alias: "reka", name: "Reka", icon: "auto_awesome", color: "#111827", textIcon: "RK", website: "https://docs.reka.ai/chat/overview", hasFree: true, freeNote: "$10/month recurring free API credits" },
  nlpcloud: { id: "nlpcloud", alias: "nlpc", name: "NLP Cloud", icon: "psychology", color: "#2196F3", textIcon: "NLPC", website: "https://docs.nlpcloud.com", hasFree: true, freeNote: "Trial credits for new accounts" },
  runwayml: { id: "runwayml", alias: "runway", name: "Runway", icon: "movie", color: "#111827", textIcon: "RW", website: "https://docs.dev.runwayml.com" },
  "ollama-cloud": { id: "ollama-cloud", alias: "ollamacloud", name: "Ollama Cloud", icon: "cloud", color: "#58A6FF", textIcon: "OC", website: "https://ollama.com/settings/api-keys", hasFree: true },
  synthetic: { id: "synthetic", alias: "synthetic", name: "Synthetic", icon: "verified_user", color: "#6366F1", textIcon: "SY", website: "https://synthetic.new", passthroughModels: true },
  "kilo-gateway": { id: "kilo-gateway", alias: "kg", name: "Kilo Gateway", icon: "hub", color: "#617A91", textIcon: "KG", website: "https://kilo.ai", passthroughModels: true },
  zai: { id: "zai", alias: "zai", name: "Z.AI", icon: "psychology", color: "#2563EB", textIcon: "ZA", website: "https://open.bigmodel.cn" },
  longcat: { id: "longcat", alias: "lc", name: "LongCat AI", icon: "auto_awesome", color: "#FF6B9D", textIcon: "LC", website: "https://longcat.chat/platform/docs", hasFree: true, freeNote: "50M tokens/day (Flash-Lite) + 500K/day (Chat/Thinking) - free public beta" },
  pollinations: { id: "pollinations", alias: "pol", name: "Pollinations AI", icon: "local_florist", color: "#4CAF50", textIcon: "PO", website: "https://pollinations.ai", hasFree: true, freeNote: "No API key required for free public endpoint." },
  puter: { id: "puter", alias: "pu", name: "Puter AI", icon: "cloud_circle", color: "#6366F1", textIcon: "PU", website: "https://puter.com", hasFree: true, freeNote: "500+ models - Users pay via free Puter account", passthroughModels: true },
  uncloseai: { id: "uncloseai", alias: "unc", name: "UncloseAI", icon: "auto_awesome", color: "#8B5CF6", textIcon: "UN", website: "https://uncloseai.com", hasFree: true, freeNote: "Free forever - no signup, no credit card", passthroughModels: true },
  replicate: { id: "replicate", alias: "rep", name: "Replicate", icon: "auto_awesome", color: "#3B82F6", textIcon: "RE", website: "https://replicate.com", hasFree: true, freeNote: "Free community models", passthroughModels: true },
  hackclub: { id: "hackclub", alias: "hc", name: "Hackclub AI", icon: "auto_awesome", color: "#FF6B00", textIcon: "HC", website: "https://ai.hackclub.com", hasFree: true, freeNote: "Free AI for Hack Club members - 30+ models", passthroughModels: true },
  "github-models": { id: "github-models", alias: "ghm", name: "GitHub Models", icon: "code", color: "#238636", textIcon: "GH", website: "https://github.com/marketplace/models", hasFree: true, freeNote: "Free GPT-5, o-series, DeepSeek-R1, Llama 4, Grok 3" },
  haiper: { id: "haiper", alias: "hp", name: "Haiper", icon: "videocam", color: "#6366F1", textIcon: "HP", website: "https://haiper.ai" },
  leonardo: { id: "leonardo", alias: "leo", name: "Leonardo AI", icon: "palette", color: "#8B5CF6", textIcon: "LE", website: "https://leonardo.ai" },
  ideogram: { id: "ideogram", alias: "ideo", name: "Ideogram", icon: "image", color: "#EC4899", textIcon: "ID", website: "https://ideogram.ai" },
  suno: { id: "suno", alias: "suno", name: "Suno", icon: "music_note", color: "#F59E0B", textIcon: "SU", website: "https://suno.ai" },
  udio: { id: "udio", alias: "udio", name: "Udio", icon: "music_note", color: "#10B981", textIcon: "UD", website: "https://udio.com" },
  "cloudflare-ai": { id: "cloudflare-ai", alias: "cf", name: "Cloudflare Workers AI", icon: "cloud", color: "#F48120", textIcon: "CF", website: "https://developers.cloudflare.com/workers-ai", hasFree: true, freeNote: "Free 10K Neurons/day" },
  scaleway: { id: "scaleway", alias: "scw", name: "Scaleway AI", icon: "cloud", color: "#4F0599", textIcon: "SCW", website: "https://www.scaleway.com/en/ai/generative-apis", hasFree: true, freeNote: "1M free tokens for new accounts" },
  deepinfra: { id: "deepinfra", alias: "deepinfra", name: "DeepInfra", icon: "hub", color: "#2563EB", textIcon: "DI", website: "https://deepinfra.com", hasFree: true, freeNote: "Free signup credits for API testing" },
  "vercel-ai-gateway": { id: "vercel-ai-gateway", alias: "vag", name: "Vercel AI Gateway", icon: "route", color: "#111827", textIcon: "VAI", website: "https://vercel.com/docs/ai-gateway" },
  "lambda-ai": { id: "lambda-ai", alias: "lambda", name: "Lambda AI", icon: "bolt", color: "#7C3AED", textIcon: "LA", website: "https://lambda.ai" },
  sambanova: { id: "sambanova", alias: "samba", name: "SambaNova", icon: "memory", color: "#DC2626", textIcon: "SN", website: "https://sambanova.ai", hasFree: true, freeNote: "$5 free credits on signup" },
  nscale: { id: "nscale", alias: "nscale", name: "nScale", icon: "token", color: "#0891B2", textIcon: "NS", website: "https://nscale.com", hasFree: true, freeNote: "$5 free credits on signup" },
  ovhcloud: { id: "ovhcloud", alias: "ovh", name: "OVHcloud AI", icon: "cloud", color: "#2563EB", textIcon: "OVH", website: "https://www.ovhcloud.com" },
  baseten: { id: "baseten", alias: "baseten", name: "Baseten", icon: "deployed_code", color: "#111827", textIcon: "BT", website: "https://baseten.co", hasFree: true, freeNote: "$30 free trial credits for GPU inference" },
  publicai: { id: "publicai", alias: "publicai", name: "PublicAI", icon: "public", color: "#059669", textIcon: "PA", website: "https://publicai.co", hasFree: true },
  moonshot: { id: "moonshot", alias: "moonshot", name: "Moonshot AI", icon: "rocket_launch", color: "#1E40AF", textIcon: "MS", website: "https://platform.moonshot.ai" },
  "meta-llama": { id: "meta-llama", alias: "meta", name: "Meta Llama API", icon: "smart_toy", color: "#0F766E", textIcon: "ML", website: "https://llama.developer.meta.com" },
  "v0-vercel": { id: "v0-vercel", alias: "v0", name: "v0 (Vercel)", icon: "code_blocks", color: "#111827", textIcon: "V0", website: "https://v0.dev" },
  morph: { id: "morph", alias: "morph-api", name: "Morph", icon: "auto_fix_high", color: "#2563EB", textIcon: "MP", website: "https://morphllm.com", hasFree: true, freeNote: "Free tier: 250K credits/month" },
  "featherless-ai": { id: "featherless-ai", alias: "featherless", name: "Featherless AI", icon: "flutter_dash", color: "#EA580C", textIcon: "FL", website: "https://featherless.ai", hasFree: true },
  llm7: { id: "llm7", alias: "llm7", name: "LLM7.io", icon: "hub", color: "#6366F1", textIcon: "LM", website: "https://llm7.io", hasFree: true, freeNote: "No signup required - 2 req/s, 20 RPM free tier" },
  lepton: { id: "lepton", alias: "lepton", name: "Lepton AI", icon: "bolt", color: "#10B981", textIcon: "LP", website: "https://lepton.ai", hasFree: true },
  kluster: { id: "kluster", alias: "kluster", name: "Kluster AI", icon: "hub", color: "#8B5CF6", textIcon: "KL", website: "https://kluster.ai", hasFree: true, freeNote: "$5 free credits on signup" },
  friendliai: { id: "friendliai", alias: "friendli", name: "FriendliAI", icon: "handshake", color: "#EC4899", textIcon: "FR", website: "https://friendli.ai", hasFree: true },
  llamagate: { id: "llamagate", alias: "llamagate", name: "LlamaGate", icon: "gate", color: "#16A34A", textIcon: "LG", website: "https://llamagate.ai" },
  heroku: { id: "heroku", alias: "heroku", name: "Heroku AI", icon: "cloud_upload", color: "#7C3AED", textIcon: "HK", website: "https://www.heroku.com" },
  galadriel: { id: "galadriel", alias: "galadriel", name: "Galadriel", icon: "auto_awesome", color: "#F59E0B", textIcon: "GA", website: "https://galadriel.com" },
  databricks: { id: "databricks", alias: "databricks", name: "Databricks", icon: "table_chart", color: "#F97316", textIcon: "DB", website: "https://www.databricks.com" },
  datarobot: { id: "datarobot", alias: "datarobot", name: "DataRobot", icon: "precision_manufacturing", color: "#6D28D9", textIcon: "DR", website: "https://docs.datarobot.com", passthroughModels: true },
  clarifai: { id: "clarifai", alias: "clarifai", name: "Clarifai", icon: "hub", color: "#7C3AED", textIcon: "CF", website: "https://docs.clarifai.com", passthroughModels: true },
  snowflake: { id: "snowflake", alias: "snowflake", name: "Snowflake Cortex", icon: "ac_unit", color: "#29B5E8", textIcon: "SF", website: "https://www.snowflake.com" },
  wandb: { id: "wandb", alias: "wandb", name: "Weights & Biases Inference", icon: "monitoring", color: "#FFBE0B", textIcon: "WB", website: "https://wandb.ai" },
  ai21: { id: "ai21", alias: "ai21", name: "AI21 Labs", icon: "psychology_alt", color: "#0284C7", textIcon: "AI21", website: "https://www.ai21.com", hasFree: true, freeNote: "$10 trial credits on signup" },
  gigachat: { id: "gigachat", alias: "gigachat", name: "GigaChat (Sber)", icon: "lock_person", color: "#10B981", textIcon: "GC", website: "https://developers.sber.ru" },
  venice: { id: "venice", alias: "venice", name: "Venice.ai", icon: "travel_explore", color: "#0EA5E9", textIcon: "VN", website: "https://venice.ai" },
  codestral: { id: "codestral", alias: "codestral", name: "Codestral", icon: "terminal", color: "#FF7000", textIcon: "CS", website: "https://mistral.ai" },
  upstage: { id: "upstage", alias: "upstage", name: "Upstage", icon: "trending_up", color: "#0F766E", textIcon: "UP", website: "https://www.upstage.ai" },
  maritalk: { id: "maritalk", alias: "maritalk", name: "Maritalk", icon: "translate", color: "#1D4ED8", textIcon: "MT", website: "https://www.maritaca.ai" },
  gitlawb: { id: "gitlawb", alias: "glb", name: "Gitlawb Opengateway (MiMo)", icon: "hub", color: "#10B981", textIcon: "GLB", website: "https://opengateway.gitlawb.com", hasFree: true },
  "gitlawb-gmi": { id: "gitlawb-gmi", alias: "glb-gmi", name: "Gitlawb Opengateway (GMI Cloud)", icon: "hub", color: "#10B981", textIcon: "GMI", website: "https://opengateway.gitlawb.com", hasFree: true },
  "inference-net": { id: "inference-net", alias: "inet", name: "Inference.net", icon: "dns", color: "#2563EB", textIcon: "IN", website: "https://inference.net", hasFree: true, freeNote: "$25 free credits on signup" },
  nanogpt: { id: "nanogpt", alias: "nanogpt", name: "NanoGPT", icon: "chat", color: "#4F46E5", textIcon: "NG", website: "https://nano-gpt.com" },
  predibase: { id: "predibase", alias: "predibase", name: "Predibase", icon: "deployed_code_history", color: "#0F766E", textIcon: "PB", website: "https://predibase.com", hasFree: true, freeNote: "$25 free trial credits" },
  bytez: { id: "bytez", alias: "bytez", name: "Bytez", icon: "api", color: "#6366F1", textIcon: "BZ", website: "https://bytez.com", hasFree: true, freeNote: "$1 free credits, refreshes every 4 weeks" },
  aimlapi: { id: "aimlapi", alias: "aiml", name: "AI/ML API", icon: "hub", color: "#6366F1", textIcon: "AI", website: "https://aimlapi.com", hasFree: true, freeNote: "$0.025/day free credits - 200+ models", passthroughModels: true },
  novita: { id: "novita", alias: "novita", name: "Novita AI", icon: "auto_awesome", color: "#FF4081", textIcon: "NV", website: "https://novita.ai", hasFree: true, freeNote: "$0.50 trial credits on signup", passthroughModels: true },
  piapi: { id: "piapi", alias: "pi", name: "PiAPI", icon: "api", color: "#7C4DFF", textIcon: "PI", website: "https://piapi.ai", passthroughModels: true },
  getgoapi: { id: "getgoapi", alias: "ggo", name: "GoAPI", icon: "rocket_launch", color: "#FF6D00", textIcon: "GO", website: "https://api.getgoapi.com", passthroughModels: true },
  laozhang: { id: "laozhang", alias: "lz", name: "LaoZhang AI", icon: "hub", color: "#FF1744", textIcon: "LZ", website: "https://api.laozhang.ai", passthroughModels: true },
  glhf: { id: "glhf", alias: "glhf", name: "GLHF Chat", icon: "hub", color: "#10B981", textIcon: "GH", website: "https://glhf.chat", hasFree: true, freeNote: "Free tier for open-source model inference", passthroughModels: true },
  cablyai: { id: "cablyai", alias: "cablyai", name: "CablyAI", icon: "hub", color: "#FF4081", textIcon: "CA", website: "https://cablyai.com", passthroughModels: true },
  thebai: { id: "thebai", alias: "thebai", name: "TheB.AI", icon: "hub", color: "#3B82F6", textIcon: "TB", website: "https://theb.ai", passthroughModels: true },
  fenayai: { id: "fenayai", alias: "fenayai", name: "FenayAI", icon: "hub", color: "#FF9800", textIcon: "FN", website: "https://fenayai.com", passthroughModels: true },
  empower: { id: "empower", alias: "empower", name: "Empower", icon: "hub", color: "#14B8A6", textIcon: "EM", website: "https://docs.empower.dev", passthroughModels: true },
  "nous-research": { id: "nous-research", alias: "nous", name: "Nous Research", icon: "hub", color: "#2563EB", textIcon: "NO", website: "https://portal.nousresearch.com/help", hasFree: true, freeNote: "Free tier: 50 RPM, 500,000 TPM" },
  petals: { id: "petals", alias: "petals", name: "Petals", icon: "hub", color: "#10B981", textIcon: "PT", website: "https://chat.petals.dev" },
  poe: { id: "poe", alias: "poe", name: "Poe", icon: "hub", color: "#F97316", textIcon: "PO", website: "https://creator.poe.com/api-reference", passthroughModels: true },
  gitlab: { id: "gitlab", alias: "gitlab", name: "GitLab Duo PAT", icon: "hub", color: "#FC6D26", textIcon: "GL", website: "https://docs.gitlab.com/user/duo_agent_platform/code_suggestions/" },
  "voyage-ai": { id: "voyage-ai", alias: "voyage", name: "Voyage AI", icon: "blur_on", color: "#0F766E", textIcon: "VA", website: "https://www.voyageai.com", hasFree: true, freeNote: "200M free tokens for embeddings and reranking" },
  "jina-ai": { id: "jina-ai", alias: "jina", name: "Jina AI", icon: "sort", color: "#2563EB", textIcon: "JA", website: "https://jina.ai", hasFree: true, freeNote: "10M free tokens on signup" },
  "fal-ai": { id: "fal-ai", alias: "fal", name: "Fal.ai", icon: "image", color: "#2563EB", textIcon: "FL", website: "https://fal.ai" },
  "stability-ai": { id: "stability-ai", alias: "stability", name: "Stability AI", icon: "image", color: "#8B5CF6", textIcon: "SA", website: "https://stability.ai" },
  "black-forest-labs": { id: "black-forest-labs", alias: "bfl", name: "Black Forest Labs", icon: "image", color: "#111827", textIcon: "BF", website: "https://blackforestlabs.ai" },
  recraft: { id: "recraft", alias: "recraft", name: "Recraft", icon: "image", color: "#EC4899", textIcon: "RC", website: "https://recraft.ai" },
  topaz: { id: "topaz", alias: "topaz", name: "Topaz", icon: "image", color: "#059669", textIcon: "TP", website: "https://topazlabs.com" },
  baidu: { id: "baidu", alias: "baidu", name: "Baidu (ERNIE)", icon: "auto_awesome", color: "#2932E1", textIcon: "BD", website: "https://yiyan.baidu.com", hasFree: true, freeNote: "Free ERNIE Speed/Lite models", passthroughModels: true },
  tencent: { id: "tencent", alias: "tencent", name: "Tencent Hunyuan", icon: "auto_awesome", color: "#07C160", textIcon: "TC", website: "https://hunyuan.tencent.com", hasFree: true, passthroughModels: true },
  iflytek: { id: "iflytek", alias: "iflytek", name: "iFlytek Spark", icon: "auto_awesome", color: "#0066FF", textIcon: "IF", website: "https://xinghuo.xfyun.cn", hasFree: true, passthroughModels: true },
  baichuan: { id: "baichuan", alias: "baichuan", name: "Baichuan", icon: "auto_awesome", color: "#6366F1", textIcon: "BC", website: "https://baichuan.com", hasFree: true, passthroughModels: true },
  yi: { id: "yi", alias: "yi", name: "Yi (01.AI)", icon: "auto_awesome", color: "#10B981", textIcon: "YI", website: "https://01.ai", hasFree: true, passthroughModels: true },
  stepfun: { id: "stepfun", alias: "stepfun", name: "StepFun", icon: "auto_awesome", color: "#8B5CF6", textIcon: "SF", website: "https://stepfun.com", hasFree: true, passthroughModels: true },
  coze: { id: "coze", alias: "coze", name: "Coze", icon: "smart_toy", color: "#3B82F6", textIcon: "CZ", website: "https://coze.com", hasFree: true, passthroughModels: true },
  "360ai": { id: "360ai", alias: "360ai", name: "360 AI", icon: "auto_awesome", color: "#00B96B", textIcon: "360", website: "https://ai.360.cn", hasFree: true, passthroughModels: true },
  doubao: { id: "doubao", alias: "doubao", name: "Doubao", icon: "auto_awesome", color: "#FE2C55", textIcon: "DB", website: "https://doubao.com", hasFree: true, passthroughModels: true },
  sensenova: { id: "sensenova", alias: "sensenova", name: "SenseNova", icon: "auto_awesome", color: "#0066FF", textIcon: "SN", website: "https://platform.sensenova.cn", hasFree: true, passthroughModels: true },
  sparkdesk: { id: "sparkdesk", alias: "sparkdesk", name: "SparkDesk", icon: "auto_awesome", color: "#0066FF", textIcon: "SD", website: "https://xinghuo.xfyun.cn", hasFree: true, passthroughModels: true },
  phind: { id: "phind", alias: "phind", name: "Phind", icon: "search", color: "#EC4899", textIcon: "PH", website: "https://phind.com", hasFree: true, passthroughModels: true },
  huggingchat: { id: "huggingchat", alias: "huggingchat", name: "HuggingChat", icon: "chat", color: "#FFD21E", textIcon: "HC", website: "https://huggingface.co/chat", hasFree: true, passthroughModels: true },
  dify: { id: "dify", alias: "dify", name: "Dify", icon: "smart_toy", color: "#6366F1", textIcon: "DF", website: "https://dify.ai", hasFree: true, passthroughModels: true },
  poolside: { id: "poolside", alias: "poolside", name: "Poolside", icon: "code", color: "#3B82F6", textIcon: "PS", website: "https://poolside.ai", hasFree: true, passthroughModels: true },
  "arcee-ai": { id: "arcee-ai", alias: "arcee", name: "Arcee AI", icon: "auto_awesome", color: "#8B5CF6", textIcon: "AR", website: "https://arcee.ai", hasFree: true, passthroughModels: true },
  inclusionai: { id: "inclusionai", alias: "inclusion", name: "InclusionAI", icon: "psychology", color: "#10B981", textIcon: "IA", website: "https://inclusionai.com", hasFree: true, passthroughModels: true },
  liquid: { id: "liquid", alias: "liquid", name: "Liquid AI", icon: "water_drop", color: "#06B6D4", textIcon: "LQ", website: "https://liquid.ai", hasFree: true, passthroughModels: true },
  nomic: { id: "nomic", alias: "nomic", name: "Nomic", icon: "hub", color: "#7C3AED", textIcon: "NM", website: "https://nomic.ai", hasFree: true, passthroughModels: true },
  krutrim: { id: "krutrim", alias: "krutrim", name: "Krutrim", icon: "auto_awesome", color: "#F59E0B", textIcon: "KR", website: "https://krutrim.ai", hasFree: true, passthroughModels: true },
  monsterapi: { id: "monsterapi", alias: "monster", name: "MonsterAPI", icon: "cloud", color: "#EF4444", textIcon: "MA", website: "https://monsterapi.ai", hasFree: true, passthroughModels: true },
  "jina-reader": { id: "jina-reader", alias: "jr", name: "Jina Reader", icon: "menu_book", color: "#0EA5E9", textIcon: "JR", website: "https://jina.ai/reader", hasFree: true, serviceKinds: ["webFetch"] },
  byteplus: { id: "byteplus", alias: "bpm", name: "BytePlus ModelArk", icon: "cloud", color: "#2563EB", textIcon: "BP", website: "https://console.byteplus.com/ark", hasFree: true },
  bluesminds: { id: "bluesminds", alias: "bm", name: "BluesMinds", icon: "psychology", color: "#3B82F6", textIcon: "BM", website: "https://www.bluesminds.com", hasFree: true, freeNote: "Free daily pi credits - supports 200+ models" },
  "freemodel-dev": { id: "freemodel-dev", alias: "fmd", name: "FreeModel.dev", icon: "auto_awesome", color: "#8B5CF6", textIcon: "FM", website: "https://freemodel.dev", hasFree: true, freeNote: "$300 free credits on signup" },
  freeaiapikey: { id: "freeaiapikey", alias: "faik", name: "FreeAIAPIKey", icon: "vpn_key", color: "#F59E0B", textIcon: "FK", website: "https://freeaiapikey.com" },
  kie: { id: "kie", alias: "kie", name: "KIE.AI", icon: "hub", color: "#2563EB", textIcon: "KIE", website: "https://kie.ai" },
  bazaarlink: { id: "bazaarlink", alias: "bzl", name: "BazaarLink", icon: "storefront", color: "#6366F1", textIcon: "BZ", website: "https://bazaarlink.ai", hasFree: true, freeNote: "Free tier with auto:free routing" },
  completions: { id: "completions", alias: "cpl", name: "Completions.me", icon: "bolt", color: "#F59E0B", textIcon: "CP", website: "https://completions.me", hasFree: true, freeNote: "Free unlimited access to Claude, GPT, Gemini" },
  enally: { id: "enally", alias: "enly", name: "Enally AI", icon: "school", color: "#8B5CF6", textIcon: "EN", website: "https://ai.enally.in", hasFree: true, freeNote: "Free for students and developers" },
  freetheai: { id: "freetheai", alias: "fta", name: "FreeTheAi", icon: "lock_open", color: "#10B981", textIcon: "FT", website: "https://freetheai.xyz", hasFree: true, freeNote: "Community-run - free forever" },
};

// ============================================================================
// WEB COOKIE PROVIDERS
// ============================================================================

export const WEB_COOKIE_PROVIDERS = {
  "grok-web": { id: "grok-web", alias: "gw", name: "Grok Web (Subscription)", icon: "auto_awesome", color: "#1DA1F2", textIcon: "GW", website: "https://grok.com", authType: "cookie", authHint: "Paste your sso= cookie value from grok.com", passthroughModels: true, subscriptionRisk: true, riskNoticeVariant: "webCookie", serviceKinds: ["llm"] },
  "perplexity-web": { id: "perplexity-web", alias: "pw", name: "Perplexity Web (Pro/Max)", icon: "search", color: "#20808D", textIcon: "PW", website: "https://www.perplexity.ai", authType: "cookie", authHint: "Paste your __Secure-next-auth.session-token cookie value from perplexity.ai", subscriptionRisk: true, riskNoticeVariant: "webCookie", serviceKinds: ["llm"] },
  "chatgpt-web": { id: "chatgpt-web", alias: "cgpt-web", name: "ChatGPT Web (Plus/Pro)", icon: "auto_awesome", color: "#10A37F", textIcon: "CG", website: "https://chatgpt.com", authHint: "Paste your __Secure-next-auth.session-token cookie value from chatgpt.com", subscriptionRisk: true, riskNoticeVariant: "webCookie" },
  "gemini-web": { id: "gemini-web", alias: "gweb", name: "Gemini Web (Free)", icon: "auto_awesome", color: "#4285F4", textIcon: "GWeb", website: "https://gemini.google.com", authHint: "Paste your __Secure-1PSID cookie value from gemini.google.com", subscriptionRisk: true, riskNoticeVariant: "webCookie" },
  "blackbox-web": { id: "blackbox-web", alias: "bb-web", name: "Blackbox Web (Subscription)", icon: "view_in_ar", color: "#1A1A2E", textIcon: "BW", website: "https://app.blackbox.ai", authHint: "Paste your __Secure-authjs.session-token value from app.blackbox.ai", subscriptionRisk: true, riskNoticeVariant: "webCookie" },
  "muse-spark-web": { id: "muse-spark-web", alias: "ms-web", name: "Muse Spark Web (Meta AI)", icon: "auto_awesome", color: "#0866FF", textIcon: "MS", website: "https://www.meta.ai", authHint: "Paste your abra_sess value from meta.ai" },
  "claude-web": { id: "claude-web", alias: "cw", name: "Claude Web", icon: "auto_awesome", color: "#D97757", textIcon: "CW", website: "https://claude.ai", authHint: "Paste your session cookie from claude.ai", subscriptionRisk: true, riskNoticeVariant: "webCookie" },
  "deepseek-web": { id: "deepseek-web", alias: "ds-web", name: "DeepSeek Web", icon: "auto_awesome", color: "#4D6BFE", textIcon: "DS", website: "https://chat.deepseek.com", authHint: "Paste your userToken from chat.deepseek.com", subscriptionRisk: true, riskNoticeVariant: "webCookie" },
  "copilot-web": { id: "copilot-web", alias: "copilot", name: "Microsoft Copilot Web", icon: "auto_awesome", color: "#0078D4", textIcon: "CP", website: "https://copilot.microsoft.com", authHint: "Paste your access_token from copilot.microsoft.com", subscriptionRisk: true, riskNoticeVariant: "webCookie" },
  "veoaifree-web": { id: "veoaifree-web", alias: "veo-free", name: "Veo AI Free", icon: "videocam", color: "#8B5CF6", textIcon: "VF", website: "https://veoaifree.com", hasFree: true, freeNote: "Free video generation - 6 requests/hour" },
  "t3-web": { id: "t3-web", alias: "t3chat", name: "t3.chat (Pro/Free)", icon: "auto_awesome", color: "#7C3AED", textIcon: "T3", website: "https://t3.chat", hasFree: true, freeNote: "Free tier gives limited model access. Pro ($8/month) unlocks 50+ models." },
  "inner-ai": { id: "inner-ai", alias: "in-ai", name: "Inner.ai (Subscription)", icon: "auto_awesome", color: "#1A56DB", textIcon: "IA", website: "https://app.innerai.com", authHint: "Paste your token cookie and email separated by a space." },
  "adapta-web": { id: "adapta-web", alias: "adp-web", name: "Adapta.org (Adapta One Web)", icon: "auto_awesome", color: "#6E3AD3", textIcon: "AW", website: "https://agent.adapta.one", authHint: "Paste your __client cookie value from .clerk.agent.adapta.one" },
};

// ============================================================================
// LOCAL PROVIDERS (self-hosted, no cloud dependency)
// ============================================================================

export const LOCAL_PROVIDERS = {
  "lm-studio": { id: "lm-studio", alias: "lmstudio", name: "LM Studio", icon: "server", color: "#4A148C", textIcon: "LM", website: "https://lmstudio.ai", authHint: "API key optional. Configure the local LM Studio OpenAI-compatible base URL (default: http://localhost:1234/v1).", localDefault: "http://localhost:1234/v1", passthroughModels: true },
  vllm: { id: "vllm", alias: "vllm", name: "vLLM", icon: "memory", color: "#0F766E", textIcon: "VL", website: "https://github.com/vllm-project/vllm", authHint: "API key optional. Configure the local vLLM OpenAI-compatible base URL (default: http://localhost:8000/v1).", localDefault: "http://localhost:8000/v1", passthroughModels: true },
  lemonade: { id: "lemonade", alias: "lemonade", name: "Lemonade Server", icon: "bolt", color: "#F59E0B", textIcon: "LM", website: "https://lemonade-server.ai", authHint: "API key optional. Configure the local Lemonade OpenAI-compatible base URL (default: http://localhost:13305/api/v1).", localDefault: "http://localhost:13305/api/v1", passthroughModels: true },
  llamafile: { id: "llamafile", alias: "llamafile", name: "Llamafile", icon: "article", color: "#EA580C", textIcon: "LF", website: "https://github.com/Mozilla-Ocho/llamafile", authHint: "API key optional. Configure the local Llamafile OpenAI-compatible base URL (default: http://127.0.0.1:8080/v1).", localDefault: "http://127.0.0.1:8080/v1", passthroughModels: true },
  "llama-cpp": { id: "llama-cpp", alias: "llamacpp", name: "llama.cpp", icon: "memory", color: "#795548", textIcon: "LC", website: "https://github.com/ggml-org/llama.cpp", authHint: "API key optional. Configure the llama-server OpenAI-compatible base URL (default: http://127.0.0.1:8080/v1).", localDefault: "http://127.0.0.1:8080/v1", passthroughModels: true },
  triton: { id: "triton", alias: "triton", name: "NVIDIA Triton", icon: "developer_board", color: "#76B900", textIcon: "TR", website: "https://developer.nvidia.com/triton-inference-server", authHint: "API key optional. Configure the Triton OpenAI-compatible base URL (default: http://localhost:8000/v1).", localDefault: "http://localhost:8000/v1", passthroughModels: true },
  "docker-model-runner": { id: "docker-model-runner", alias: "dmr", name: "Docker Model Runner", icon: "inventory_2", color: "#2496ED", textIcon: "DM", website: "https://docs.docker.com/ai/model-runner/", authHint: "API key optional. Configure the local Docker Model Runner OpenAI-compatible base URL (default: http://localhost:12434/v1).", localDefault: "http://localhost:12434/v1", passthroughModels: true },
  xinference: { id: "xinference", alias: "xinference", name: "XInference", icon: "hub", color: "#DC2626", textIcon: "XI", website: "https://inference.readthedocs.io", authHint: "API key optional. Configure the local XInference OpenAI-compatible base URL (default: http://localhost:9997/v1).", localDefault: "http://localhost:9997/v1", passthroughModels: true },
  oobabooga: { id: "oobabooga", alias: "ooba", name: "oobabooga", icon: "dns", color: "#8B5CF6", textIcon: "OO", website: "https://github.com/oobabooga/text-generation-webui", authHint: "API key optional. Configure the local oobabooga OpenAI-compatible base URL (default: http://localhost:5000/v1).", localDefault: "http://localhost:5000/v1", passthroughModels: true },
};

// ============================================================================
// SEARCH PROVIDERS
// ============================================================================

export const SEARCH_PROVIDERS = {
  "perplexity-search": { id: "perplexity-search", alias: "pplx-search", name: "Perplexity Search", icon: "search", color: "#20808D", textIcon: "PS", website: "https://docs.perplexity.ai/guides/search-quickstart", authHint: "Same API key as Perplexity (pplx-...)", serviceKinds: ["webSearch"] },
  "serper-search": { id: "serper-search", alias: "serper-search", name: "Serper Search", icon: "search", color: "#4285F4", textIcon: "SP", website: "https://serper.dev", hasFree: true, authHint: "API key from serper.dev dashboard", serviceKinds: ["webSearch"] },
  "brave-search": { id: "brave-search", alias: "brave-search", name: "Brave Search", icon: "travel_explore", color: "#FB542B", textIcon: "BR", website: "https://brave.com/search/api", hasFree: true, authHint: "Subscription token from Brave Search API dashboard", serviceKinds: ["webSearch"] },
  "exa-search": { id: "exa-search", alias: "exa-search", name: "Exa Search", icon: "neurology", color: "#1E40AF", textIcon: "EX", website: "https://exa.ai", hasFree: true, authHint: "API key from dashboard.exa.ai", serviceKinds: ["webSearch", "webFetch"] },
  "tavily-search": { id: "tavily-search", alias: "tavily-search", name: "Tavily Search", icon: "manage_search", color: "#5B4FDB", textIcon: "TV", website: "https://tavily.com", hasFree: true, authHint: "API key from app.tavily.com (format: tvly-...)", serviceKinds: ["webSearch", "webFetch"] },
  "google-pse-search": { id: "google-pse-search", alias: "google-pse", name: "Google Programmable Search", icon: "travel_explore", color: "#4285F4", textIcon: "GP", website: "https://developers.google.com/custom-search/v1/overview", authHint: "Requires a Google API key and your Programmable Search Engine ID (cx)", serviceKinds: ["webSearch"] },
  "linkup-search": { id: "linkup-search", alias: "linkup", name: "Linkup Search", icon: "public", color: "#0F766E", textIcon: "LU", website: "https://docs.linkup.so", authHint: "Bearer API key from the Linkup dashboard", serviceKinds: ["webSearch"] },
  "searchapi-search": { id: "searchapi-search", alias: "searchapi", name: "SearchAPI", icon: "manage_search", color: "#2563EB", textIcon: "SA", website: "https://www.searchapi.io/docs", authHint: "API key from SearchAPI", serviceKinds: ["webSearch"] },
  "youcom-search": { id: "youcom-search", alias: "youcom-search", name: "You.com Search", icon: "travel_explore", color: "#2563EB", textIcon: "YOU", website: "https://you.com/docs/search/overview", authHint: "X-API-Key from the You.com platform dashboard", serviceKinds: ["webSearch"] },
  "searxng-search": { id: "searxng-search", alias: "searxng-search", name: "SearXNG Search", icon: "search", color: "#1A237E", textIcon: "SX", website: "https://docs.searxng.org", hasFree: true, authHint: "API key is optional. Set your SearXNG base URL.", serviceKinds: ["webSearch"] },
  "ollama-search": { id: "ollama-search", alias: "ollama-search", name: "Ollama Search", icon: "search", color: "#58A6FF", textIcon: "OS", website: "https://ollama.com/settings/api-keys", authHint: "Same API key as Ollama Cloud", serviceKinds: ["webSearch"] },
};

// ============================================================================
// AUDIO ONLY PROVIDERS
// ============================================================================

export const AUDIO_ONLY_PROVIDERS = {
  inworld: { id: "inworld", alias: "inworld", name: "Inworld", icon: "voice_chat", color: "#7B2EF2", textIcon: "IW", website: "https://inworld.ai", serviceKinds: ["tts"] },
  "aws-polly": { id: "aws-polly", alias: "polly", name: "AWS Polly", icon: "record_voice_over", color: "#FF9900", textIcon: "PL", website: "https://aws.amazon.com/polly/", authHint: "Use AWS Secret Access Key as API key; set providerSpecificData.accessKeyId and optional region.", serviceKinds: ["tts"] },
};

// ============================================================================
// UPSTREAM PROXY PROVIDERS
// ============================================================================

export const UPSTREAM_PROXY_PROVIDERS = {
  cliproxyapi: { id: "cliproxyapi", alias: "cpa", name: "CLIProxyAPI", icon: "proxy", color: "#6366F1", textIcon: "CPA", website: "https://github.com/router-for-me/CLIProxyAPI", defaultPort: 8317, healthEndpoint: "/v1/models", managementPrefix: "/v0/management", configDir: "~/.cli-proxy-api", binaryName: "cli-proxy-api", githubRepo: "router-for-me/CLIProxyAPI" },
  "9router": { id: "9router", alias: "nr", name: "9router", icon: "router", color: "#0EA5E9", textIcon: "9R", website: "https://www.npmjs.com/package/9router", defaultPort: 20130, healthEndpoint: "/api/health", npmPackage: "9router", embedded: true, isEmbeddedService: true, riskNoticeVariant: "embedded-service" },
};

// ============================================================================
// CLOUD AGENT PROVIDERS
// ============================================================================

export const CLOUD_AGENT_PROVIDERS = {
  jules: { id: "jules", alias: "jules", name: "Google Jules", icon: "engineering", color: "#4285F4", textIcon: "JL", website: "https://jules.google", authHint: "Jules API key for creating and managing cloud coding tasks." },
  devin: { id: "devin", alias: "devin", name: "Devin", icon: "smart_toy", color: "#111827", textIcon: "DV", website: "https://devin.ai", authHint: "Devin API key for cloud agent sessions." },
  "codex-cloud": { id: "codex-cloud", alias: "codex-cloud", name: "Codex Cloud", icon: "cloud", color: "#10A37F", textIcon: "CC", website: "https://openai.com/codex", authHint: "OpenAI API key with Codex Cloud task access." },
};

// ============================================================================
// SYSTEM PROVIDERS (virtual, not user-connectable)
// ============================================================================

export const SYSTEM_PROVIDERS = {
  auto: { id: "auto", alias: "auto", name: "Auto (Zero-Config)", icon: "auto_awesome", color: "#6366F1", textIcon: "Auto", systemOnly: true, description: "Zero-config auto-routing with LKGP across all connected providers" },
};

// ============================================================================
// SUB-CATEGORY SETS (used by dashboard and catalog views)
// ============================================================================

export const IMAGE_ONLY_PROVIDER_IDS = new Set(["nanobanana", "fal-ai", "stability-ai", "black-forest-labs", "recraft", "topaz"]);

export const AGGREGATOR_PROVIDER_IDS = new Set([
  "openrouter", "synthetic", "kilo-gateway", "aimlapi", "novita", "piapi",
  "getgoapi", "laozhang", "vercel-ai-gateway", "agentrouter", "glhf",
  "cablyai", "thebai", "fenayai", "empower", "poe", "chutes", "hackclub",
]);

export const ENTERPRISE_CLOUD_PROVIDER_IDS = new Set([
  "azure-openai", "azure-ai", "bedrock", "watsonx", "oci", "sap",
  "vertex", "vertex-partner", "databricks", "datarobot", "clarifai",
  "snowflake", "heroku", "modal",
]);

export const VIDEO_PROVIDER_IDS = new Set([
  "runwayml", "veoaifree-web", "pollinations", "minimax",
  "together", "replicate", "haiper", "leonardo",
]);

export const IDE_PROVIDER_IDS = new Set(["cursor", "zed", "trae"]);

export const EMBEDDING_RERANK_PROVIDER_IDS = new Set(["voyage-ai", "jina-ai"]);

// ============================================================================
// COMPATIBLE PREFIX CONSTANTS & FUNCTIONS
// ============================================================================

export const OPENAI_COMPATIBLE_PREFIX = "openai-compatible-";
export const ANTHROPIC_COMPATIBLE_PREFIX = "anthropic-compatible-";
export const CLAUDE_CODE_COMPATIBLE_PREFIX = "anthropic-compatible-cc-";

export function isOpenAICompatibleProvider(providerId) {
  return typeof providerId === "string" && providerId.startsWith(OPENAI_COMPATIBLE_PREFIX);
}

export function isAnthropicCompatibleProvider(providerId) {
  return typeof providerId === "string" && providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX);
}

export function isClaudeCodeCompatibleProvider(providerId) {
  return typeof providerId === "string" && providerId.startsWith(CLAUDE_CODE_COMPATIBLE_PREFIX);
}

export function isMorphManagedProvider(providerId) {
  return providerId === MORPH_MANAGED_PROVIDER_ID;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function isLocalProvider(providerId) {
  return typeof providerId === "string" && Object.prototype.hasOwnProperty.call(LOCAL_PROVIDERS, providerId);
}

export const SELF_HOSTED_CHAT_PROVIDER_IDS = new Set([
  "lm-studio", "vllm", "lemonade", "llamafile", "llama-cpp",
  "triton", "docker-model-runner", "xinference", "oobabooga",
]);

export function isSelfHostedChatProvider(providerId) {
  return typeof providerId === "string" && SELF_HOSTED_CHAT_PROVIDER_IDS.has(providerId);
}

export function providerAllowsOptionalApiKey(providerId) {
  return (
    providerId === "searxng-search" ||
    providerId === "petals" ||
    providerId === "pollinations" ||
    providerId === "copilot-web" ||
    providerId === "veoaifree-web" ||
    providerId === "hackclub" ||
    providerId === "huggingchat" ||
    providerId === "gitlawb" ||
    providerId === "gitlawb-gmi" ||
    isLocalProvider(providerId) ||
    isSelfHostedChatProvider(providerId) ||
    isOpenAICompatibleProvider(providerId) ||
    isAnthropicCompatibleProvider(providerId)
  );
}

const BULK_API_KEY_EXCLUDED = new Set([
  "vertex", "vertex-partner", "ollama-local", "grok-web", "perplexity-web",
  "blackbox-web", "muse-spark-web", "deepseek-web", "inner-ai", "qoder",
  "google-pse-search", "command-code", "azure", "cloudflare-ai",
]);

export function supportsBulkApiKey(providerId) {
  if (typeof providerId !== "string" || !providerId) return false;
  if (BULK_API_KEY_EXCLUDED.has(providerId)) return false;
  if (isLocalProvider(providerId)) return false;
  if (isSelfHostedChatProvider(providerId)) return false;
  if (isClaudeCodeCompatibleProvider(providerId)) return false;
  return true;
}

// ============================================================================
// COMBINED AI_PROVIDERS
// ============================================================================

export const AI_PROVIDERS = {
  ...FREE_PROVIDERS,
  ...FREE_TIER_PROVIDERS,
  ...OAUTH_PROVIDERS,
  ...APIKEY_PROVIDERS,
  ...WEB_COOKIE_PROVIDERS,
  ...LOCAL_PROVIDERS,
  ...SEARCH_PROVIDERS,
  ...AUDIO_ONLY_PROVIDERS,
  ...UPSTREAM_PROXY_PROVIDERS,
  ...CLOUD_AGENT_PROVIDERS,
  ...SYSTEM_PROVIDERS,
};

export type AiProviderId = keyof typeof AI_PROVIDERS;
export type AiProviderDefinition = (typeof AI_PROVIDERS)[AiProviderId];

// ============================================================================
// AUTH METHODS
// ============================================================================

export const AUTH_METHODS = {
  oauth: { id: "oauth", name: "OAuth", icon: "lock" },
  apikey: { id: "apikey", name: "API Key", icon: "key" },
  cookie: { id: "cookie", name: "Browser Cookie", icon: "cookie" },
};

// ============================================================================
// LOOKUP HELPERS
// ============================================================================

// Helper: Get provider by alias
export function getProviderByAlias(alias) {
  for (const provider of Object.values(AI_PROVIDERS)) {
    if (provider.alias === alias || provider.id === alias) {
      return provider;
    }
  }
  return null;
}

// Helper: Get provider ID from alias
export function resolveProviderId(aliasOrId) {
  const provider = getProviderByAlias(aliasOrId);
  return provider?.id || aliasOrId;
}

// Helper: Get alias from provider ID
export function getProviderAlias(providerId) {
  const provider = AI_PROVIDERS[providerId];
  return provider?.alias || providerId;
}

// Alias to ID mapping (for quick lookup)
export const ALIAS_TO_ID = Object.values(AI_PROVIDERS).reduce((acc, p) => {
  acc[p.alias] = p.id;
  return acc;
}, {});

// ID to Alias mapping
export const ID_TO_ALIAS = Object.values(AI_PROVIDERS).reduce((acc, p) => {
  acc[p.id] = p.alias;
  return acc;
}, {});

// Helper: Get providers by service kind (e.g. "tts", "embedding", "image")
// Providers without serviceKinds default to ["llm"]
export function getProvidersByKind(kind) {
  return Object.values(AI_PROVIDERS).filter((provider) => {
    const p: any = provider;
    const kinds = Array.isArray(p.serviceKinds) ? p.serviceKinds : ["llm"];
    if (!kinds.includes(kind)) return false;
    if (p.hidden === true) return false; // globally hidden
    if (Array.isArray(p.hiddenKinds) && p.hiddenKinds.includes(kind)) return false; // hidden for specific kind
    return true;
  });
}

export function getProviderSupportedModes(provider) {
  const serviceKinds = provider?.serviceKinds ?? ["llm"];
  const modes = [];
  if (serviceKinds.includes("llm")) modes.push("text");
  if (serviceKinds.includes("image")) modes.push("image");
  if (serviceKinds.includes("tts") || serviceKinds.includes("stt")) modes.push("audio");
  if (serviceKinds.includes("video")) modes.push("video");
  return modes;
}

// ============================================================================
// USAGE SUPPORTED
// ============================================================================

// Providers that support usage/quota API
export const USAGE_SUPPORTED_PROVIDERS = [
  "claude",
  "antigravity",
  "kiro",
  "amazon-q",
  "github",
  "codex",
];
