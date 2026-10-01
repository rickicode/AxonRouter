// BeatAPI — one key across text, image, video, Jev and workflow APIs.
//
// The catalogue below is not hand-curated from marketing pages; every id was read
// back from the live API (2026-10-01) and every media id was then probed against
// its own task endpoint to see whether the model is actually servable:
//
//   GET  /v1/models        -> 40 ids: 30 text + 8 image + 1 jev + 1 router
//   GET  /v1/media/models  -> 25 ids: 15 video + 10 image  <- video lives ONLY here
//   POST /v1/chat/completions, /v1/images/tasks, /v1/videos/tasks, /v1/systemone
//
// Two things that are not obvious from the docs and that shaped this file:
//
//  1. The 8 image ids in /v1/models are NOT image-generation models. Probing
//     /v1/images/tasks with `gemini-3.1-flash-image-preview` returns
//     400 "not catalogued" — those ids are reachable only through the text API.
//     The real generation catalogue is /v1/media/models, so `imageConfig` points
//     at the task API and only the media-catalogue ids are declared `image`.
//     Declaring the /v1/models image ids as image models would advertise 8 models
//     that 400 on every call.
//
//  2. Media and text run on a free-tier allow-list. A key with no balance answers
//     402 insufficient_credits for allow-listed models and 403 "not available on
//     free credit" for the rest, so `beatFree` records the measured split. Only
//     Jev and space-bunny-alpha are usable on a zero-balance key today.
//
// Media generation is asynchronous: POST returns 201 with a `task_…` id, and the
// result is polled from GET /v1/tasks/{id} until `succeeded`. The image adapter
// (open-sse/handlers/imageProviders/beatapi.js) implements that submit+poll loop.
export default {
  id: "beatapi",
  priority: 41,
  alias: "beatapi",
  aliases: [
    "beat",
    "bt",
    "beat-ai",
  ],
  uiAlias: "bt",
  serviceKinds: ["llm", "image", "video", "jev"],

  // Free System One (Jev) classifier. The only classifier on this key that works
  // without a balance, and the reason beatapi is wired into the JEV picker.
  jevConfig: {
    endpoint: "https://api.beatapi.io/v1/systemone",
    models: [
      { id: "jev-1.13-free", name: "Jev 1.13 Free (System One)", default: true, requiresKey: true },
    ],
    keyPool: true,
  },

  display: {
    name: "BeatAPI",
    icon: "music_note",
    color: "#F43F5E",
    textIcon: "BT",
    website: "https://beatapi.io",
    notice: {
      text: "One key for text, image, video and the System One (Jev) classifier. Text answers synchronously (OpenAI, Anthropic and Gemini request shapes); image and video are asynchronous tasks — submit, then poll the returned task id. Free credit covers space-bunny-alpha, the Jev endpoint and part of the image catalogue; video and most text models need a top-up.",
      apiKeyUrl: "https://beatapi.io/dashboard/apikeys",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.beatapi.io/v1",
    validateUrl: "https://api.beatapi.io/v1/models",
  },

  // Image generation is a task API, not a synchronous /images/generations call.
  // The adapter reads these, so they are the single source for the submit URL.
  imageConfig: { baseUrl: "https://api.beatapi.io/v1/images/tasks" },
  // Video uses the same submit shape. The poll route is /v1/tasks/{id}, not a
  // child of this path — videoCore derives the poll URL from baseUrl, so video
  // needs its own routing before it is callable; see hiddenKinds below.
  videoConfig: { baseUrl: "https://api.beatapi.io/v1/videos/tasks" },

  // `video` is withheld from routing until the poll route is handled: videoCore
  // would poll /v1/videos/tasks/{id}, which BeatAPI does not serve (it 404s), so
  // advertising the kind would hand every video request a guaranteed failure.
  // The models stay declared so the catalogue and the dashboard still show them.
  hiddenKinds: ["video"],

  models: [
    // ---- System One classifier -------------------------------------------------
    { id: "jev-1.13-free", name: "Jev 1.13 Free (System One)", kind: "jev", targetFormat: "systemone", default: true },

    // ---- Text ------------------------------------------------------------------
    // Free on a zero-balance key today (measured: 402 rather than 403), 1M context.
    { id: "space-bunny-alpha", name: "Space Bunny Alpha", capabilities: ["vision", "videoInput", "tools"] },

    // Allow-listed for free credit but need a balance to actually answer.
    { id: "gpt-6-astra", name: "GPT 6 Astra" },
    { id: "gpt-5.6-terra", name: "GPT 5.6 Terra" },
    { id: "gpt-5.6-luna", name: "GPT 5.6 Luna" },
    { id: "gpt-5.6-sol", name: "GPT 5.6 Sol" },
    { id: "claude-fable-5-1", name: "Claude Fable 5.1" },
    { id: "claude-opus-5", name: "Claude Opus 5" },
    { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
    { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
    { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash" },
    { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
    { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
    { id: "grok-4.5", name: "Grok 4.5" },
    { id: "grok-4.6", name: "Grok 4.6" },
    { id: "grok-4.7", name: "Grok 4.7" },
    { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash" },
    { id: "deepseek-v4-pro-0813", name: "DeepSeek V4 Pro 0813" },
    { id: "deepseek-v4-flash-0731", name: "DeepSeek V4 Flash 0731" },
    { id: "kimi-k2.6", name: "Kimi K2.6" },
    { id: "kimi-k2.7-code", name: "Kimi K2.7 Code" },
    { id: "kimi-k3", name: "Kimi K3" },
    { id: "glm-5.3", name: "GLM 5.3" },
    { id: "glm-5.3-flash", name: "GLM 5.3 Flash" },
    { id: "MiniMax-M3", name: "MiniMax M3", model: "MiniMax-M3" },
    { id: "qwen3.7-max", name: "Qwen 3.7 Max" },
    { id: "qwen3.8-flash", name: "Qwen 3.8 Flash" },
    { id: "qwen3.8-max", name: "Qwen 3.8 Max" },
    { id: "hy3", name: "Hunyuan 3" },
    { id: "hy4-preview", name: "Hunyuan 4 Preview" },

    // ---- Image (async task API; free-tier ids measured, the rest need a top-up) --
    { id: "nano-banana", name: "Nano Banana", kind: "image", params: ["aspect_ratio", "resolution", "output_format"], beatFree: true },
    { id: "nano-banana-2-lite", name: "Nano Banana 2 Lite", kind: "image", params: ["aspect_ratio", "resolution", "output_format"], beatFree: true },
    { id: "nano-banana-pro", name: "Nano Banana Pro", kind: "image", params: ["aspect_ratio", "resolution", "output_format"], beatFree: true },
    { id: "gpt-image-2", name: "GPT Image 2", kind: "image", params: ["aspect_ratio", "resolution", "size", "background"], beatFree: true },
    { id: "gpt-image-2.5-flare", name: "GPT Image 2.5 Flare", kind: "image", params: ["aspect_ratio", "resolution", "size", "background"], beatFree: true },
    { id: "gpt-image-2.5-sunburst", name: "GPT Image 2.5 Sunburst", kind: "image", params: ["aspect_ratio", "resolution", "size", "background"], beatFree: true },
    { id: "grok-imagine-image-2.0", name: "Grok Imagine Image 2.0", kind: "image", params: ["aspect_ratio"], beatFree: true },
    { id: "qwen-image-2.1", name: "Qwen Image 2.1", kind: "image", params: ["aspect_ratio", "resolution", "output_format", "seed", "enhance_prompt"], beatFree: false },
    { id: "seedream-5-pro", name: "Seedream 5.0 Pro", kind: "image", params: ["aspect_ratio", "resolution", "output_format"], beatFree: false },
    // Advertised by /v1/media/models but rejected by /v1/images/tasks with
    // 400 "not catalogued" — kept out of the generation list on purpose.
    { id: "nano-banana-2", name: "Nano Banana 2 (listed, not yet served)", kind: "image", params: ["aspect_ratio", "resolution", "output_format"], beatFree: false, hidden: true },

    // ---- Video (async task API; every id measured as top-up only) --------------
    { id: "minimax-h3", name: "MiniMax H3", kind: "video", params: ["duration", "aspect_ratio", "resolution"] },
    { id: "minimax-h3-fast", name: "MiniMax H3 Fast", kind: "video", params: ["duration", "aspect_ratio", "resolution"] },
    { id: "minimax-h3-normal", name: "MiniMax H3 Normal", kind: "video", params: ["duration", "aspect_ratio", "resolution", "seed"] },
    { id: "minimax-h3-max", name: "MiniMax H3 Max", kind: "video", params: ["duration", "resolution", "seed"] },
    { id: "minimax-h3-max-turbo", name: "MiniMax H3 Max Turbo", kind: "video", params: ["duration", "resolution", "seed"] },
    { id: "seedance-2", name: "Seedance 2.0", kind: "video", params: ["duration", "aspect_ratio", "resolution", "generate_audio"] },
    { id: "seedance-2-fast", name: "Seedance 2.0 Fast", kind: "video", params: ["duration", "aspect_ratio", "resolution", "generate_audio"] },
    { id: "seedance-2-mini", name: "Seedance 2.0 Mini", kind: "video", params: ["duration", "aspect_ratio", "resolution"] },
    { id: "seedance-2.5", name: "Seedance 2.5", kind: "video", params: ["duration", "aspect_ratio", "resolution", "generate_audio", "seed"] },
    { id: "veo-3.1", name: "Veo 3.1", kind: "video", params: ["duration", "aspect_ratio", "resolution", "quality", "watermark", "enable_translation"] },
    { id: "kling-v3", name: "Kling V3", kind: "video", params: ["duration", "aspect_ratio", "resolution", "sound", "multi_shots"] },
    { id: "wan-3.0", name: "Wan 3.0", kind: "video", params: ["duration", "aspect_ratio", "resolution"] },
    { id: "wan-3.0-prime", name: "Wan 3.0 Prime", kind: "video", params: ["duration", "aspect_ratio", "resolution"] },
    { id: "grok-imagine-video-1.5", name: "Grok Imagine Video 1.5", kind: "video", params: ["duration", "aspect_ratio", "resolution"], hidden: true },
    { id: "happyhorse-1.1", name: "HappyHorse 1.1", kind: "video", params: ["duration", "aspect_ratio", "resolution"], hidden: true },
  ],
};
