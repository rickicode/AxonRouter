// Provider alias to ID mapping
const ALIAS_TO_PROVIDER_ID = {
  cc: "claude",
  cx: "codex",
  gc: "gemini-cli",
  qw: "qwen",
  if: "iflow",
  ag: "antigravity",
  gh: "github",
  kr: "kiro",
  cu: "cursor",
  kc: "kilocode",
  kmc: "kimi-coding",
  cl: "cline",
  oc: "opencode",
  ocg: "opencode-go",
  // TTS providers
  el: "elevenlabs",
  // API Key providers
  openai: "openai",
  anthropic: "anthropic",
  gemini: "gemini",
  openrouter: "openrouter",
  commandcode: "commandcode",
  ccmd: "commandcode",
  glm: "glm",
  kimi: "kimi",
  minimax: "minimax",
  "minimax-cn": "minimax-cn",
  ds: "deepseek",
  deepseek: "deepseek",
  groq: "groq",
  xai: "xai",
  mistral: "mistral",
  pplx: "perplexity",
  perplexity: "perplexity",
  together: "together",
  fireworks: "fireworks",
  cerebras: "cerebras",
  cohere: "cohere",
  nvidia: "nvidia",
  nebius: "nebius",
  siliconflow: "siliconflow",
  hyp: "hyperbolic",
  hyperbolic: "hyperbolic",
  dg: "deepgram",
  deepgram: "deepgram",
  aai: "assemblyai",
  assemblyai: "assemblyai",
  nb: "nanobanana",
  nanobanana: "nanobanana",
  ch: "chutes",
  chutes: "chutes",
  ark: "volcengine-ark",
  "volcengine-ark": "volcengine-ark",
  cursor: "cursor",
  vx: "vertex",
  vertex: "vertex",
  vxp: "vertex-partner",
  "vertex-partner": "vertex-partner",
  // Freebuff provider
  fb: "freebuff",
  freebuff: "freebuff",
  // OpenCode variants
  ocz: "opencode-zen",
  "opencode-zen": "opencode-zen",
  ocp: "opencode-provider",
  "opencode-provider": "opencode-provider",
  // Extended providers
  // Amazon Q
  aq: "amazon-q",
  "amazon-q": "amazon-q",
  // Azure
  azure: "azure",
  // Alibaba
  alicode: "alicode",
  "alicode-intl": "alicode-intl",
  // GLM China
  "glm-cn": "glm-cn",
  // Ollama
  ollama: "ollama",
  "ollama-local": "ollama-local",
  // MiMo
  mimo: "mimo",
  // Blackbox
  bb: "blackbox",
  blackbox: "blackbox",
  // Huggingface
  hf: "huggingface",
  huggingface: "huggingface",
  // Morph
  morph: "morph-fast",
  "morph-fast": "morph-fast",
  // OmniRoute-sourced providers
  ai21: "ai21",
  aimlapi: "aimlapi",
  anyscale: "anyscale",
  arcee: "arcee",
  avian: "avian",
  baichuan: "baichuan",
  baseten: "baseten",
  bedrock: "bedrock",
  bfl: "black-forest-labs",
  "black-forest-labs": "black-forest-labs",
  brave: "brave-search",
  "brave-search": "brave-search",
  cartesia: "cartesia",
  centml: "centml",
  cfai: "cloudflare-ai",
  "cloudflare-ai": "cloudflare-ai",
  comfyui: "comfyui",
  constellate: "constellate",
  crusoe: "crusoe",
  databricks: "databricks",
  deepinfra: "deepinfra",
  "edge-tts": "edge-tts",
  exa: "exa",
  featherless: "featherless",
  firecrawl: "firecrawl",
  friendliai: "friendliai",
  glhf: "glhf",
  "google-tts": "google-tts",
  ideogram: "ideogram",
  infini: "infini",
  infnet: "inference-net",
  "inference-net": "inference-net",
  kling: "kling",
  kluster: "kluster",
  lambda: "lambda",
  lepton: "lepton",
  lightning: "lightning-ai",
  "lightning-ai": "lightning-ai",
  lingyi: "lingyiwanwu",
  lingyiwanwu: "lingyiwanwu",
  "local-device": "local-device",
  luma: "luma",
  martian: "martian",
  massed: "massed-compute",
  "massed-compute": "massed-compute",
  modal: "modal",
  monsterapi: "monsterapi",
  moonshot: "moonshot",
  ncompass: "ncompass",
  nineteen: "nineteen-ai",
  "nineteen-ai": "nineteen-ai",
  novita: "novita",
  octoai: "octoai",
  parasail: "parasail",
  pioneer: "pioneer",
  playht: "playht",
  predguard: "predictionguard",
  predictionguard: "predictionguard",
  predibase: "predibase",
  replicate: "replicate",
  runpod: "runpod",
  runway: "runway",
  sambanova: "sambanova",
  scaleway: "scaleway",
  sdwebui: "sdwebui",
  searxng: "searxng",
  sensenova: "sensenova",
  serper: "serper",
  stability: "stability",
  stepfun: "stepfun",
  suno: "suno",
  targon: "targon",
  tavily: "tavily",
  tensoropera: "tensoropera",
  udio: "udio",
  unify: "unify",
  venice: "venice",
  voyage: "voyage",
  writer: "writer",
  yi: "yi",
  zhipu: "zhipu",
  // Web cookie providers
  gw: "grok-web",
  "grok-web": "grok-web",
  pw: "perplexity-web",
  "perplexity-web": "perplexity-web",
};

/**
 * Resolve provider alias to provider ID
 */
export function resolveProviderAlias(aliasOrId) {
  return ALIAS_TO_PROVIDER_ID[aliasOrId] || aliasOrId;
}

/**
 * Parse model string: "alias/model" or "provider/model" or just alias
 */
export function parseModel(modelStr) {
  if (!modelStr) {
    return { provider: null, model: null, isAlias: false, providerAlias: null };
  }

  // Check if standard format: provider/model or alias/model
  if (modelStr.includes("/")) {
    const firstSlash = modelStr.indexOf("/");
    const providerOrAlias = modelStr.slice(0, firstSlash);
    const model = modelStr.slice(firstSlash + 1);
    const provider = resolveProviderAlias(providerOrAlias);
    return { provider, model, isAlias: false, providerAlias: providerOrAlias };
  }

  // Alias format (model alias, not provider alias)
  return {
    provider: null,
    model: modelStr,
    isAlias: true,
    providerAlias: null,
  };
}

/**
 * Resolve model alias from aliases object
 * Format: { "alias": "provider/model" }
 */
export function resolveModelAliasFromMap(alias, aliases) {
  if (!aliases) return null;

  // Check if alias exists
  const resolved = aliases[alias];
  if (!resolved) return null;

  // Resolved value is "provider/model" format
  if (typeof resolved === "string" && resolved.includes("/")) {
    const firstSlash = resolved.indexOf("/");
    const providerOrAlias = resolved.slice(0, firstSlash);
    return {
      provider: resolveProviderAlias(providerOrAlias),
      model: resolved.slice(firstSlash + 1),
    };
  }

  // Or object { provider, model }
  if (typeof resolved === "object" && resolved.provider && resolved.model) {
    return {
      provider: resolveProviderAlias(resolved.provider),
      model: resolved.model,
    };
  }

  return null;
}

/**
 * Get full model info (parse or resolve)
 * @param {string} modelStr - Model string
 * @param {object|function} aliasesOrGetter - Aliases object or async function to get aliases
 */
export async function getModelInfoCore(modelStr, aliasesOrGetter) {
  const parsed = parseModel(modelStr);

  if (!parsed.isAlias) {
    return {
      provider: parsed.provider,
      model: parsed.model,
    };
  }

  // Get aliases (from object or function)
  const aliases =
    typeof aliasesOrGetter === "function"
      ? await aliasesOrGetter()
      : aliasesOrGetter;

  // Resolve alias
  const resolved = resolveModelAliasFromMap(parsed.model, aliases);
  if (resolved) {
    return resolved;
  }

  // Fallback: infer provider from model name prefix
  return {
    provider: inferProviderFromModelName(parsed.model),
    model: parsed.model,
  };
}

/**
 * Infer provider from model name prefix
 * Used as fallback when no provider prefix or alias is given
 */
function inferProviderFromModelName(modelName) {
  if (!modelName) return "openai";
  const m = modelName.toLowerCase();
  if (m.startsWith("claude-")) return "anthropic";
  if (m.startsWith("gemini-")) return "gemini";
  if (m.startsWith("gpt-")) return "openai";
  if (m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4"))
    return "openai";
  if (m.startsWith("deepseek-")) return "openrouter";
  if (m.includes("/")) return "commandcode";
  // Default fallback
  return "openai";
}
