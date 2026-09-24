// AUTO-GENERATED — UI projection of the provider registry for the client bundle.
//
// `src/shared/constants/{providers,providersDisplay}.js` import this file instead of
// `./index.js` so the browser never ships server-only data (transport runtime, OAuth
// client secrets/token endpoints, internal retry + credit-pricing flags). Every entry
// in `index.js` is present here; only server-side keys are stripped.
//
//   dropped: transport, transports, oauth, auth, pricing, forceStream
//   kept:    id, priority, alias, aliases, uiAlias, category, hidden, display, authType, hasOAuth, authModes, noAuth, authHint, hasProviderSpecificData, passthroughModels, hasFree, features, thinkingConfig, regions, defaultRegion, media, serviceKinds, ttsConfig, sttConfig, embeddingConfig, imageConfig, imageToTextConfig, videoConfig, musicConfig, searchViaChat, searchConfig, fetchConfig, credentialFallback, modelsFetcher, mediaPriority, hiddenKinds, models
//
// This is a snapshot, NOT a live view: it is `REGISTRY.map(r => pick(r, kept fields))`
// where REGISTRY is the default export of ./index.js. Regenerate it whenever anything
// under open-sse/providers/registry/ changes — a new provider file, a renamed field, an
// edited display/icon or models array. A new top-level registry field must be classified
// as kept or dropped, then projected here. Never hand-edit the entries below.

export const REGISTRY_UI = [
  {
    id: "alicode-intl",
    priority: 10,
    alias: "alicode-intl",
    category: "apikey",
    display: {
      name: "Alibaba Coding",
      icon: "cloud",
      color: "#FF6A00",
      textIcon: "ALi",
      website: "https://www.alibabacloud.com/product/coding",
      notice: {
        apiKeyUrl: "https://www.alibabacloud.com/product/coding"
      }
    },
    models: [
      {
        id: "qwen3.5-plus",
        name: "Qwen3.5 Plus"
      },
      {
        id: "kimi-k2.5",
        name: "Kimi K2.5"
      },
      {
        id: "glm-5",
        name: "GLM 5"
      },
      {
        id: "MiniMax-M2.5",
        name: "MiniMax M2.5"
      },
      {
        id: "qwen3-coder-next",
        name: "Qwen3 Coder Next"
      },
      {
        id: "qwen3-coder-plus",
        name: "Qwen3 Coder Plus"
      },
      {
        id: "glm-4.7",
        name: "GLM 4.7"
      }
    ]
  },
  {
    id: "alicode",
    priority: 20,
    alias: "alicode",
    category: "apikey",
    display: {
      name: "Alibaba",
      icon: "cloud",
      color: "#FF6A00",
      textIcon: "ALi",
      website: "https://bailian.console.aliyun.com",
      notice: {
        apiKeyUrl: "https://bailian.console.aliyun.com/?apiKey=1"
      }
    },
    models: [
      {
        id: "qwen3.5-plus",
        name: "Qwen3.5 Plus"
      },
      {
        id: "kimi-k2.5",
        name: "Kimi K2.5"
      },
      {
        id: "glm-5",
        name: "GLM 5"
      },
      {
        id: "MiniMax-M2.5",
        name: "MiniMax M2.5"
      },
      {
        id: "qwen3-max-2026-01-23",
        name: "Qwen3 Max"
      },
      {
        id: "qwen3-coder-next",
        name: "Qwen3 Coder Next"
      },
      {
        id: "qwen3-coder-plus",
        name: "Qwen3 Coder Plus"
      },
      {
        id: "glm-4.7",
        name: "GLM 4.7"
      }
    ]
  },
  {
    id: "anthropic",
    priority: 30,
    alias: "anthropic",
    category: "apikey",
    display: {
      name: "Anthropic",
      icon: "smart_toy",
      color: "#D97757",
      textIcon: "AN",
      website: "https://console.anthropic.com",
      notice: {
        apiKeyUrl: "https://console.anthropic.com/settings/keys"
      }
    },
    serviceKinds: [
      "llm",
      "imageToText"
    ],
    models: [
      {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4"
      },
      {
        id: "claude-opus-4-20250514",
        name: "Claude Opus 4"
      },
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet"
      }
    ]
  },
  {
    id: "antigravity",
    priority: 20,
    alias: "ag",
    uiAlias: "ag",
    category: "oauth",
    display: {
      name: "Antigravity",
      icon: "rocket_launch",
      color: "#F59E0B",
      website: "https://antigravity.google",
      notice: {
        signupUrl: "https://antigravity.google"
      },
      deprecated: true,
      deprecationNotice: "RISK_NOTICE"
    },
    features: {
      usage: true
    },
    serviceKinds: [
      "llm",
      "image",
      "webSearch"
    ],
    searchViaChat: {
      defaultModel: "gemini-2.5-flash",
      endpoint: "https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent",
      freeTier: "Free — Google Search grounding through an Antigravity OAuth account."
    },
    models: [
      {
        id: "gemini-3.8-flash-high",
        name: "Gemini 3.8 Flash (High)",
        upstreamModelId: "gemini-3.8-flash-high(high)"
      },
      {
        id: "gemini-3.8-flash-medium",
        name: "Gemini 3.8 Flash (Medium)",
        upstreamModelId: "gemini-3.8-flash-medium(medium)"
      },
      {
        id: "gemini-3.8-flash-low",
        name: "Gemini 3.8 Flash (Low)",
        upstreamModelId: "gemini-3.8-flash-low(low)"
      },
      {
        id: "gemini-3.8-flash",
        name: "Gemini 3.8 Flash",
        upstreamModelId: "gemini-3.8-flash-medium(medium)"
      },
      {
        id: "gemini-3.7-flash-high",
        name: "Gemini 3.7 Flash (High)",
        upstreamModelId: "gemini-3.7-flash-tiered(high)"
      },
      {
        id: "gemini-3.7-flash-medium",
        name: "Gemini 3.7 Flash (Medium)",
        upstreamModelId: "gemini-3.7-flash-tiered(medium)"
      },
      {
        id: "gemini-3.7-flash-low",
        name: "Gemini 3.7 Flash (Low)",
        upstreamModelId: "gemini-3.7-flash-tiered(low)"
      },
      {
        id: "gemini-3.6-flash-high",
        name: "Gemini 3.6 Flash (High)",
        upstreamModelId: "gemini-3.6-flash-tiered(high)"
      },
      {
        id: "gemini-3.6-flash-medium",
        name: "Gemini 3.6 Flash (Medium)",
        upstreamModelId: "gemini-3.6-flash-tiered(medium)"
      },
      {
        id: "gemini-3.6-flash-low",
        name: "Gemini 3.6 Flash (Low)",
        upstreamModelId: "gemini-3.6-flash-tiered(low)"
      },
      {
        id: "gemini-3.5-flash-high",
        name: "Gemini 3.5 Flash (High)"
      },
      {
        id: "gemini-3-flash-agent",
        name: "Gemini 3.5 Flash (High)"
      },
      {
        id: "gemini-3.5-flash-low",
        name: "Gemini 3.5 Flash (Medium)"
      },
      {
        id: "gemini-3.5-flash-extra-low",
        name: "Gemini 3.5 Flash (Low)"
      },
      {
        id: "gemini-pro-agent",
        name: "Gemini 3.1 Pro (High)"
      },
      {
        id: "gemini-3.1-pro-low",
        name: "Gemini 3.1 Pro (Low)"
      },
      {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6 (Thinking)"
      },
      {
        id: "claude-opus-4-6-thinking",
        name: "Claude Opus 4.6 (Thinking)"
      },
      {
        id: "gpt-oss-120b-medium",
        name: "GPT-OSS 120B (Medium)"
      },
      {
        id: "gemini-3-flash",
        name: "Gemini 3 Flash",
        thinking: false
      },
      {
        id: "gemini-3.1-flash-image",
        name: "Gemini 3.1 Flash (Image)",
        kind: "image",
        imageGen: true,
        capabilities: [
          "textToImage"
        ]
      }
    ]
  },
  {
    id: "assemblyai",
    priority: 30,
    alias: "assemblyai",
    aliases: [
      "aai"
    ],
    uiAlias: "aai",
    category: "apikey",
    display: {
      name: "AssemblyAI",
      icon: "record_voice_over",
      color: "#0062FF",
      textIcon: "AA",
      website: "https://assemblyai.com",
      notice: {
        apiKeyUrl: "https://www.assemblyai.com/app/api-keys"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "stt"
    ],
    sttConfig: {
      baseUrl: "https://api.assemblyai.com/v2/transcript",
      authType: "apikey",
      authHeader: "authorization",
      format: "assemblyai"
    },
    models: [
      {
        id: "universal-3-pro",
        name: "Universal 3 Pro",
        params: [
          "language"
        ],
        kind: "stt"
      },
      {
        id: "universal-2",
        name: "Universal 2",
        params: [
          "language"
        ],
        kind: "stt"
      },
      {
        id: "best",
        name: "Best (Nano + Universal)",
        kind: "stt"
      },
      {
        id: "nano",
        name: "Nano (Fast)",
        kind: "stt"
      }
    ]
  },
  {
    id: "aws-polly",
    alias: "polly",
    category: "apikey",
    display: {
      name: "AWS Polly",
      icon: "record_voice_over",
      color: "#FF9900",
      textIcon: "PL",
      website: "https://aws.amazon.com/polly/",
      notice: {
        text: "Use AWS Secret Access Key as API key; set providerSpecificData.accessKeyId and optional region.",
        apiKeyUrl: "https://console.aws.amazon.com/iam/home#/security_credentials"
      }
    },
    authType: "apikey",
    hasProviderSpecificData: true,
    serviceKinds: [
      "tts"
    ],
    ttsConfig: {
      baseUrl: "https://polly.{region}.amazonaws.com/v1/speech",
      authType: "apikey",
      authHeader: "aws-sigv4",
      format: "aws-polly",
      models: [
        {
          id: "standard",
          name: "Standard"
        },
        {
          id: "neural",
          name: "Neural"
        },
        {
          id: "long-form",
          name: "Long-form"
        },
        {
          id: "generative",
          name: "Generative"
        }
      ]
    }
  },
  {
    id: "azure",
    priority: 40,
    alias: "azure",
    category: "apikey",
    display: {
      name: "Azure OpenAI",
      icon: "cloud",
      color: "#0078D4",
      textIcon: "AZ",
      website: "https://azure.microsoft.com/en-us/products/ai-services/openai-service",
      notice: {
        apiKeyUrl: "https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/OpenAI"
      }
    },
    hasProviderSpecificData: true
  },
  {
    id: "black-forest-labs",
    priority: 50,
    alias: "black-forest-labs",
    aliases: [
      "bfl"
    ],
    uiAlias: "bfl",
    category: "apikey",
    display: {
      name: "Black Forest Labs",
      icon: "image",
      color: "#111827",
      textIcon: "BF",
      website: "https://blackforestlabs.ai",
      notice: {
        apiKeyUrl: "https://api.bfl.ai"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "image"
    ],
    imageConfig: {
      baseUrl: "https://api.bfl.ai/v1"
    },
    models: [
      {
        id: "flux-pro-1.1",
        name: "FLUX Pro 1.1",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      },
      {
        id: "flux-pro-1.1-ultra",
        name: "FLUX Pro 1.1 Ultra",
        params: [
          "size"
        ],
        kind: "image"
      },
      {
        id: "flux-pro",
        name: "FLUX Pro",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      },
      {
        id: "flux-dev",
        name: "FLUX Dev",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      },
      {
        id: "flux-kontext-pro",
        name: "FLUX Kontext Pro (Edit)",
        params: [
          "size"
        ],
        capabilities: [
          "edit"
        ],
        kind: "image"
      },
      {
        id: "flux-kontext-max",
        name: "FLUX Kontext Max (Edit)",
        params: [
          "size"
        ],
        capabilities: [
          "edit"
        ],
        kind: "image"
      }
    ]
  },
  {
    id: "blackbox",
    priority: 50,
    alias: "blackbox",
    aliases: [
      "bb"
    ],
    uiAlias: "bb",
    category: "apikey",
    display: {
      name: "Blackbox AI",
      icon: "smart_toy",
      color: "#5B5FEF",
      textIcon: "BB",
      website: "https://blackbox.ai",
      notice: {
        apiKeyUrl: "https://www.blackbox.ai/api-management"
      }
    },
    thinkingConfig: {
      options: [
        "auto",
        "none",
        "low",
        "medium",
        "high",
        "xhigh"
      ],
      defaultMode: "auto"
    },
    serviceKinds: [
      "llm"
    ],
    models: [
      {
        id: "claude-fable-5",
        name: "Claude Fable 5",
        upstreamModelId: "blackboxai/anthropic/claude-fable-5"
      },
      {
        id: "claude-opus-4.8",
        name: "Claude Opus 4.8",
        upstreamModelId: "blackboxai/anthropic/claude-opus-4.8"
      },
      {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        upstreamModelId: "blackboxai/anthropic/claude-sonnet-4.6"
      },
      {
        id: "gpt-5.5",
        name: "GPT-5.5",
        upstreamModelId: "blackboxai/openai/gpt-5.5"
      },
      {
        id: "gpt-5.4-pro",
        name: "GPT-5.4 Pro",
        upstreamModelId: "blackboxai/openai/gpt-5.4-pro"
      },
      {
        id: "gpt-5.4",
        name: "GPT-5.4",
        upstreamModelId: "blackboxai/openai/gpt-5.4"
      },
      {
        id: "gpt-5.3-codex",
        name: "GPT-5.3 Codex",
        upstreamModelId: "blackboxai/openai/gpt-5.3-codex"
      },
      {
        id: "gpt-5.4-nano",
        name: "GPT-5.4 Nano",
        upstreamModelId: "blackboxai/openai/gpt-5.4-nano"
      },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        upstreamModelId: "blackboxai/deepseek/deepseek-v4-flash"
      },
      {
        id: "grok-4.3",
        name: "Grok 4.3",
        upstreamModelId: "blackboxai/x-ai/grok-4.3"
      }
    ]
  },
  {
    id: "brave-search",
    alias: "brave",
    category: "apikey",
    display: {
      name: "Brave Search",
      icon: "travel_explore",
      color: "#FB542B",
      textIcon: "BR",
      website: "https://brave.com/search/api",
      notice: {
        apiKeyUrl: "https://api-dashboard.search.brave.com/app/keys"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "webSearch"
    ],
    searchConfig: {
      baseUrl: "https://api.search.brave.com/res/v1",
      method: "GET",
      authType: "apikey",
      authHeader: "x-subscription-token",
      costPerQuery: 0.005,
      freeMonthlyQuota: 1000,
      searchTypes: [
        "web",
        "news"
      ],
      defaultMaxResults: 5,
      maxMaxResults: 20,
      timeoutMs: 10000,
      cacheTTLMs: 300000
    }
  },
  {
    id: "byteplus",
    priority: 70,
    alias: "byteplus",
    aliases: [
      "bpm"
    ],
    uiAlias: "bpm",
    category: "freeTier",
    display: {
      name: "BytePlus ModelArk",
      icon: "cloud",
      color: "#2563EB",
      textIcon: "BP",
      website: "https://console.byteplus.com/ark",
      notice: {
        text: "Free credits for new accounts. Access to Seed 2.0, Kimi K2 Thinking, GLM 4.7, GPT-OSS-120B models.",
        apiKeyUrl: "https://console.byteplus.com/ark/region:ark+ap-southeast-1/apiKey"
      }
    },
    serviceKinds: [
      "llm"
    ],
    models: [
      {
        id: "seed-2-0-pro-260328",
        name: "Seed 2.0 Pro"
      },
      {
        id: "seed-2-0-code-preview-260328",
        name: "Seed 2.0 Code Preview"
      },
      {
        id: "seed-2-0-mini-260215",
        name: "Seed 2.0 Mini"
      },
      {
        id: "seed-2-0-lite-260228",
        name: "Seed 2.0 Lite"
      },
      {
        id: "kimi-k2-thinking-251104",
        name: "Kimi K2 Thinking"
      },
      {
        id: "glm-4-7-251222",
        name: "GLM 4.7"
      },
      {
        id: "gpt-oss-120b-250805",
        name: "GPT-OSS-120B"
      }
    ]
  },
  {
    id: "cartesia",
    alias: "cartesia",
    category: "apikey",
    hidden: true,
    display: {
      name: "Cartesia",
      icon: "spatial_audio",
      color: "#FF4F8B",
      textIcon: "CA",
      website: "https://cartesia.ai",
      notice: {
        apiKeyUrl: "https://play.cartesia.ai/keys"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "tts"
    ],
    ttsConfig: {
      baseUrl: "https://api.cartesia.ai/tts/bytes",
      authType: "apikey",
      authHeader: "x-api-key",
      format: "cartesia",
      models: [
        {
          id: "sonic-2",
          name: "Sonic 2"
        },
        {
          id: "sonic-3",
          name: "Sonic 3"
        }
      ]
    }
  },
  {
    id: "cerebras",
    priority: 60,
    alias: "cerebras",
    category: "apikey",
    display: {
      name: "Cerebras",
      icon: "memory",
      color: "#FF4F00",
      textIcon: "CB",
      website: "https://www.cerebras.ai",
      notice: {
        apiKeyUrl: "https://cloud.cerebras.ai/platform"
      }
    },
    models: [
      {
        id: "gpt-oss-120b",
        name: "GPT OSS 120B"
      },
      {
        id: "zai-glm-4.7",
        name: "ZAI GLM 4.7"
      },
      {
        id: "llama-3.3-70b",
        name: "Llama 3.3 70B"
      },
      {
        id: "llama-4-scout-17b-16e-instruct",
        name: "Llama 4 Scout"
      },
      {
        id: "qwen-3-235b-a22b-instruct-2507",
        name: "Qwen3 235B A22B"
      },
      {
        id: "qwen-3-32b",
        name: "Qwen3 32B"
      }
    ]
  },
  {
    id: "chutes",
    priority: 70,
    alias: "chutes",
    aliases: [
      "ch"
    ],
    uiAlias: "ch",
    category: "apikey",
    display: {
      name: "Chutes AI",
      icon: "water_drop",
      color: "#ffffffff",
      textIcon: "CH",
      website: "https://chutes.ai",
      notice: {
        apiKeyUrl: "https://chutes.ai/app/api"
      }
    }
  },
  {
    id: "claude",
    priority: 10,
    alias: "cc",
    uiAlias: "cc",
    category: "oauth",
    display: {
      name: "Claude Code",
      icon: "smart_toy",
      color: "#D97757",
      website: "https://claude.ai",
      notice: {
        signupUrl: "https://claude.ai"
      },
      deprecated: true,
      deprecationNotice: "RISK_NOTICE"
    },
    features: {
      usage: true
    },
    models: [
      {
        id: "claude-opus-5",
        name: "Claude Opus 5"
      },
      {
        id: "claude-fable-5-1",
        name: "Claude Fable 5.1"
      },
      {
        id: "claude-fable-5",
        name: "Claude Fable 5"
      },
      {
        id: "claude-sonnet-5",
        name: "Claude Sonnet 5"
      },
      {
        id: "claude-haiku-4-5-20251001",
        name: "Claude 4.5 Haiku"
      }
    ]
  },
  {
    id: "cline",
    priority: 80,
    alias: "cl",
    uiAlias: "cl",
    category: "oauth",
    display: {
      name: "Cline",
      icon: "smart_toy",
      color: "#5B9BD5",
      textIcon: "CL",
      website: "https://cline.bot",
      notice: {
        signupUrl: "https://cline.bot"
      }
    },
    hasOAuth: true,
    authModes: [
      "oauth"
    ],
    passthroughModels: true,
    models: [
      {
        id: "z-ai/glm-5.2:free",
        name: "GLM 5.2 (Free)"
      },
      {
        id: "z-ai/glm-5.3-flash",
        name: "GLM 5.3 Flash (Free Daily Limit)"
      },
      {
        id: "z-ai/glm-4.7-flash",
        name: "GLM 4.7 Flash"
      },
      {
        id: "z-ai/glm-4.5",
        name: "GLM 4.5"
      },
      {
        id: "google/gemma-4-26b-a4b-it:free",
        name: "Gemma 4 26B (Free)"
      },
      {
        id: "google/gemma-4-31b-it:free",
        name: "Gemma 4 31B (Free)"
      },
      {
        id: "nvidia/nemotron-3-super-120b-a12b:free",
        name: "Nemotron 3 Super 120B (Free)"
      },
      {
        id: "nvidia/nemotron-3-ultra-550b-a55b:free",
        name: "Nemotron 3 Ultra 550B (Free)"
      },
      {
        id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        name: "Nemotron 3 Nano Omni Reasoning (Free)"
      },
      {
        id: "nvidia/nemotron-3.5-lightning:free",
        name: "Nemotron 3.5 Lightning (Free)"
      },
      {
        id: "nvidia/nemotron-3.5-content-safety:free",
        name: "Nemotron 3.5 Content Safety (Free)"
      },
      {
        id: "thinkingmachines/inkling:free",
        name: "Inkling (Free)"
      },
      {
        id: "thinkingmachines/inkling-small:free",
        name: "Inkling Small (Free)"
      },
      {
        id: "poolside/laguna-xs-2.1:free",
        name: "Laguna XS 2.1 (Free)"
      },
      {
        id: "poolside/laguna-s-2.1:free",
        name: "Laguna S 2.1 (Free)"
      },
      {
        id: "cohere/north-mini-code:free",
        name: "North Mini Code (Free)"
      },
      {
        id: "nex-agi/nex-n2.5-pro:free",
        name: "Nex N2.5 Pro (Free)"
      },
      {
        id: "liquid/lfm-2.5-2.6b:free",
        name: "LFM 2.5 2.6B (Free)"
      },
      {
        id: "dots-studio/dots-3-note-preview:free",
        name: "Dots 3 Note Preview (Free)"
      },
      {
        id: "inclusionai/ling-3.0-flash-vl:free",
        name: "Ling 3.0 Flash VL (Free)"
      },
      {
        id: "inclusionai/ling-3.0-flash-fin:free",
        name: "Ling 3.0 Flash Fin (Free)"
      },
      {
        id: "inclusionai/ling-3.0-flash-sante:free",
        name: "Ling 3.0 Flash Santé (Free)"
      },
      {
        id: "meta/muse-spark-1.3-contributor",
        name: "Muse Spark 1.3 Contributor"
      },
      {
        id: "meta/muse-spark-1.3",
        name: "Muse Spark 1.3"
      },
      {
        id: "meta/muse-spark-1.2-contributor",
        name: "Muse Spark 1.2 Contributor"
      },
      {
        id: "meta/muse-spark-1.2",
        name: "Muse Spark 1.2"
      },
      {
        id: "meta/muse-spark-1.1",
        name: "Muse Spark 1.1"
      },
      {
        id: "meta/muse-glimmer-30b",
        name: "Muse Glimmer 30B"
      },
      {
        id: "openrouter/free",
        name: "OpenRouter Free"
      },
      {
        id: "anthropic/claude-opus-4.7",
        name: "Claude Opus 4.7"
      },
      {
        id: "anthropic/claude-sonnet-4.6",
        name: "Claude Sonnet 4.6"
      },
      {
        id: "anthropic/claude-opus-4.6",
        name: "Claude Opus 4.6"
      },
      {
        id: "openai/gpt-5.3-codex",
        name: "GPT-5.3 Codex"
      },
      {
        id: "openai/gpt-5.4",
        name: "GPT-5.4"
      },
      {
        id: "google/gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro Preview"
      },
      {
        id: "google/gemini-3.1-flash-lite-preview",
        name: "Gemini 3.1 Flash Lite Preview"
      },
      {
        id: "kwaipilot/kat-coder-pro",
        name: "KAT Coder Pro"
      }
    ]
  },
  {
    id: "clinepass",
    priority: 85,
    alias: "clinepass",
    uiAlias: "clinepass",
    category: "oauth",
    display: {
      name: "ClinePass",
      icon: "vpn_key",
      color: "#5B9BD5",
      textIcon: "CP",
      website: "https://cline.bot",
      notice: {
        signupUrl: "https://app.cline.bot"
      }
    },
    hasOAuth: true,
    authModes: [
      "apikey",
      "oauth"
    ],
    thinkingConfig: {
      options: [
        "auto",
        "on",
        "off"
      ],
      defaultMode: "auto"
    },
    models: [
      {
        id: "cline-pass/glm-5.2",
        name: "GLM-5.2 (ClinePass)"
      },
      {
        id: "cline-pass/kimi-k2.7-code",
        name: "Kimi K2.7 Code (ClinePass)"
      },
      {
        id: "cline-pass/kimi-k2.6",
        name: "Kimi K2.6 (ClinePass)"
      },
      {
        id: "cline-pass/deepseek-v4-pro",
        name: "DeepSeek V4 Pro (ClinePass)"
      },
      {
        id: "cline-pass/deepseek-v4-flash",
        name: "DeepSeek V4 Flash (ClinePass)"
      },
      {
        id: "cline-pass/mimo-v2.5",
        name: "MiMo-V2.5 (ClinePass)"
      },
      {
        id: "cline-pass/mimo-v2.5-pro",
        name: "MiMo-V2.5-Pro (ClinePass)"
      },
      {
        id: "cline-pass/minimax-m3",
        name: "MiniMax M3 (ClinePass)"
      },
      {
        id: "cline-pass/qwen3.7-max",
        name: "Qwen3.7 Max (ClinePass)"
      },
      {
        id: "cline-pass/qwen3.7-plus",
        name: "Qwen3.7 Plus (ClinePass)"
      }
    ]
  },
  {
    id: "cloudflare-ai",
    priority: 60,
    alias: "cloudflare-ai",
    aliases: [
      "cf"
    ],
    uiAlias: "cf",
    category: "freeTier",
    display: {
      name: "Cloudflare",
      icon: "cloud",
      color: "#F38020",
      textIcon: "CF",
      website: "https://developers.cloudflare.com/workers-ai/",
      notice: {
        text: "Workers AI free tier. Requires a Cloudflare API token and Account ID.",
        apiKeyUrl: "https://dash.cloudflare.com/profile/api-tokens"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    hasProviderSpecificData: true,
    hasFree: true,
    serviceKinds: [
      "llm",
      "image",
      "embedding"
    ],
    imageConfig: {
      baseUrl: "https://api.cloudflare.com/client/v4/accounts"
    },
    models: [
      {
        id: "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
        name: "Gemma Sea Lion v4 27B IT"
      },
      {
        id: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
        name: "DeepSeek R1 Distill Qwen 32B"
      },
      {
        id: "@cf/google/gemma-2b-it-lora",
        name: "Gemma 2B IT LoRA"
      },
      {
        id: "@cf/google/gemma-4-26b-a4b-it",
        name: "Gemma 4 26B A4B IT"
      },
      {
        id: "@cf/google/gemma-7b-it-lora",
        name: "Gemma 7B IT LoRA"
      },
      {
        id: "@cf/ibm-granite/granite-4.0-h-micro",
        name: "Granite 4.0 H Micro"
      },
      {
        id: "@cf/meta-llama/llama-2-7b-chat-hf-lora",
        name: "Llama 2 7B Chat HF LoRA"
      },
      {
        id: "@cf/meta/llama-3.1-8b-instruct-fp8",
        name: "Llama 3.1 8B Instruct FP8"
      },
      {
        id: "@cf/meta/llama-3.2-1b-instruct",
        name: "Llama 3.2 1B Instruct"
      },
      {
        id: "@cf/meta/llama-3.2-3b-instruct",
        name: "Llama 3.2 3B Instruct"
      },
      {
        id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        name: "Llama 3.3 70B Instruct FP8 Fast"
      },
      {
        id: "@cf/meta/llama-4-scout-17b-16e-instruct",
        name: "Llama 4 Scout 17B 16E Instruct"
      },
      {
        id: "@cf/meta/llama-guard-3-8b",
        name: "Llama Guard 3 8B"
      },
      {
        id: "@cf/mistral/mistral-7b-instruct-v0.2-lora",
        name: "Mistral 7B Instruct v0.2 LoRA"
      },
      {
        id: "@cf/mistralai/mistral-small-3.1-24b-instruct",
        name: "Mistral Small 3.1 24B Instruct"
      },
      {
        id: "@cf/moondream/moondream3.1-9B-A2B",
        name: "Moondream 3.1 9B A2B"
      },
      {
        id: "@cf/nvidia/nemotron-3-120b-a12b",
        name: "Nemotron 3 120B A12B"
      },
      {
        id: "@cf/openai/gpt-oss-120b",
        name: "GPT OSS 120B"
      },
      {
        id: "@cf/openai/gpt-oss-20b",
        name: "GPT OSS 20B"
      },
      {
        id: "@cf/qwen/qwen2.5-coder-32b-instruct",
        name: "Qwen 2.5 Coder 32B Instruct"
      },
      {
        id: "@cf/qwen/qwen3-30b-a3b-fp8",
        name: "Qwen3 30B A3B FP8"
      },
      {
        id: "@cf/qwen/qwen3.8-27b",
        name: "Qwen3.8 27B"
      },
      {
        id: "@cf/qwen/qwq-32b",
        name: "QwQ 32B"
      },
      {
        id: "@cf/zai-org/glm-4.7-flash",
        name: "GLM 4.7 Flash"
      },
      {
        id: "@cf/black-forest-labs/flux-2-klein-9b",
        name: "FLUX.2 Klein 9B",
        params: [
          "size"
        ],
        kind: "image"
      },
      {
        id: "@cf/black-forest-labs/flux-2-klein-4b",
        name: "FLUX.2 Klein 4B",
        params: [
          "size"
        ],
        kind: "image"
      },
      {
        id: "@cf/black-forest-labs/flux-2-dev",
        name: "FLUX.2 Dev",
        params: [
          "size"
        ],
        kind: "image"
      },
      {
        id: "@cf/leonardo/lucid-origin",
        name: "Lucid Origin",
        params: [
          "size"
        ],
        kind: "image"
      },
      {
        id: "@cf/leonardo/phoenix-1.0",
        name: "Phoenix 1.0",
        params: [
          "size"
        ],
        kind: "image"
      },
      {
        id: "@cf/black-forest-labs/flux-1-schnell",
        name: "FLUX.1 Schnell",
        kind: "image"
      },
      {
        id: "@cf/bytedance/stable-diffusion-xl-lightning",
        name: "SDXL Lightning",
        params: [
          "size"
        ],
        kind: "image"
      },
      {
        id: "@cf/lykon/dreamshaper-8-lcm",
        name: "DreamShaper 8 LCM",
        params: [
          "size"
        ],
        kind: "image"
      },
      {
        id: "@cf/runwayml/stable-diffusion-v1-5-inpainting",
        name: "Stable Diffusion v1.5 Inpainting",
        params: [
          "size"
        ],
        capabilities: [
          "edit",
          "mask"
        ],
        kind: "image"
      },
      {
        id: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
        name: "SDXL Base 1.0",
        params: [
          "size"
        ],
        kind: "image"
      },
      {
        id: "@cf/baai/bge-large-en-v1.5",
        name: "BGE Large EN v1.5",
        dimensions: 1024,
        kind: "embedding"
      },
      {
        id: "@cf/baai/bge-base-en-v1.5",
        name: "BGE Base EN v1.5",
        dimensions: 768,
        kind: "embedding"
      },
      {
        id: "@cf/baai/bge-small-en-v1.5",
        name: "BGE Small EN v1.5",
        dimensions: 384,
        kind: "embedding"
      },
      {
        id: "@cf/baai/bge-m3",
        name: "BGE-M3",
        dimensions: 1024,
        kind: "embedding"
      },
      {
        id: "@cf/qwen/qwen3-embedding-0.6b",
        name: "Qwen3 Embedding 0.6B",
        dimensions: 1024,
        kind: "embedding"
      },
      {
        id: "@cf/google/embeddinggemma-300m",
        name: "EmbeddingGemma 300M",
        dimensions: 768,
        kind: "embedding"
      },
      {
        id: "@cf/pfnet/plamo-embedding-1b",
        name: "PLaMo Embedding 1B",
        dimensions: 1024,
        kind: "embedding"
      }
    ]
  },
  {
    id: "codebuddy-cn",
    priority: 90,
    alias: "cbcn",
    uiAlias: "cbcn",
    category: "oauth",
    hidden: false,
    display: {
      name: "CodeBuddy CN",
      icon: "smart_toy",
      color: "#006EFF",
      website: "https://copilot.tencent.com",
      notice: {
        signupUrl: "https://copilot.tencent.com"
      }
    },
    hasOAuth: true,
    authModes: [
      "oauth",
      "apikey"
    ],
    features: {
      usage: true,
      usageApikey: true
    },
    models: [
      {
        id: "glm-5.2",
        name: "GLM-5.2"
      },
      {
        id: "glm-5.1",
        name: "GLM-5.1"
      },
      {
        id: "glm-5v-turbo",
        name: "GLM-5v-Turbo"
      },
      {
        id: "minimax-m3",
        name: "MiniMax-M3"
      },
      {
        id: "kimi-k2.7",
        name: "Kimi-K2.7-Code"
      },
      {
        id: "kimi-k2.6",
        name: "Kimi-K2.6"
      },
      {
        id: "hy3",
        name: "Hy3"
      },
      {
        id: "hy4-preview",
        name: "Hy4-Preview"
      },
      {
        id: "glm-5.3",
        name: "GLM-5.3"
      },
      {
        id: "glm-5.3-flash",
        name: "GLM-5.3-Flash"
      },
      {
        id: "kimi-k3-1",
        name: "Kimi-K3"
      },
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek-V4-Pro"
      },
      {
        id: "deepseek-v4.1-flash",
        name: "DeepSeek-V4.1-Flash"
      }
    ]
  },
  {
    id: "codex",
    priority: 30,
    alias: "cx",
    uiAlias: "cx",
    category: "oauth",
    display: {
      name: "OpenAI Codex",
      icon: "code",
      color: "#3B82F6",
      website: "https://chatgpt.com/codex",
      notice: {
        signupUrl: "https://chatgpt.com/codex"
      },
      deprecated: true,
      deprecationNotice: "RISK_NOTICE",
      kindNotice: {
        image: "Requires a ChatGPT Plus (or higher) account. Free accounts are not supported for image generation."
      }
    },
    features: {
      usage: true
    },
    thinkingConfig: {
      options: [
        "auto",
        "none",
        "low",
        "medium",
        "high"
      ],
      defaultMode: "auto"
    },
    serviceKinds: [
      "llm",
      "image"
    ],
    models: [
      {
        id: "gpt-6-astra",
        name: "GPT 6.0 Astra"
      },
      {
        id: "gpt-5.6-sol",
        name: "GPT 5.6 Sol"
      },
      {
        id: "gpt-5.6-sol-review",
        name: "GPT 5.6 Sol Review",
        upstreamModelId: "gpt-5.6-sol",
        quotaFamily: "review"
      },
      {
        id: "gpt-5.6-terra",
        name: "GPT 5.6 Terra"
      },
      {
        id: "gpt-5.6-terra-review",
        name: "GPT 5.6 Terra Review",
        upstreamModelId: "gpt-5.6-terra",
        quotaFamily: "review"
      },
      {
        id: "gpt-5.6-luna",
        name: "GPT 5.6 Luna"
      },
      {
        id: "gpt-5.6-luna-review",
        name: "GPT 5.6 Luna Review",
        upstreamModelId: "gpt-5.6-luna",
        quotaFamily: "review"
      },
      {
        id: "gpt-5.5",
        name: "GPT 5.5"
      },
      {
        id: "gpt-5.5-review",
        name: "GPT 5.5 Review",
        upstreamModelId: "gpt-5.5",
        quotaFamily: "review"
      },
      {
        id: "gpt-5.4",
        name: "GPT 5.4"
      },
      {
        id: "gpt-5.4-review",
        name: "GPT 5.4 Review",
        upstreamModelId: "gpt-5.4",
        quotaFamily: "review"
      },
      {
        id: "gpt-5.4-mini",
        name: "GPT 5.4 Mini"
      },
      {
        id: "gpt-5.4-mini-review",
        name: "GPT 5.4 Mini Review",
        upstreamModelId: "gpt-5.4-mini",
        quotaFamily: "review"
      },
      {
        id: "gpt-5.3-codex-spark",
        name: "GPT 5.3 Codex Spark"
      },
      {
        id: "gpt-5.3-codex-spark-review",
        name: "GPT 5.3 Codex Spark Review",
        upstreamModelId: "gpt-5.3-codex-spark",
        quotaFamily: "review"
      },
      {
        id: "codex-auto-review",
        name: "Codex Auto Review",
        upstreamModelId: "codex-auto-review",
        quotaFamily: "review"
      },
      {
        id: "gpt-image-2.5",
        name: "GPT Image 2.5",
        capabilities: [
          "text2img",
          "edit",
          "multiImage"
        ],
        params: [
          "size",
          "quality",
          "background",
          "image_detail",
          "output_format"
        ],
        kind: "image"
      },
      {
        id: "gpt-image-2.5-flare",
        name: "GPT Image 2.5 Flare",
        capabilities: [
          "text2img",
          "edit",
          "multiImage"
        ],
        params: [
          "size",
          "quality",
          "background",
          "image_detail",
          "output_format"
        ],
        kind: "image"
      },
      {
        id: "gpt-image-2.5-sunburst",
        name: "GPT Image 2.5 Sunburst",
        capabilities: [
          "text2img",
          "edit",
          "multiImage"
        ],
        params: [
          "size",
          "quality",
          "background",
          "image_detail",
          "output_format"
        ],
        kind: "image"
      },
      {
        id: "gpt-image-2",
        name: "GPT Image 2",
        capabilities: [
          "text2img",
          "edit",
          "multiImage"
        ],
        params: [
          "size",
          "quality",
          "background",
          "image_detail",
          "output_format"
        ],
        kind: "image"
      },
      {
        id: "gpt-image-1.5",
        name: "GPT Image 1.5",
        capabilities: [
          "text2img",
          "edit",
          "multiImage"
        ],
        params: [
          "size",
          "quality",
          "background",
          "image_detail",
          "output_format"
        ],
        kind: "image"
      },
      {
        id: "gpt-5.6-sol-image",
        name: "GPT 5.6 Sol Image",
        capabilities: [
          "text2img",
          "edit"
        ],
        params: [
          "size",
          "quality",
          "background",
          "image_detail",
          "output_format"
        ],
        kind: "image"
      },
      {
        id: "gpt-5.6-terra-image",
        name: "GPT 5.6 Terra Image",
        capabilities: [
          "text2img",
          "edit"
        ],
        params: [
          "size",
          "quality",
          "background",
          "image_detail",
          "output_format"
        ],
        kind: "image"
      },
      {
        id: "gpt-5.6-luna-image",
        name: "GPT 5.6 Luna Image",
        capabilities: [
          "text2img",
          "edit"
        ],
        params: [
          "size",
          "quality",
          "background",
          "image_detail",
          "output_format"
        ],
        kind: "image"
      },
      {
        id: "gpt-5.5-image",
        name: "GPT 5.5 Image",
        capabilities: [
          "text2img",
          "edit"
        ],
        params: [
          "size",
          "quality",
          "background",
          "image_detail",
          "output_format"
        ],
        kind: "image"
      },
      {
        id: "gpt-5.4-image",
        name: "GPT 5.4 Image",
        capabilities: [
          "text2img",
          "edit"
        ],
        params: [
          "size",
          "quality",
          "background",
          "image_detail",
          "output_format"
        ],
        kind: "image"
      },
      {
        id: "gpt-5.3-image",
        name: "GPT 5.3 Image",
        capabilities: [
          "text2img",
          "edit"
        ],
        params: [
          "size",
          "quality",
          "background",
          "image_detail",
          "output_format"
        ],
        kind: "image"
      }
    ]
  },
  {
    id: "cohere",
    priority: 90,
    alias: "cohere",
    category: "apikey",
    display: {
      name: "Cohere",
      icon: "hub",
      color: "#39594D",
      textIcon: "CO",
      website: "https://cohere.com",
      notice: {
        apiKeyUrl: "https://dashboard.cohere.com/api-keys"
      }
    },
    models: [
      {
        id: "command-r-plus-08-2024",
        name: "Command R+ (Aug 2024)"
      },
      {
        id: "command-r-08-2024",
        name: "Command R (Aug 2024)"
      },
      {
        id: "command-a-03-2025",
        name: "Command A (Mar 2025)"
      }
    ]
  },
  {
    id: "comfyui",
    priority: 120,
    alias: "comfyui",
    category: "apikey",
    display: {
      name: "ComfyUI",
      icon: "account_tree",
      color: "#4CAF50",
      textIcon: "CF",
      website: "https://github.com/comfyanonymous/ComfyUI"
    },
    serviceKinds: [
      "image"
    ],
    imageConfig: {
      baseUrl: "http://localhost:8188"
    },
    models: [
      {
        id: "flux-dev",
        name: "FLUX Dev",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      },
      {
        id: "sdxl",
        name: "SDXL",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      }
    ]
  },
  {
    id: "commandcode",
    priority: 100,
    alias: "commandcode",
    aliases: [
      "cmc"
    ],
    uiAlias: "cmc",
    category: "apikey",
    display: {
      name: "Command Code",
      icon: "smart_toy",
      color: "#000000",
      textIcon: "CC",
      website: "https://commandcode.ai",
      notice: {
        text: "Use your CommandCode CLI API key (starts with user_...) from ~/.commandcode/auth.json or commandcode.ai/studio.",
        apiKeyUrl: "https://commandcode.ai/studio"
      }
    },
    features: {
      usage: true,
      usageApikey: true
    },
    models: [
      {
        id: "deepseek/deepseek-v4-pro",
        name: "DeepSeek V4 Pro"
      },
      {
        id: "deepseek/deepseek-v4-flash",
        name: "DeepSeek V4 Flash"
      },
      {
        id: "moonshotai/Kimi-K2.6",
        name: "Kimi K2.6"
      },
      {
        id: "moonshotai/Kimi-K2.5",
        name: "Kimi K2.5"
      },
      {
        id: "zai-org/GLM-5.1",
        name: "GLM 5.1"
      },
      {
        id: "zai-org/GLM-5",
        name: "GLM 5"
      },
      {
        id: "MiniMaxAI/MiniMax-M2.7",
        name: "MiniMax M2.7"
      },
      {
        id: "MiniMaxAI/MiniMax-M2.5",
        name: "MiniMax M2.5"
      },
      {
        id: "Qwen/Qwen3.6-Max-Preview",
        name: "Qwen 3.6 Max Preview"
      },
      {
        id: "Qwen/Qwen3.6-Plus",
        name: "Qwen 3.6 Plus"
      },
      {
        id: "stepfun/Step-3.5-Flash",
        name: "Step 3.5 Flash"
      }
    ]
  },
  {
    id: "coqui",
    alias: "coqui",
    category: "freeTier",
    hidden: true,
    display: {
      name: "Coqui TTS",
      icon: "record_voice_over",
      color: "#10B981",
      textIcon: "CQ",
      website: "https://github.com/coqui-ai/TTS"
    },
    authType: "none",
    noAuth: true,
    serviceKinds: [
      "tts"
    ],
    ttsConfig: {
      baseUrl: "http://localhost:5002/api/tts",
      authType: "none",
      authHeader: "none",
      format: "coqui",
      models: [
        {
          id: "tts_models/en/ljspeech/tacotron2-DDC",
          name: "Tacotron2 DDC (LJSpeech)"
        }
      ]
    }
  },
  {
    id: "cursor",
    priority: 50,
    alias: "cu",
    uiAlias: "cu",
    category: "oauth",
    display: {
      name: "Cursor IDE",
      icon: "edit_note",
      color: "#00D4AA",
      website: "https://cursor.com",
      notice: {
        signupUrl: "https://cursor.com"
      }
    },
    models: [
      {
        id: "default",
        name: "Auto (Server Picks)"
      },
      {
        id: "claude-4.5-opus-high-thinking",
        name: "Claude 4.5 Opus High Thinking"
      },
      {
        id: "claude-4.5-opus-high",
        name: "Claude 4.5 Opus High"
      },
      {
        id: "claude-4.5-sonnet-thinking",
        name: "Claude 4.5 Sonnet Thinking"
      },
      {
        id: "claude-4.5-sonnet",
        name: "Claude 4.5 Sonnet"
      },
      {
        id: "claude-4.5-haiku",
        name: "Claude 4.5 Haiku"
      },
      {
        id: "claude-4.5-opus",
        name: "Claude 4.5 Opus"
      },
      {
        id: "gpt-5.2-codex",
        name: "GPT 5.2 Codex"
      },
      {
        id: "claude-4.6-opus-max",
        name: "Claude 4.6 Opus Max"
      },
      {
        id: "claude-4.6-sonnet-medium-thinking",
        name: "Claude 4.6 Sonnet Medium Thinking"
      },
      {
        id: "kimi-k2.5",
        name: "Kimi K2.5"
      },
      {
        id: "gemini-3-flash-preview",
        name: "Gemini 3 Flash Preview"
      },
      {
        id: "gpt-5.2",
        name: "GPT 5.2"
      },
      {
        id: "gpt-5.3-codex",
        name: "GPT 5.3 Codex"
      }
    ]
  },
  {
    id: "deepgram",
    priority: 20,
    alias: "deepgram",
    aliases: [
      "dg"
    ],
    uiAlias: "dg",
    category: "apikey",
    display: {
      name: "Deepgram",
      icon: "mic",
      color: "#13EF93",
      textIcon: "DG",
      website: "https://deepgram.com",
      notice: {
        text: "$200 free credit on signup (no card required). Aura-1: $0.015/1k chars, Aura-2: $0.030/1k chars (Pay-As-You-Go).",
        apiKeyUrl: "https://console.deepgram.com/api-keys"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "stt"
    ],
    sttConfig: {
      baseUrl: "https://api.deepgram.com/v1/listen",
      authType: "apikey",
      authHeader: "token",
      format: "deepgram"
    },
    models: [
      {
        id: "nova-3",
        name: "Nova 3",
        params: [
          "language"
        ],
        kind: "stt"
      },
      {
        id: "nova-2",
        name: "Nova 2",
        params: [
          "language"
        ],
        kind: "stt"
      },
      {
        id: "whisper-large",
        name: "Whisper Large",
        params: [
          "language"
        ],
        kind: "stt"
      },
      {
        id: "nova",
        name: "Nova",
        kind: "stt"
      }
    ]
  },
  {
    id: "deepseek",
    priority: 110,
    alias: "deepseek",
    aliases: [
      "ds"
    ],
    uiAlias: "ds",
    category: "apikey",
    display: {
      name: "DeepSeek",
      icon: "bolt",
      color: "#4D6BFE",
      textIcon: "DS",
      website: "https://deepseek.com",
      notice: {
        apiKeyUrl: "https://platform.deepseek.com/api_keys"
      }
    },
    features: {
      usage: true,
      usageApikey: true
    },
    models: [
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro"
      },
      {
        id: "deepseek-v4-pro-max",
        name: "DeepSeek V4 Pro Max",
        upstreamModelId: "deepseek-v4-pro"
      },
      {
        id: "deepseek-v4-pro-none",
        name: "DeepSeek V4 Pro No Thinking",
        upstreamModelId: "deepseek-v4-pro"
      },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash"
      },
      {
        id: "deepseek-v4-flash-vision-exp",
        name: "DeepSeek V4 Flash Vision (Exp)"
      },
      {
        id: "deepseek-chat",
        name: "DeepSeek V3.2 Chat"
      },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek V3.2 Reasoner"
      }
    ]
  },
  {
    id: "edge-tts",
    alias: "edge-tts",
    category: "freeTier",
    display: {
      name: "Edge TTS",
      icon: "record_voice_over",
      color: "#0078D4",
      textIcon: "ET"
    },
    authType: "none",
    noAuth: true,
    serviceKinds: [
      "tts"
    ],
    ttsConfig: {
      baseUrl: "edge-tts",
      authType: "none",
      authHeader: "none",
      format: "edge-tts",
      models: []
    },
    mediaPriority: 5
  },
  {
    id: "elevenlabs",
    alias: "el",
    category: "apikey",
    display: {
      name: "ElevenLabs",
      icon: "record_voice_over",
      color: "#6C47FF",
      textIcon: "EL",
      website: "https://elevenlabs.io",
      notice: {
        apiKeyUrl: "https://elevenlabs.io/app/settings/api-keys"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "tts"
    ],
    ttsConfig: {
      baseUrl: "https://api.elevenlabs.io/v1/text-to-speech",
      authType: "apikey",
      authHeader: "xi-api-key",
      format: "elevenlabs",
      models: [
        {
          id: "eleven_multilingual_v2",
          name: "Eleven Multilingual v2"
        },
        {
          id: "eleven_turbo_v2_5",
          name: "Eleven Turbo v2.5"
        }
      ]
    }
  },
  {
    id: "exa",
    alias: "exa",
    category: "apikey",
    display: {
      name: "Exa",
      icon: "manage_search",
      color: "#2563EB",
      textIcon: "EX",
      website: "https://exa.ai",
      notice: {
        apiKeyUrl: "https://dashboard.exa.ai/api-keys"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "webSearch",
      "webFetch"
    ],
    searchConfig: {
      baseUrl: "https://api.exa.ai/search",
      method: "POST",
      authType: "apikey",
      authHeader: "x-api-key",
      costPerQuery: 0.007,
      freeMonthlyQuota: 1000,
      searchTypes: [
        "web",
        "news"
      ],
      defaultMaxResults: 5,
      maxMaxResults: 100,
      timeoutMs: 10000,
      cacheTTLMs: 300000
    },
    fetchConfig: {
      baseUrl: "https://api.exa.ai/contents",
      method: "POST",
      authType: "apikey",
      authHeader: "x-api-key",
      costPerQuery: 0.001,
      freeMonthlyQuota: 1000,
      formats: [
        "text",
        "markdown"
      ],
      maxCharacters: 100000,
      timeoutMs: 15000
    }
  },
  {
    id: "fal-ai",
    priority: 90,
    alias: "fal-ai",
    aliases: [
      "fal"
    ],
    uiAlias: "fal",
    category: "apikey",
    display: {
      name: "Fal.ai",
      icon: "image",
      color: "#2563EB",
      textIcon: "FL",
      website: "https://fal.ai",
      notice: {
        apiKeyUrl: "https://fal.ai/dashboard/keys"
      }
    },
    authType: "apikey",
    hasFree: true,
    serviceKinds: [
      "image"
    ],
    imageConfig: {
      baseUrl: "https://queue.fal.run"
    },
    models: [
      {
        id: "fal-ai/flux/schnell",
        name: "FLUX Schnell",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      },
      {
        id: "fal-ai/flux/dev",
        name: "FLUX Dev",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      },
      {
        id: "fal-ai/flux-pro/v1.1",
        name: "FLUX Pro v1.1",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      },
      {
        id: "fal-ai/flux-pro/v1.1-ultra",
        name: "FLUX Pro v1.1 Ultra",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      },
      {
        id: "fal-ai/recraft-v3",
        name: "Recraft V3",
        params: [
          "n",
          "size",
          "style"
        ],
        kind: "image"
      },
      {
        id: "fal-ai/ideogram/v2",
        name: "Ideogram V2",
        params: [
          "n",
          "size",
          "style"
        ],
        kind: "image"
      },
      {
        id: "fal-ai/stable-diffusion-v35-large",
        name: "SD 3.5 Large",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      }
    ]
  },
  {
    id: "featherless",
    priority: 65,
    alias: "featherless",
    aliases: [
      "fl"
    ],
    uiAlias: "fl",
    category: "apikey",
    display: {
      name: "Featherless",
      icon: "flutter_dash",
      color: "#111827",
      textIcon: "FL",
      website: "https://featherless.ai",
      notice: {
        apiKeyUrl: "https://featherless.ai/account/api-keys"
      }
    },
    authType: "apikey",
    models: [
      {
        id: "deepseek-ai/DeepSeek-V4-Pro",
        name: "DeepSeek V4 Pro"
      },
      {
        id: "deepseek-ai/DeepSeek-V4-Flash",
        name: "DeepSeek V4 Flash"
      },
      {
        id: "zai-org/GLM-5.2",
        name: "GLM 5.2"
      },
      {
        id: "zai-org/GLM-5.1",
        name: "GLM 5.1"
      },
      {
        id: "moonshotai/Kimi-K2.7-Code",
        name: "Kimi K2.7 Code"
      },
      {
        id: "moonshotai/Kimi-K2.6",
        name: "Kimi K2.6"
      },
      {
        id: "moonshotai/Kimi-K2.5",
        name: "Kimi K2.5"
      }
    ]
  },
  {
    id: "firecrawl",
    alias: "firecrawl",
    category: "apikey",
    display: {
      name: "Firecrawl",
      icon: "local_fire_department",
      color: "#F59E0B",
      textIcon: "FC",
      website: "https://firecrawl.dev",
      notice: {
        apiKeyUrl: "https://www.firecrawl.dev/app/api-keys"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "webFetch"
    ],
    fetchConfig: {
      baseUrl: "https://api.firecrawl.dev/v1/scrape",
      method: "POST",
      authType: "apikey",
      authHeader: "bearer",
      costPerQuery: 0.002,
      freeMonthlyQuota: 500,
      formats: [
        "markdown",
        "html",
        "text"
      ],
      maxCharacters: 200000,
      timeoutMs: 30000
    }
  },
  {
    id: "fireworks",
    priority: 50,
    alias: "fireworks",
    category: "apikey",
    display: {
      name: "Fireworks AI",
      icon: "local_fire_department",
      color: "#7B2EF2",
      textIcon: "FW",
      website: "https://fireworks.ai",
      notice: {
        apiKeyUrl: "https://fireworks.ai/account/api-keys"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "llm",
      "embedding"
    ],
    embeddingConfig: {
      baseUrl: "https://api.fireworks.ai/inference/v1/embeddings"
    },
    models: [
      {
        id: "accounts/fireworks/models/deepseek-v3p1",
        name: "DeepSeek V3.1"
      },
      {
        id: "accounts/fireworks/models/llama-v3p3-70b-instruct",
        name: "Llama 3.3 70B"
      },
      {
        id: "accounts/fireworks/models/qwen3-235b-a22b",
        name: "Qwen3 235B"
      },
      {
        id: "nomic-ai/nomic-embed-text-v1.5",
        name: "Nomic Embed Text v1.5",
        kind: "embedding"
      }
    ]
  },
  {
    id: "freebuff",
    priority: 45,
    alias: "fb",
    uiAlias: "fb",
    category: "free",
    display: {
      name: "Freebuff",
      icon: "bolt",
      color: "#84CC16",
      textIcon: "FB",
      website: "https://freebuff.com",
      notice: {
        signupUrl: "https://freebuff.com",
        text: "Free ad-supported coding agent by Codebuff. Sign in with your Freebuff/Codebuff account via browser login. Each model is priced in Freebucks per hour of session, charged once when the session starts. Your daily Freebucks refill at midnight Pacific; the wallet keeps what you buy or earn. Free tier is ad-supported and limited in some regions (limited mode: 6 x 1-hour sessions/day); full mode runs in select countries. ⚠️ One account has ONE active session locked to ONE model — requesting a different model while a session is active returns 'model_locked' (409); use a separate account per model, or wait for the session to expire."
      }
    },
    authType: "oauth",
    hasOAuth: true,
    authModes: [
      "oauth"
    ],
    hasFree: true,
    features: {
      usage: true
    },
    models: [
      {
        id: "z-ai/glm-5.3-flash",
        name: "GLM 5.3 Flash"
      },
      {
        id: "deepseek/deepseek-v4-flash",
        name: "DeepSeek V4.1 Flash"
      },
      {
        id: "openai/gpt-5.6-luna",
        name: "GPT-5.6 Luna"
      },
      {
        id: "mimo/mimo-v2.5",
        name: "MiMo 2.5"
      },
      {
        id: "upstage/solar-pro4",
        name: "Solar Pro 4"
      },
      {
        id: "meta/muse-spark-1.2-contributor",
        name: "Muse Spark 1.2"
      },
      {
        id: "anthropic/claude-fable-5",
        name: "Claude Fable 5 (limited offer)"
      }
    ]
  },
  {
    id: "gemini-cli",
    priority: 20,
    alias: "gc",
    uiAlias: "gc",
    category: "free",
    display: {
      name: "Gemini CLI",
      icon: "terminal",
      color: "#4285F4",
      website: "https://github.com/google-gemini/gemini-cli",
      notice: {
        signupUrl: "https://github.com/google-gemini/gemini-cli"
      },
      deprecated: true,
      deprecationNotice: "RISK_NOTICE"
    },
    hasFree: true,
    features: {
      usage: true
    },
    models: [
      {
        id: "gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro Preview"
      },
      {
        id: "gemini-3-pro-preview",
        name: "Gemini 3 Pro Preview"
      },
      {
        id: "gemini-3-flash-preview",
        name: "Gemini 3 Flash Preview"
      },
      {
        id: "gemini-3.1-flash-lite-preview",
        name: "Gemini 3.1 Flash Lite Preview"
      },
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro"
      },
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash"
      },
      {
        id: "gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash Lite"
      }
    ]
  },
  {
    id: "gemini",
    priority: 50,
    alias: "gemini",
    category: "freeTier",
    display: {
      name: "Gemini",
      icon: "diamond",
      color: "#4285F4",
      textIcon: "GE",
      website: "https://ai.google.dev",
      notice: {
        apiKeyUrl: "https://aistudio.google.com/app/apikey"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    hasFree: true,
    serviceKinds: [
      "llm",
      "embedding",
      "image",
      "imageToText",
      "webSearch",
      "tts",
      "stt"
    ],
    ttsConfig: {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
      authType: "apikey",
      authHeader: "key",
      format: "gemini-tts"
    },
    sttConfig: {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
      authType: "apikey",
      authHeader: "key",
      format: "gemini-stt"
    },
    embeddingConfig: {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
      authType: "apikey",
      authHeader: "key"
    },
    imageConfig: {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/models"
    },
    searchViaChat: {
      defaultModel: "gemini-2.5-flash",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
      pricingUrl: "https://ai.google.dev/pricing",
      freeTier: "Free tier: 15 RPM, 1M tokens/day on gemini-2.5-flash via AI Studio."
    },
    mediaPriority: 1,
    models: [
      {
        id: "gemini-3.8-flash",
        name: "Gemini 3.8 Flash"
      },
      {
        id: "gemini-3.7-flash",
        name: "Gemini 3.7 Flash"
      },
      {
        id: "gemini-3.6-flash",
        name: "Gemini 3.6 Flash"
      },
      {
        id: "gemini-3.5-flash-lite",
        name: "Gemini 3.5 Flash Lite"
      },
      {
        id: "gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro Preview"
      },
      {
        id: "gemini-3.1-flash-lite-preview",
        name: "Gemini 3.1 Flash Lite Preview"
      },
      {
        id: "gemini-3-flash-preview",
        name: "Gemini 3 Flash Preview"
      },
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro"
      },
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash"
      },
      {
        id: "gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash Lite"
      },
      {
        id: "gemma-4-31b-it",
        name: "Gemma 4 31B IT"
      },
      {
        id: "gemini-embedding-2-preview",
        name: "Gemini Embedding 2 Preview",
        kind: "embedding"
      },
      {
        id: "gemini-embedding-001",
        name: "Gemini Embedding 001",
        kind: "embedding"
      },
      {
        id: "text-embedding-005",
        name: "Text Embedding 005",
        kind: "embedding"
      },
      {
        id: "text-embedding-004",
        name: "Text Embedding 004 (Legacy)",
        kind: "embedding"
      },
      {
        id: "gemini-3.1-flash-image-preview",
        name: "Gemini 3.1 Flash Image (Nano Banana 2)",
        params: [],
        kind: "image"
      },
      {
        id: "gemini-3-pro-image-preview",
        name: "Gemini 3 Pro Image (Nano Banana Pro)",
        params: [],
        kind: "image"
      },
      {
        id: "gemini-2.5-flash-image",
        name: "Gemini 2.5 Flash Image (Nano Banana)",
        params: [],
        kind: "image"
      },
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro (Best)",
        params: [
          "language",
          "prompt"
        ],
        kind: "stt"
      },
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        params: [
          "language",
          "prompt"
        ],
        kind: "stt"
      },
      {
        id: "gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash Lite (Cheapest)",
        params: [
          "language",
          "prompt"
        ],
        kind: "stt"
      },
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        params: [
          "language",
          "prompt"
        ],
        kind: "stt"
      },
      {
        id: "gemini-3.1-flash-tts-preview",
        name: "Gemini 3.1 Flash TTS",
        kind: "tts"
      },
      {
        id: "gemini-2.5-flash-preview-tts",
        name: "Gemini 2.5 Flash TTS",
        kind: "tts"
      },
      {
        id: "gemini-2.5-pro-preview-tts",
        name: "Gemini 2.5 Pro TTS",
        kind: "tts"
      },
      {
        id: "embedding-001",
        name: "Embedding 001",
        dimensions: 768,
        kind: "embedding"
      }
    ]
  },
  {
    id: "github",
    priority: 40,
    alias: "gh",
    uiAlias: "gh",
    category: "oauth",
    display: {
      name: "GitHub Copilot",
      icon: "code",
      color: "#333333",
      website: "https://github.com/features/copilot",
      notice: {
        signupUrl: "https://github.com/features/copilot"
      },
      deprecated: true,
      deprecationNotice: "RISK_NOTICE"
    },
    features: {
      usage: true
    },
    serviceKinds: [
      "llm",
      "embedding"
    ],
    embeddingConfig: {
      baseUrl: "https://models.github.ai/inference/embeddings",
      authType: "apikey",
      authHeader: "bearer"
    },
    models: [
      {
        id: "gpt-5.2",
        name: "GPT-5.2"
      },
      {
        id: "gpt-5.2-codex",
        name: "GPT-5.2 Codex"
      },
      {
        id: "gpt-5.3-codex",
        name: "GPT-5.3 Codex"
      },
      {
        id: "gpt-5.4",
        name: "GPT-5.4"
      },
      {
        id: "gpt-5.4-mini",
        name: "GPT-5.4 Mini"
      },
      {
        id: "claude-haiku-4.5",
        name: "Claude Haiku 4.5"
      },
      {
        id: "claude-opus-4.5",
        name: "Claude Opus 4.5"
      },
      {
        id: "claude-sonnet-4.5",
        name: "Claude Sonnet 4.5"
      },
      {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6"
      },
      {
        id: "claude-opus-4.6",
        name: "Claude Opus 4.6"
      },
      {
        id: "claude-opus-4.7",
        name: "Claude Opus 4.7"
      },
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro"
      },
      {
        id: "gemini-3-flash-preview",
        name: "Gemini 3 Flash"
      },
      {
        id: "gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro"
      },
      {
        id: "grok-code-fast-1",
        name: "Grok Code Fast 1"
      },
      {
        id: "oswe-vscode-prime",
        name: "Raptor Mini"
      },
      {
        id: "goldeneye-free-auto",
        name: "GoldenEye"
      },
      {
        id: "text-embedding-3-small",
        name: "Text Embedding 3 Small (GitHub)",
        kind: "embedding"
      },
      {
        id: "text-embedding-3-large",
        name: "Text Embedding 3 Large (GitHub)",
        kind: "embedding"
      }
    ]
  },
  {
    id: "gitlab",
    priority: 100,
    category: "oauth",
    hidden: true,
    display: {
      name: "GitLab Duo",
      icon: "code",
      color: "#FC6D26",
      textIcon: "GL",
      website: "https://gitlab.com",
      notice: {
        signupUrl: "https://gitlab.com"
      }
    }
  },
  {
    id: "glm-cn",
    priority: 130,
    alias: "glm-cn",
    category: "apikey",
    display: {
      name: "GLM (China)",
      icon: "code",
      color: "#DC2626",
      textIcon: "GC",
      website: "https://open.bigmodel.cn",
      notice: {
        apiKeyUrl: "https://open.bigmodel.cn/usercenter/apikeys"
      }
    },
    features: {
      usage: true,
      usageApikey: true
    },
    models: [
      {
        id: "glm-5.3",
        name: "GLM 5.3"
      },
      {
        id: "glm-5.3-flash",
        name: "GLM 5.3 Flash (Vision)"
      },
      {
        id: "glm-5.2",
        name: "GLM 5.2"
      },
      {
        id: "glm-5.1",
        name: "GLM 5.1"
      },
      {
        id: "glm-5-turbo",
        name: "GLM 5 Turbo"
      },
      {
        id: "glm-5",
        name: "GLM 5"
      },
      {
        id: "glm-4.7",
        name: "GLM-4.7"
      },
      {
        id: "glm-4.6v",
        name: "GLM 4.6V (Vision)"
      },
      {
        id: "glm-4.6",
        name: "GLM-4.6"
      },
      {
        id: "glm-4.5-air",
        name: "GLM-4.5-Air"
      }
    ]
  },
  {
    id: "glm",
    priority: 140,
    alias: "glm",
    category: "apikey",
    display: {
      name: "GLM Coding",
      icon: "code",
      color: "#2563EB",
      textIcon: "GL",
      website: "https://open.bigmodel.cn",
      notice: {
        apiKeyUrl: "https://open.bigmodel.cn/usercenter/apikeys"
      }
    },
    features: {
      usage: true,
      usageApikey: true
    },
    serviceKinds: [
      "llm",
      "webSearch"
    ],
    searchConfig: {
      baseUrl: "https://api.z.ai/api/mcp/web_search_prime/mcp",
      method: "POST",
      authType: "apikey",
      authHeader: "bearer",
      costPerQuery: 0,
      searchTypes: [
        "web"
      ],
      defaultMaxResults: 5,
      maxMaxResults: 50,
      timeoutMs: 10000,
      cacheTTLMs: 300000
    },
    models: [
      {
        id: "glm-5.3",
        name: "GLM 5.3"
      },
      {
        id: "glm-5.3-flash",
        name: "GLM 5.3 Flash (Vision)"
      },
      {
        id: "glm-5.2",
        name: "GLM 5.2"
      },
      {
        id: "glm-5.1",
        name: "GLM 5.1"
      },
      {
        id: "glm-5-turbo",
        name: "GLM 5 Turbo"
      },
      {
        id: "glm-5",
        name: "GLM 5"
      },
      {
        id: "glm-4.7",
        name: "GLM 4.7"
      },
      {
        id: "glm-4.6v",
        name: "GLM 4.6V (Vision)"
      }
    ]
  },
  {
    id: "google-pse",
    alias: "gpse",
    category: "apikey",
    display: {
      name: "Google PSE",
      icon: "search",
      color: "#4285F4",
      textIcon: "GP",
      website: "https://programmablesearchengine.google.com",
      notice: {
        apiKeyUrl: "https://programmablesearchengine.google.com/controlpanel/create"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "webSearch"
    ],
    searchConfig: {
      baseUrl: "https://www.googleapis.com/customsearch/v1",
      method: "GET",
      authType: "apikey",
      authHeader: "key",
      costPerQuery: 0.005,
      freeMonthlyQuota: 3000,
      searchTypes: [
        "web",
        "news"
      ],
      defaultMaxResults: 5,
      maxMaxResults: 10,
      timeoutMs: 10000,
      cacheTTLMs: 300000
    }
  },
  {
    id: "google-tts",
    alias: "google-tts",
    category: "freeTier",
    display: {
      name: "Google TTS",
      icon: "record_voice_over",
      color: "#4285F4",
      textIcon: "GT"
    },
    authType: "none",
    noAuth: true,
    serviceKinds: [
      "tts"
    ],
    ttsConfig: {
      baseUrl: "google-tts",
      authType: "none",
      authHeader: "none",
      format: "google-tts",
      models: []
    },
    mediaPriority: 5
  },
  {
    id: "grok-cli",
    priority: 275,
    alias: "gcli",
    aliases: [
      "grok-build",
      "gb"
    ],
    uiAlias: "gcli",
    category: "oauth",
    display: {
      name: "Grok CLI (Grok Build)",
      icon: "auto_awesome",
      color: "#1DA1F2",
      textIcon: "GC",
      website: "https://x.ai",
      notice: {
        text: "Sign in with your xAI / Grok account via device code. Uses Grok Build subscription credits (cli-chat-proxy.grok.com).",
        signupUrl: "https://grok.com/supergrok"
      }
    },
    hasOAuth: true,
    authModes: [
      "oauth"
    ],
    features: {
      usage: true
    },
    thinkingConfig: {
      options: [
        "low",
        "medium",
        "high",
        "xhigh"
      ],
      defaultMode: "xhigh"
    },
    models: [
      {
        id: "grok-4.7",
        name: "Grok 4.7",
        contextLength: 500000,
        maxOutputTokens: 500000
      },
      {
        id: "grok-4.7-xhigh",
        name: "Grok 4.7 (Extra High)",
        upstreamModelId: "grok-4.7"
      },
      {
        id: "grok-4.7-high",
        name: "Grok 4.7 (High)",
        upstreamModelId: "grok-4.7"
      },
      {
        id: "grok-4.7-medium",
        name: "Grok 4.7 (Medium)",
        upstreamModelId: "grok-4.7"
      },
      {
        id: "grok-4.7-low",
        name: "Grok 4.7 (Low)",
        upstreamModelId: "grok-4.7"
      },
      {
        id: "grok-4.6",
        name: "Grok 4.6",
        contextLength: 500000,
        maxOutputTokens: 500000
      },
      {
        id: "grok-4.6-xhigh",
        name: "Grok 4.6 (Extra High)",
        upstreamModelId: "grok-4.6"
      },
      {
        id: "grok-4.6-high",
        name: "Grok 4.6 (High)",
        upstreamModelId: "grok-4.6"
      },
      {
        id: "grok-4.6-medium",
        name: "Grok 4.6 (Medium)",
        upstreamModelId: "grok-4.6"
      },
      {
        id: "grok-4.6-low",
        name: "Grok 4.6 (Low)",
        upstreamModelId: "grok-4.6"
      },
      {
        id: "grok-build",
        name: "Grok Build",
        contextLength: 500000,
        maxOutputTokens: 64000
      },
      {
        id: "grok-4.5",
        name: "Grok 4.5"
      },
      {
        id: "grok-4.5-xhigh",
        name: "Grok 4.5 (Extra High)",
        upstreamModelId: "grok-4.5"
      },
      {
        id: "grok-4.5-high",
        name: "Grok 4.5 (High)",
        upstreamModelId: "grok-4.5"
      },
      {
        id: "grok-4.5-medium",
        name: "Grok 4.5 (Medium)",
        upstreamModelId: "grok-4.5"
      },
      {
        id: "grok-4.5-low",
        name: "Grok 4.5 (Low)",
        upstreamModelId: "grok-4.5"
      }
    ]
  },
  {
    id: "groq",
    priority: 60,
    alias: "groq",
    category: "apikey",
    display: {
      name: "Groq",
      icon: "speed",
      color: "#F55036",
      textIcon: "GQ",
      website: "https://groq.com",
      notice: {
        apiKeyUrl: "https://console.groq.com/keys"
      }
    },
    hasFree: true,
    features: {
      usage: true,
      usageApikey: true
    },
    serviceKinds: [
      "llm",
      "imageToText",
      "stt"
    ],
    sttConfig: {
      baseUrl: "https://api.groq.com/openai/v1/audio/transcriptions",
      authType: "apikey",
      authHeader: "bearer",
      format: "openai"
    },
    models: [
      {
        id: "llama-3.3-70b-versatile",
        name: "Llama 3.3 70B"
      },
      {
        id: "meta-llama/llama-4-maverick-17b-128e-instruct",
        name: "Llama 4 Maverick"
      },
      {
        id: "qwen/qwen3-32b",
        name: "Qwen3 32B"
      },
      {
        id: "openai/gpt-oss-120b",
        name: "GPT-OSS 120B"
      },
      {
        id: "whisper-large-v3",
        name: "Whisper Large v3",
        params: [
          "language",
          "response_format",
          "temperature",
          "prompt"
        ],
        kind: "stt"
      },
      {
        id: "whisper-large-v3-turbo",
        name: "Whisper Large v3 Turbo",
        params: [
          "language",
          "response_format",
          "temperature",
          "prompt"
        ],
        kind: "stt"
      },
      {
        id: "distil-whisper-large-v3-en",
        name: "Distil Whisper Large v3 EN",
        params: [
          "language",
          "response_format",
          "temperature",
          "prompt"
        ],
        kind: "stt"
      }
    ]
  },
  {
    id: "huggingface",
    priority: 70,
    alias: "huggingface",
    aliases: [
      "hf"
    ],
    uiAlias: "hf",
    category: "apikey",
    display: {
      name: "HuggingFace",
      icon: "face",
      color: "#FFD21E",
      textIcon: "HF",
      website: "https://huggingface.co",
      notice: {
        apiKeyUrl: "https://huggingface.co/settings/tokens"
      }
    },
    authType: "apikey",
    hasFree: true,
    serviceKinds: [
      "image",
      "stt"
    ],
    imageConfig: {
      baseUrl: "https://api-inference.huggingface.co/models"
    },
    hiddenKinds: [
      "tts"
    ],
    models: [
      {
        id: "black-forest-labs/FLUX.1-schnell",
        name: "FLUX.1 Schnell",
        params: [],
        kind: "image"
      },
      {
        id: "stabilityai/stable-diffusion-xl-base-1.0",
        name: "SDXL Base 1.0",
        params: [],
        kind: "image"
      },
      {
        id: "openai/whisper-large-v3",
        name: "Whisper Large v3 (HF)",
        params: [
          "language"
        ],
        kind: "stt"
      },
      {
        id: "openai/whisper-small",
        name: "Whisper Small (HF)",
        params: [
          "language"
        ],
        kind: "stt"
      }
    ]
  },
  {
    id: "hyperbolic",
    priority: 160,
    alias: "hyperbolic",
    aliases: [
      "hyp"
    ],
    uiAlias: "hyp",
    category: "apikey",
    display: {
      name: "Hyperbolic",
      icon: "bolt",
      color: "#00D4FF",
      textIcon: "HY",
      website: "https://hyperbolic.xyz",
      notice: {
        apiKeyUrl: "https://app.hyperbolic.xyz/settings"
      }
    },
    authType: "apikey",
    models: [
      {
        id: "Qwen/QwQ-32B",
        name: "QwQ 32B"
      },
      {
        id: "deepseek-ai/DeepSeek-R1",
        name: "DeepSeek R1"
      },
      {
        id: "deepseek-ai/DeepSeek-V3",
        name: "DeepSeek V3"
      },
      {
        id: "meta-llama/Llama-3.3-70B-Instruct",
        name: "Llama 3.3 70B"
      },
      {
        id: "meta-llama/Llama-3.2-3B-Instruct",
        name: "Llama 3.2 3B"
      },
      {
        id: "Qwen/Qwen2.5-72B-Instruct",
        name: "Qwen 2.5 72B"
      },
      {
        id: "Qwen/Qwen2.5-Coder-32B-Instruct",
        name: "Qwen 2.5 Coder 32B"
      },
      {
        id: "NousResearch/Hermes-3-Llama-3.1-70B",
        name: "Hermes 3 70B"
      }
    ]
  },
  {
    id: "iflow",
    priority: 110,
    alias: "if",
    category: "oauth",
    hidden: true,
    display: {
      name: "iFlow AI",
      icon: "water_drop",
      color: "#6366F1",
      website: "https://iflow.cn",
      notice: {
        signupUrl: "https://iflow.cn"
      }
    },
    models: [
      {
        id: "qwen3-coder-plus",
        name: "Qwen3 Coder Plus"
      },
      {
        id: "qwen3-max",
        name: "Qwen3 Max"
      },
      {
        id: "qwen3-vl-plus",
        name: "Qwen3 VL Plus"
      },
      {
        id: "qwen3-max-preview",
        name: "Qwen3 Max Preview"
      },
      {
        id: "qwen3-235b",
        name: "Qwen3 235B A22B"
      },
      {
        id: "qwen3-235b-a22b-instruct",
        name: "Qwen3 235B A22B Instruct"
      },
      {
        id: "qwen3-235b-a22b-thinking-2507",
        name: "Qwen3 235B A22B Thinking"
      },
      {
        id: "qwen3-32b",
        name: "Qwen3 32B"
      },
      {
        id: "kimi-k2",
        name: "Kimi K2"
      },
      {
        id: "deepseek-v3.2",
        name: "DeepSeek V3.2 Exp"
      },
      {
        id: "deepseek-v3.1",
        name: "DeepSeek V3.1 Terminus"
      },
      {
        id: "deepseek-v3",
        name: "DeepSeek V3 671B"
      },
      {
        id: "deepseek-r1",
        name: "DeepSeek R1"
      },
      {
        id: "glm-4.7",
        name: "GLM 4.7"
      },
      {
        id: "iflow-rome-30ba3b",
        name: "iFlow ROME"
      }
    ]
  },
  {
    id: "inworld",
    alias: "inworld",
    category: "apikey",
    display: {
      name: "Inworld TTS",
      icon: "record_voice_over",
      color: "#FF6B6B",
      textIcon: "IW",
      website: "https://inworld.ai",
      notice: {
        text: "Free tier: 40 minutes/month TTS. Paid: TTS-1.5 Mini $0.01/min ($15/1M chars), TTS-1.5 Max $0.025/min ($30/1M chars). 270+ voices, 15 languages.",
        apiKeyUrl: "https://platform.inworld.ai/api-keys"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "tts"
    ],
    ttsConfig: {
      baseUrl: "https://api.inworld.ai/tts/v1/voice",
      authType: "apikey",
      authHeader: "basic",
      format: "inworld",
      models: [
        {
          id: "inworld-tts-1.5-mini",
          name: "Inworld TTS 1.5 Mini ($0.01/min)"
        },
        {
          id: "inworld-tts-1.5-max",
          name: "Inworld TTS 1.5 Max ($0.025/min)"
        }
      ]
    }
  },
  {
    id: "jina-ai",
    alias: "jina",
    category: "apikey",
    display: {
      name: "Jina AI",
      icon: "blur_on",
      color: "#2563EB",
      textIcon: "JA",
      website: "https://jina.ai",
      notice: {
        text: "10M free tokens on signup (non-commercial), no credit card required.",
        apiKeyUrl: "https://jina.ai/?sui=apikey"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "embedding"
    ],
    embeddingConfig: {
      baseUrl: "https://api.jina.ai/v1/embeddings",
      authType: "apikey",
      authHeader: "bearer",
      models: [
        {
          id: "jina-embeddings-v3",
          name: "Jina Embeddings v3",
          dimensions: 1024
        },
        {
          id: "jina-embeddings-v2-base-en",
          name: "Jina Embeddings v2 Base EN",
          dimensions: 768
        },
        {
          id: "jina-embeddings-v2-base-code",
          name: "Jina Embeddings v2 Base Code",
          dimensions: 768
        }
      ]
    }
  },
  {
    id: "jina-reader",
    alias: "jina-reader",
    category: "apikey",
    display: {
      name: "Jina Reader",
      icon: "menu_book",
      color: "#000000",
      textIcon: "JR",
      website: "https://jina.ai/reader",
      notice: {
        apiKeyUrl: "https://jina.ai/?sui=apikey"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "webFetch"
    ],
    fetchConfig: {
      baseUrl: "https://r.jina.ai",
      method: "GET",
      authType: "apikey",
      authHeader: "bearer",
      costPerQuery: 0,
      freeMonthlyQuota: 1000000,
      formats: [
        "markdown",
        "text",
        "html"
      ],
      maxCharacters: 200000,
      timeoutMs: 30000
    }
  },
  {
    id: "kilocode",
    priority: 70,
    alias: "kc",
    uiAlias: "kc",
    category: "oauth",
    display: {
      name: "Kilo Code",
      icon: "code",
      color: "#FF6B35",
      textIcon: "KC",
      website: "https://kilocode.ai",
      notice: {
        signupUrl: "https://kilocode.ai"
      }
    },
    passthroughModels: true,
    modelsFetcher: {
      url: "https://api.kilo.ai/api/gateway/models",
      type: "openrouter-free"
    },
    models: [
      {
        id: "anthropic/claude-sonnet-4-20250514",
        name: "Claude Sonnet 4"
      },
      {
        id: "anthropic/claude-opus-4-20250514",
        name: "Claude Opus 4"
      },
      {
        id: "google/gemini-2.5-pro",
        name: "Gemini 2.5 Pro"
      },
      {
        id: "google/gemini-2.5-flash",
        name: "Gemini 2.5 Flash"
      },
      {
        id: "openai/gpt-4.1",
        name: "GPT-4.1"
      },
      {
        id: "openai/o3",
        name: "o3"
      },
      {
        id: "deepseek/deepseek-chat",
        name: "DeepSeek Chat"
      },
      {
        id: "deepseek/deepseek-reasoner",
        name: "DeepSeek Reasoner"
      }
    ]
  },
  {
    id: "kimchi",
    priority: 95,
    alias: "kimchi",
    uiAlias: "kimchi",
    category: "freeTier",
    display: {
      name: "Kimchi",
      icon: "restaurant",
      color: "#FF521D",
      textIcon: "KC",
      website: "https://kimchi.dev",
      notice: {
        signupUrl: "https://app.kimchi.dev"
      }
    },
    hasOAuth: true,
    authModes: [
      "oauth",
      "apikey"
    ],
    passthroughModels: true,
    serviceKinds: [
      "llm",
      "imageToText"
    ],
    models: [
      {
        id: "minimax-m3",
        name: "MiniMax-M3"
      },
      {
        id: "kimi-k2.7",
        name: "Kimi-K2.7"
      },
      {
        id: "kimi-k2.6",
        name: "Kimi-K2.6"
      },
      {
        id: "kimi-k2.5",
        name: "Kimi-K2.5"
      },
      {
        id: "nemotron-3-ultra-fp4",
        name: "Nemotron 3 Ultra FP4"
      },
      {
        id: "minimax-m2.7",
        name: "MiniMax-M2.7"
      },
      {
        id: "claude-opus-4-6",
        name: "Claude Opus 4.6"
      },
      {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6"
      }
    ]
  },
  {
    id: "kimi",
    priority: 170,
    alias: "kimi",
    aliases: [
      "kimi-coding",
      "kmc"
    ],
    category: "oauth",
    display: {
      name: "Kimi",
      icon: "psychology",
      color: "#1E3A8A",
      textIcon: "KM",
      website: "https://kimi.moonshot.cn",
      notice: {
        apiKeyUrl: "https://platform.moonshot.ai/console/api-keys",
        signupUrl: "https://www.kimi.com/code"
      }
    },
    hasOAuth: true,
    authModes: [
      "oauth",
      "apikey"
    ],
    features: {
      usage: true,
      usageApikey: true
    },
    serviceKinds: [
      "llm",
      "webSearch"
    ],
    searchViaChat: {
      defaultModel: "kimi-k3",
      endpoint: "https://api.moonshot.cn/v1/chat/completions",
      pricingUrl: "https://platform.kimi.ai/docs/pricing/chat"
    },
    models: [
      {
        id: "kimi-k3",
        name: "Kimi K3"
      },
      {
        id: "k3",
        name: "Kimi K3 (Code)"
      },
      {
        id: "kimi-for-coding",
        name: "Kimi for Coding"
      },
      {
        id: "kimi-for-coding-highspeed",
        name: "Kimi for Coding Highspeed"
      },
      {
        id: "kimi-k2.7-code",
        name: "Kimi K2.7 Code"
      },
      {
        id: "kimi-k2.7-code-highspeed",
        name: "Kimi K2.7 Code Highspeed"
      },
      {
        id: "kimi-k2.6",
        name: "Kimi K2.6"
      },
      {
        id: "kimi-k2.5",
        name: "Kimi K2.5"
      },
      {
        id: "kimi-k2.5-thinking",
        name: "Kimi K2.5 Thinking"
      },
      {
        id: "kimi-latest",
        name: "Kimi Latest"
      }
    ]
  },
  {
    id: "kiro",
    priority: 10,
    alias: "kr",
    uiAlias: "kr",
    category: "free",
    display: {
      name: "Kiro AI",
      icon: "psychology_alt",
      color: "#FF6B35",
      website: "https://kiro.dev",
      notice: {
        signupUrl: "https://kiro.dev"
      },
      deprecated: true,
      deprecationNotice: "RISK_NOTICE"
    },
    passthroughModels: true,
    features: {
      usage: true,
      usageApikey: true
    },
    models: [
      {
        id: "claude-opus-5",
        name: "Claude Opus 5"
      },
      {
        id: "claude-opus-5-thinking",
        name: "Claude Opus 5 (Thinking)"
      },
      {
        id: "claude-opus-5-agentic",
        name: "Claude Opus 5 (Agentic)"
      },
      {
        id: "claude-opus-5-thinking-agentic",
        name: "Claude Opus 5 (Thinking + Agentic)"
      },
      {
        id: "claude-opus-4.8",
        name: "Claude Opus 4.8"
      },
      {
        id: "claude-opus-4.8-thinking",
        name: "Claude Opus 4.8 (Thinking)"
      },
      {
        id: "claude-opus-4.8-agentic",
        name: "Claude Opus 4.8 (Agentic)"
      },
      {
        id: "claude-opus-4.8-thinking-agentic",
        name: "Claude Opus 4.8 (Thinking + Agentic)"
      },
      {
        id: "claude-opus-4.7",
        name: "Claude Opus 4.7"
      },
      {
        id: "claude-opus-4.7-thinking",
        name: "Claude Opus 4.7 (Thinking)"
      },
      {
        id: "claude-opus-4.7-agentic",
        name: "Claude Opus 4.7 (Agentic)"
      },
      {
        id: "claude-opus-4.7-thinking-agentic",
        name: "Claude Opus 4.7 (Thinking + Agentic)"
      },
      {
        id: "claude-opus-4.6",
        name: "Claude Opus 4.6"
      },
      {
        id: "claude-opus-4.6-thinking",
        name: "Claude Opus 4.6 (Thinking)"
      },
      {
        id: "claude-opus-4.6-agentic",
        name: "Claude Opus 4.6 (Agentic)"
      },
      {
        id: "claude-opus-4.6-thinking-agentic",
        name: "Claude Opus 4.6 (Thinking + Agentic)"
      },
      {
        id: "claude-opus-4.5",
        name: "Claude Opus 4.5"
      },
      {
        id: "claude-opus-4.5-thinking",
        name: "Claude Opus 4.5 (Thinking)"
      },
      {
        id: "claude-opus-4.5-agentic",
        name: "Claude Opus 4.5 (Agentic)"
      },
      {
        id: "claude-opus-4.5-thinking-agentic",
        name: "Claude Opus 4.5 (Thinking + Agentic)"
      },
      {
        id: "claude-sonnet-5",
        name: "Claude Sonnet 5"
      },
      {
        id: "claude-sonnet-4.5",
        name: "Claude Sonnet 4.5"
      },
      {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6"
      },
      {
        id: "claude-sonnet-4",
        name: "Claude Sonnet 4"
      },
      {
        id: "claude-3-7-sonnet",
        name: "Claude 3.7 Sonnet"
      },
      {
        id: "claude-3-5-sonnet",
        name: "Claude 3.5 Sonnet"
      },
      {
        id: "claude-haiku-4.5",
        name: "Claude Haiku 4.5"
      },
      {
        id: "claude-haiku-4.6",
        name: "Claude Haiku 4.6"
      },
      {
        id: "claude-3-5-haiku",
        name: "Claude 3.5 Haiku"
      },
      {
        id: "deepseek-3.2",
        name: "DeepSeek 3.2",
        strip: [
          "image",
          "audio"
        ]
      },
      {
        id: "qwen3-coder-next",
        name: "Qwen3 Coder Next",
        strip: [
          "image",
          "audio"
        ]
      },
      {
        id: "glm-5",
        name: "GLM 5"
      },
      {
        id: "MiniMax-M2.5",
        name: "MiniMax M2.5"
      },
      {
        id: "deepseek-v3",
        name: "DeepSeek V3",
        strip: [
          "image",
          "audio"
        ]
      },
      {
        id: "deepseek-r1",
        name: "DeepSeek R1",
        strip: [
          "image",
          "audio"
        ]
      },
      {
        id: "qwen3-235b",
        name: "Qwen3 235B",
        strip: [
          "image",
          "audio"
        ]
      },
      {
        id: "gpt-5.6-sol",
        name: "GPT 5.6 Sol",
        contextLength: 272000,
        rateMultiplier: 2.4,
        upstreamModelId: "gpt-5.6-sol",
        description: "Experimental preview of OpenAI GPT 5.6 Sol with 272k context window"
      },
      {
        id: "gpt-5.6-terra",
        name: "GPT 5.6 Terra",
        contextLength: 272000,
        rateMultiplier: 1.2,
        upstreamModelId: "gpt-5.6-terra",
        description: "Experimental preview of OpenAI GPT 5.6 Terra with 272k context window"
      },
      {
        id: "gpt-5.6-luna",
        name: "GPT 5.6 Luna",
        contextLength: 272000,
        rateMultiplier: 0.6,
        upstreamModelId: "gpt-5.6-luna",
        description: "Experimental preview of OpenAI GPT 5.6 Luna with 272k context window"
      },
      {
        id: "claude-sonnet-5-thinking",
        name: "Claude Sonnet 5 (Thinking)"
      },
      {
        id: "claude-sonnet-4.5-thinking",
        name: "Claude Sonnet 4.5 (Thinking)"
      },
      {
        id: "claude-sonnet-4.6-thinking",
        name: "Claude Sonnet 4.6 (Thinking)"
      },
      {
        id: "claude-sonnet-4-thinking",
        name: "Claude Sonnet 4 (Thinking)"
      },
      {
        id: "claude-3-7-sonnet-thinking",
        name: "Claude 3.7 Sonnet (Thinking)"
      },
      {
        id: "claude-haiku-4.6-thinking",
        name: "Claude Haiku 4.6 (Thinking)"
      },
      {
        id: "claude-haiku-4.5-thinking",
        name: "Claude Haiku 4.5 (Thinking)"
      },
      {
        id: "gpt-5.6-sol-thinking",
        name: "GPT 5.6 Sol (Thinking)",
        contextLength: 272000,
        rateMultiplier: 2.4,
        upstreamModelId: "gpt-5.6-sol",
        description: "Experimental preview of OpenAI GPT 5.6 Sol with 272k context window"
      },
      {
        id: "gpt-5.6-terra-thinking",
        name: "GPT 5.6 Terra (Thinking)",
        contextLength: 272000,
        rateMultiplier: 1.2,
        upstreamModelId: "gpt-5.6-terra",
        description: "Experimental preview of OpenAI GPT 5.6 Terra with 272k context window"
      },
      {
        id: "gpt-5.6-luna-thinking",
        name: "GPT 5.6 Luna (Thinking)",
        contextLength: 272000,
        rateMultiplier: 0.6,
        upstreamModelId: "gpt-5.6-luna",
        description: "Experimental preview of OpenAI GPT 5.6 Luna with 272k context window"
      },
      {
        id: "claude-sonnet-5-agentic",
        name: "Claude Sonnet 5 (Agentic)"
      },
      {
        id: "claude-sonnet-4.5-agentic",
        name: "Claude Sonnet 4.5 (Agentic)"
      },
      {
        id: "claude-sonnet-4.6-agentic",
        name: "Claude Sonnet 4.6 (Agentic)"
      },
      {
        id: "claude-sonnet-4-agentic",
        name: "Claude Sonnet 4 (Agentic)"
      },
      {
        id: "claude-haiku-4.6-agentic",
        name: "Claude Haiku 4.6 (Agentic)"
      },
      {
        id: "claude-haiku-4.5-agentic",
        name: "Claude Haiku 4.5 (Agentic)"
      },
      {
        id: "gpt-5.6-sol-agentic",
        name: "GPT 5.6 Sol (Agentic)",
        contextLength: 272000,
        rateMultiplier: 2.4,
        upstreamModelId: "gpt-5.6-sol",
        description: "Experimental preview of OpenAI GPT 5.6 Sol with 272k context window"
      },
      {
        id: "gpt-5.6-terra-agentic",
        name: "GPT 5.6 Terra (Agentic)",
        contextLength: 272000,
        rateMultiplier: 1.2,
        upstreamModelId: "gpt-5.6-terra",
        description: "Experimental preview of OpenAI GPT 5.6 Terra with 272k context window"
      },
      {
        id: "gpt-5.6-luna-agentic",
        name: "GPT 5.6 Luna (Agentic)",
        contextLength: 272000,
        rateMultiplier: 0.6,
        upstreamModelId: "gpt-5.6-luna",
        description: "Experimental preview of OpenAI GPT 5.6 Luna with 272k context window"
      },
      {
        id: "claude-sonnet-5-thinking-agentic",
        name: "Claude Sonnet 5 (Thinking + Agentic)"
      },
      {
        id: "claude-sonnet-4.5-thinking-agentic",
        name: "Claude Sonnet 4.5 (Thinking + Agentic)"
      },
      {
        id: "claude-sonnet-4.6-thinking-agentic",
        name: "Claude Sonnet 4.6 (Thinking + Agentic)"
      },
      {
        id: "claude-sonnet-4-thinking-agentic",
        name: "Claude Sonnet 4 (Thinking + Agentic)"
      },
      {
        id: "claude-haiku-4.6-thinking-agentic",
        name: "Claude Haiku 4.6 (Thinking + Agentic)"
      },
      {
        id: "claude-haiku-4.5-thinking-agentic",
        name: "Claude Haiku 4.5 (Thinking + Agentic)"
      },
      {
        id: "gpt-5.6-sol-thinking-agentic",
        name: "GPT 5.6 Sol (Thinking + Agentic)",
        contextLength: 272000,
        rateMultiplier: 2.4,
        upstreamModelId: "gpt-5.6-sol",
        description: "Experimental preview of OpenAI GPT 5.6 Sol with 272k context window"
      },
      {
        id: "gpt-5.6-terra-thinking-agentic",
        name: "GPT 5.6 Terra (Thinking + Agentic)",
        contextLength: 272000,
        rateMultiplier: 1.2,
        upstreamModelId: "gpt-5.6-terra",
        description: "Experimental preview of OpenAI GPT 5.6 Terra with 272k context window"
      },
      {
        id: "gpt-5.6-luna-thinking-agentic",
        name: "GPT 5.6 Luna (Thinking + Agentic)",
        contextLength: 272000,
        rateMultiplier: 0.6,
        upstreamModelId: "gpt-5.6-luna",
        description: "Experimental preview of OpenAI GPT 5.6 Luna with 272k context window"
      }
    ]
  },
  {
    id: "linkup",
    alias: "linkup",
    category: "apikey",
    display: {
      name: "Linkup",
      icon: "link",
      color: "#0EA5E9",
      textIcon: "LK",
      website: "https://linkup.so",
      notice: {
        apiKeyUrl: "https://app.linkup.so/api-keys"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "webSearch"
    ],
    searchConfig: {
      baseUrl: "https://api.linkup.so/v1/search",
      method: "POST",
      authType: "apikey",
      authHeader: "bearer",
      costPerQuery: 0.005,
      freeMonthlyQuota: 1000,
      searchTypes: [
        "web"
      ],
      defaultMaxResults: 5,
      maxMaxResults: 50,
      timeoutMs: 10000,
      cacheTTLMs: 300000
    }
  },
  {
    id: "local-device",
    alias: "local-device",
    category: "freeTier",
    display: {
      name: "Local Device",
      icon: "speaker",
      color: "#64748B",
      textIcon: "LD"
    },
    authType: "none",
    noAuth: true,
    serviceKinds: [
      "tts"
    ],
    ttsConfig: {
      baseUrl: "local-device",
      authType: "none",
      authHeader: "none",
      format: "local-device",
      models: []
    },
    mediaPriority: 5
  },
  {
    id: "minimax-cn",
    priority: 190,
    alias: "minimax-cn",
    category: "apikey",
    display: {
      name: "Minimax (China)",
      icon: "memory",
      color: "#DC2626",
      textIcon: "MC",
      website: "https://www.minimaxi.com",
      notice: {
        apiKeyUrl: "https://platform.minimaxi.com/user-center/basic-information/interface-key"
      }
    },
    features: {
      usage: true,
      usageApikey: true
    },
    serviceKinds: [
      "llm",
      "tts"
    ],
    ttsConfig: {
      baseUrl: "https://api.minimaxi.com/v1/t2a_v2",
      authType: "apikey",
      authHeader: "bearer",
      format: "minimax-tts"
    },
    models: [
      {
        id: "MiniMax-M3",
        name: "MiniMax M3",
        targetFormat: "claude"
      },
      {
        id: "MiniMax-M2.7",
        name: "MiniMax M2.7"
      },
      {
        id: "MiniMax-M2.5",
        name: "MiniMax M2.5"
      },
      {
        id: "MiniMax-M2.1",
        name: "MiniMax M2.1"
      },
      {
        id: "speech-2.8-hd",
        name: "Speech 2.8 HD",
        kind: "tts"
      },
      {
        id: "speech-2.8-turbo",
        name: "Speech 2.8 Turbo",
        kind: "tts"
      },
      {
        id: "speech-2.6-hd",
        name: "Speech 2.6 HD",
        kind: "tts"
      },
      {
        id: "speech-2.6-turbo",
        name: "Speech 2.6 Turbo",
        kind: "tts"
      },
      {
        id: "speech-02-hd",
        name: "Speech 02 HD",
        kind: "tts"
      },
      {
        id: "speech-02-turbo",
        name: "Speech 02 Turbo",
        kind: "tts"
      },
      {
        id: "speech-01-hd",
        name: "Speech 01 HD",
        kind: "tts"
      },
      {
        id: "speech-01-turbo",
        name: "Speech 01 Turbo",
        kind: "tts"
      }
    ]
  },
  {
    id: "minimax",
    priority: 90,
    alias: "minimax",
    category: "apikey",
    display: {
      name: "Minimax Coding",
      icon: "memory",
      color: "#7C3AED",
      textIcon: "MM",
      website: "https://www.minimaxi.com",
      notice: {
        apiKeyUrl: "https://platform.minimaxi.com/user-center/basic-information/interface-key"
      }
    },
    features: {
      usage: true,
      usageApikey: true
    },
    serviceKinds: [
      "llm",
      "image",
      "imageToText",
      "webSearch",
      "tts"
    ],
    ttsConfig: {
      baseUrl: "https://api.minimax.io/v1/t2a_v2",
      authType: "apikey",
      authHeader: "bearer",
      format: "minimax-tts"
    },
    imageConfig: {
      baseUrl: "https://api.minimaxi.com/v1/images/generations"
    },
    searchViaChat: {
      defaultModel: "MiniMax-M2.7",
      endpoint: "https://api.minimaxi.com/v1/text/chatcompletion_v2",
      pricingUrl: "https://www.minimaxi.com/document/price"
    },
    models: [
      {
        id: "MiniMax-M3",
        name: "MiniMax M3",
        targetFormat: "claude"
      },
      {
        id: "MiniMax-M2.7",
        name: "MiniMax M2.7"
      },
      {
        id: "MiniMax-M2.5",
        name: "MiniMax M2.5"
      },
      {
        id: "MiniMax-M2.1",
        name: "MiniMax M2.1"
      },
      {
        id: "minimax-image-01",
        name: "MiniMax Image 01",
        params: [
          "n",
          "size",
          "response_format"
        ],
        kind: "image"
      },
      {
        id: "speech-2.8-hd",
        name: "Speech 2.8 HD",
        kind: "tts"
      },
      {
        id: "speech-2.8-turbo",
        name: "Speech 2.8 Turbo",
        kind: "tts"
      },
      {
        id: "speech-2.6-hd",
        name: "Speech 2.6 HD",
        kind: "tts"
      },
      {
        id: "speech-2.6-turbo",
        name: "Speech 2.6 Turbo",
        kind: "tts"
      },
      {
        id: "speech-02-hd",
        name: "Speech 02 HD",
        kind: "tts"
      },
      {
        id: "speech-02-turbo",
        name: "Speech 02 Turbo",
        kind: "tts"
      },
      {
        id: "speech-01-hd",
        name: "Speech 01 HD",
        kind: "tts"
      },
      {
        id: "speech-01-turbo",
        name: "Speech 01 Turbo",
        kind: "tts"
      }
    ]
  },
  {
    id: "mistral",
    priority: 80,
    alias: "mistral",
    category: "apikey",
    display: {
      name: "Mistral",
      icon: "air",
      color: "#FF7000",
      textIcon: "MI",
      website: "https://mistral.ai",
      notice: {
        apiKeyUrl: "https://console.mistral.ai/api-keys"
      }
    },
    serviceKinds: [
      "llm",
      "imageToText",
      "embedding"
    ],
    embeddingConfig: {
      baseUrl: "https://api.mistral.ai/v1/embeddings",
      authType: "apikey",
      authHeader: "bearer"
    },
    models: [
      {
        id: "mistral-large-latest",
        name: "Mistral Large 3"
      },
      {
        id: "codestral-latest",
        name: "Codestral"
      },
      {
        id: "mistral-medium-latest",
        name: "Mistral Medium 3"
      },
      {
        id: "mistral-embed",
        name: "Mistral Embed",
        kind: "embedding"
      }
    ]
  },
  {
    id: "nanobanana",
    priority: 80,
    alias: "nanobanana",
    aliases: [
      "nb"
    ],
    uiAlias: "nb",
    category: "apikey",
    display: {
      name: "NanoBanana API",
      icon: "extension",
      color: "#FFD700",
      textIcon: "🍌",
      website: "https://nanobananaapi.ai",
      notice: {
        text: "3rd-party proxy for Google Nano Banana (Gemini 2.5/3 Flash Image). For official, use Gemini provider.",
        apiKeyUrl: "https://nanobananaapi.ai/dashboard"
      }
    },
    hasFree: true,
    serviceKinds: [
      "image"
    ],
    imageConfig: {
      baseUrl: "https://api.nanobananaapi.ai/api/v1/nanobanana/generate",
      pollUrl: "https://api.nanobananaapi.ai/api/v1/nanobanana/record-info"
    },
    models: [
      {
        id: "nanobanana-flash",
        name: "NanoBanana Flash",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      },
      {
        id: "nanobanana-pro",
        name: "NanoBanana Pro",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      }
    ]
  },
  {
    id: "nebius",
    priority: 70,
    alias: "nebius",
    category: "apikey",
    display: {
      name: "Nebius AI",
      icon: "cloud",
      color: "#6C5CE7",
      textIcon: "NB",
      website: "https://nebius.com",
      notice: {
        apiKeyUrl: "https://studio.nebius.com/settings/api-keys"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "llm",
      "embedding"
    ],
    embeddingConfig: {
      baseUrl: "https://api.tokenfactory.nebius.com/v1/embeddings"
    },
    models: [
      {
        id: "meta-llama/Llama-3.3-70B-Instruct",
        name: "Llama 3.3 70B Instruct"
      },
      {
        id: "Qwen/Qwen3-Embedding-8B",
        name: "Qwen3 Embedding 8B",
        kind: "embedding"
      }
    ]
  },
  {
    id: "nvidia",
    priority: 20,
    alias: "nvidia",
    category: "freeTier",
    display: {
      name: "NVIDIA NIM",
      icon: "developer_board",
      color: "#76B900",
      textIcon: "NV",
      website: "https://developer.nvidia.com/nim",
      notice: {
        text: "Free access for NVIDIA Developer Program members (prototyping & testing).",
        apiKeyUrl: "https://build.nvidia.com/settings/api-keys"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    hasFree: true,
    serviceKinds: [
      "llm",
      "tts",
      "embedding"
    ],
    ttsConfig: {
      baseUrl: "https://integrate.api.nvidia.com/v1/audio/speech",
      authType: "apikey",
      authHeader: "bearer",
      format: "nvidia-tts"
    },
    embeddingConfig: {
      baseUrl: "https://integrate.api.nvidia.com/v1/embeddings",
      authType: "apikey",
      authHeader: "bearer"
    },
    models: [
      {
        id: "minimaxai/minimax-m2.7",
        name: "MiniMax M2.7"
      },
      {
        id: "minimaxai/minimax-m3",
        name: "MiniMax M3"
      },
      {
        id: "z-ai/glm-5.2",
        name: "GLM 5.2"
      },
      {
        id: "deepseek-ai/deepseek-v4-pro",
        name: "DeepSeek V4 Pro"
      },
      {
        id: "deepseek-ai/deepseek-v4-flash",
        name: "DeepSeek V4 Flash"
      },
      {
        id: "moonshotai/kimi-k2.6",
        name: "Kimi K2.6"
      },
      {
        id: "nvidia/nemotron-3-ultra-550b-a55b",
        name: "Nemotron 3 Ultra"
      },
      {
        id: "nvidia/nv-embedqa-e5-v5",
        name: "NV EmbedQA E5 v5",
        kind: "embedding"
      },
      {
        id: "nvidia/parakeet-ctc-1.1b-asr",
        name: "Parakeet CTC 1.1B",
        params: [
          "language"
        ],
        kind: "stt"
      },
      {
        id: "fastpitch",
        name: "FastPitch",
        kind: "tts"
      },
      {
        id: "tacotron2",
        name: "Tacotron2",
        kind: "tts"
      }
    ]
  },
  {
    id: "ollama-local",
    priority: 50,
    alias: "ollama-local",
    category: "apikey",
    display: {
      name: "Ollama Local",
      icon: "cloud",
      color: "#ffffffff",
      textIcon: "OL",
      website: "https://ollama.com"
    },
    hasFree: true,
    serviceKinds: [
      "llm"
    ]
  },
  {
    id: "ollama",
    priority: 30,
    alias: "ollama",
    category: "freeTier",
    display: {
      name: "Ollama Cloud",
      icon: "cloud",
      color: "#ffffffff",
      textIcon: "OL",
      website: "https://ollama.com",
      notice: {
        text: "Free tier: light usage, 1 cloud model at a time (limits reset every 5h & 7d). Pro $20/mo · Max $100/mo.",
        apiKeyUrl: "https://ollama.com/settings/keys"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    hasFree: true,
    features: {
      usage: true,
      usageApikey: true
    },
    serviceKinds: [
      "llm",
      "webFetch"
    ],
    fetchConfig: {
      baseUrl: "https://ollama.com/api/web_fetch",
      method: "POST",
      authType: "apikey",
      authHeader: "bearer",
      formats: [
        "markdown"
      ],
      maxCharacters: 200000,
      timeoutMs: 30000
    },
    models: [
      {
        id: "gpt-oss:120b",
        name: "GPT OSS 120B"
      },
      {
        id: "kimi-k2.5",
        name: "Kimi K2.5"
      },
      {
        id: "glm-5",
        name: "GLM 5"
      },
      {
        id: "minimax-m2.5",
        name: "MiniMax M2.5"
      },
      {
        id: "glm-4.7-flash",
        name: "GLM 4.7 Flash"
      },
      {
        id: "qwen3.5",
        name: "Qwen3.5"
      },
      {
        id: "minimax-m3",
        name: "MiniMax M3"
      },
      {
        id: "deepseek-v4.1-flash:cloud",
        name: "DeepSeek V4.1 Flash"
      }
    ]
  },
  {
    id: "openai",
    priority: 30,
    alias: "openai",
    category: "apikey",
    display: {
      name: "OpenAI",
      icon: "auto_awesome",
      color: "#10A37F",
      textIcon: "OA",
      website: "https://platform.openai.com",
      notice: {
        apiKeyUrl: "https://platform.openai.com/api-keys"
      }
    },
    thinkingConfig: {
      options: [
        "auto",
        "none",
        "low",
        "medium",
        "high"
      ],
      defaultMode: "auto"
    },
    serviceKinds: [
      "llm",
      "embedding",
      "tts",
      "stt",
      "image",
      "imageToText",
      "webSearch"
    ],
    ttsConfig: {
      baseUrl: "https://api.openai.com/v1/audio/speech",
      authType: "apikey",
      authHeader: "bearer",
      format: "openai",
      defaultModel: "gpt-4o-mini-tts"
    },
    sttConfig: {
      baseUrl: "https://api.openai.com/v1/audio/transcriptions",
      authType: "apikey",
      authHeader: "bearer",
      format: "openai"
    },
    embeddingConfig: {
      baseUrl: "https://api.openai.com/v1/embeddings",
      authType: "apikey",
      authHeader: "bearer"
    },
    imageConfig: {
      baseUrl: "https://api.openai.com/v1/images/generations"
    },
    searchViaChat: {
      defaultModel: "gpt-4o-mini",
      pricingUrl: "https://openai.com/api/pricing"
    },
    models: [
      {
        id: "gpt-5.4",
        name: "GPT-5.4"
      },
      {
        id: "gpt-5.4-mini",
        name: "GPT-5.4 Mini"
      },
      {
        id: "gpt-5.4-nano",
        name: "GPT-5.4 Nano"
      },
      {
        id: "gpt-5.2",
        name: "GPT-5.2"
      },
      {
        id: "gpt-5.1",
        name: "GPT-5.1"
      },
      {
        id: "gpt-5",
        name: "GPT-5"
      },
      {
        id: "gpt-5-mini",
        name: "GPT-5 Mini"
      },
      {
        id: "gpt-5-nano",
        name: "GPT-5 Nano"
      },
      {
        id: "gpt-4o",
        name: "GPT-4o"
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini"
      },
      {
        id: "gpt-4-turbo",
        name: "GPT-4 Turbo"
      },
      {
        id: "gpt-4.1",
        name: "GPT-4.1"
      },
      {
        id: "gpt-4.1-mini",
        name: "GPT-4.1 Mini"
      },
      {
        id: "gpt-4.1-nano",
        name: "GPT-4.1 Nano"
      },
      {
        id: "o3",
        name: "O3"
      },
      {
        id: "o3-mini",
        name: "O3 Mini"
      },
      {
        id: "o3-pro",
        name: "O3 Pro"
      },
      {
        id: "o4-mini",
        name: "O4 Mini"
      },
      {
        id: "o1",
        name: "O1"
      },
      {
        id: "o1-mini",
        name: "O1 Mini"
      },
      {
        id: "text-embedding-3-large",
        name: "Text Embedding 3 Large",
        kind: "embedding"
      },
      {
        id: "text-embedding-3-small",
        name: "Text Embedding 3 Small",
        kind: "embedding"
      },
      {
        id: "text-embedding-ada-002",
        name: "Text Embedding Ada 002",
        kind: "embedding"
      },
      {
        id: "tts-1",
        name: "TTS-1",
        kind: "tts"
      },
      {
        id: "tts-1-hd",
        name: "TTS-1 HD",
        kind: "tts"
      },
      {
        id: "gpt-4o-mini-tts",
        name: "GPT-4o Mini TTS",
        kind: "tts"
      },
      {
        id: "whisper-1",
        name: "Whisper 1",
        params: [
          "language",
          "response_format",
          "temperature",
          "prompt"
        ],
        kind: "stt"
      },
      {
        id: "gpt-4o-transcribe",
        name: "GPT-4o Transcribe",
        params: [
          "language",
          "response_format",
          "temperature",
          "prompt"
        ],
        kind: "stt"
      },
      {
        id: "gpt-4o-mini-transcribe",
        name: "GPT-4o Mini Transcribe",
        params: [
          "language",
          "response_format",
          "temperature",
          "prompt"
        ],
        kind: "stt"
      },
      {
        id: "gpt-image-2.5",
        name: "GPT Image 2.5",
        params: [
          "n",
          "size",
          "quality",
          "response_format"
        ],
        kind: "image"
      },
      {
        id: "gpt-image-2.5-flare",
        name: "GPT Image 2.5 Flare",
        params: [
          "n",
          "size",
          "quality",
          "response_format"
        ],
        kind: "image"
      },
      {
        id: "gpt-image-2.5-sunburst",
        name: "GPT Image 2.5 Sunburst",
        params: [
          "n",
          "size",
          "quality",
          "response_format"
        ],
        kind: "image"
      },
      {
        id: "gpt-image-1",
        name: "GPT Image 1",
        params: [
          "n",
          "size",
          "quality",
          "response_format"
        ],
        kind: "image"
      },
      {
        id: "dall-e-3",
        name: "DALL-E 3",
        params: [
          "size",
          "quality",
          "style",
          "response_format"
        ],
        kind: "image"
      },
      {
        id: "dall-e-2",
        name: "DALL-E 2",
        params: [
          "n",
          "size",
          "response_format"
        ],
        kind: "image"
      }
    ]
  },
  {
    id: "opencode-go",
    priority: 210,
    alias: "opencode-go",
    aliases: [
      "ocg"
    ],
    uiAlias: "ocg",
    category: "apikey",
    display: {
      name: "OpenCode Go",
      icon: "terminal",
      color: "#E87040",
      textIcon: "OC",
      website: "https://opencode.ai/auth",
      notice: {
        text: "OpenCode Go subscription: $5/mo (then 10/mo). Access to Kimi, GLM, Qwen, MiMo, MiniMax models.",
        apiKeyUrl: "https://opencode.ai/auth"
      }
    },
    features: {
      usage: true,
      usageApikey: true
    },
    models: [
      {
        id: "deepseek-flash",
        name: "DeepSeek V4.1 Flash",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "glm-5.3-flash",
        name: "GLM 5.3 Flash (Vision)",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "glm-5.3",
        name: "GLM 5.3",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "glm-5.2",
        name: "GLM 5.2",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "glm-5.1",
        name: "GLM 5.1",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "kimi-k2.7-code",
        name: "Kimi K2.7 Code",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "kimi-k2.6",
        name: "Kimi K2.6",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "kimi-k3",
        name: "Kimi K3",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        supportedFormats: [
          "openai",
          "claude",
          "openai-responses"
        ]
      },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        supportedFormats: [
          "openai",
          "claude",
          "openai-responses"
        ]
      },
      {
        id: "deepseek-v4-flash-vision-exp",
        name: "DeepSeek V4 Flash Vision (Exp)",
        supportedFormats: [
          "openai",
          "claude",
          "openai-responses"
        ]
      },
      {
        id: "longcat-2.0",
        name: "LongCat 2.0",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "mimo-v2.5",
        name: "MiMo V2.5",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "mimo-v2.5-pro",
        name: "MiMo V2.5 Pro",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "minimax-m3",
        name: "MiniMax M3",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "minimax-m2.7",
        name: "MiniMax M2.7",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "minimax-m2.5",
        name: "MiniMax M2.5",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "qwen3.8-max",
        name: "Qwen 3.8 Max",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "qwen3.8-flash",
        name: "Qwen 3.8 Flash",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "qwen3.7-max",
        name: "Qwen 3.7 Max",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "qwen3.7-plus",
        name: "Qwen 3.7 Plus",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "qwen3.6-plus",
        name: "Qwen 3.6 Plus",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "hy4-preview",
        name: "Hy4 Preview",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "hy3",
        name: "Hy3",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "grok-4.6",
        name: "Grok 4.6",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.6-luna",
        name: "GPT 5.6 Luna",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "muse-spark-1.2-contributor",
        name: "Muse Spark 1.2 Contributor",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "muse-spark-1.3-contributor",
        name: "Muse Spark 1.3 Contributor",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      }
    ]
  },
  {
    id: "opencode",
    priority: 40,
    alias: "oc",
    uiAlias: "oc",
    category: "free",
    display: {
      name: "OpenCode Free",
      icon: "terminal",
      color: "#E87040",
      textIcon: "OC"
    },
    noAuth: true,
    passthroughModels: true,
    hasFree: true,
    modelsFetcher: {
      url: "https://opencode.ai/zen/v1/models",
      type: "opencode-free"
    },
    models: [
      {
        id: "muse-spark-1.2-contributor-free",
        name: "Muse Spark 1.2 Contributor Free",
        targetFormat: "openai-responses"
      },
      {
        id: "muse-spark-1.3-contributor-free",
        name: "Muse Spark 1.3 Contributor Free",
        targetFormat: "openai-responses"
      },
      {
        id: "union-alpha",
        name: "Union Alpha",
        targetFormat: "claude",
        supportedFormats: [
          "claude"
        ]
      }
    ]
  },
  {
    id: "openrouter",
    priority: 10,
    alias: "openrouter",
    category: "freeTier",
    display: {
      name: "OpenRouter",
      icon: "router",
      color: "#F97316",
      textIcon: "OR",
      website: "https://openrouter.ai",
      notice: {
        text: "Free tier: 27+ free models, no credit card needed, 200 req/day. After  0 credit: 1,000 req/day.",
        apiKeyUrl: "https://openrouter.ai/settings/keys"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    passthroughModels: true,
    hasFree: true,
    serviceKinds: [
      "llm",
      "embedding",
      "tts",
      "imageToText",
      "video"
    ],
    ttsConfig: {
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      defaultModel: "openai/gpt-4o-mini-tts",
      headers: {
        "HTTP-Referer": "https://endpoint-proxy.local",
        "X-Title": "Endpoint Proxy"
      }
    },
    embeddingConfig: {
      baseUrl: "https://openrouter.ai/api/v1/embeddings",
      authType: "apikey",
      authHeader: "bearer",
      headers: {
        "HTTP-Referer": "https://endpoint-proxy.local",
        "X-Title": "Endpoint Proxy"
      }
    },
    imageConfig: {
      baseUrl: "https://openrouter.ai/api/v1/images/generations",
      headers: {
        "HTTP-Referer": "https://endpoint-proxy.local",
        "X-Title": "Endpoint Proxy"
      }
    },
    videoConfig: {
      baseUrl: "https://openrouter.ai/api/v1/videos",
      headers: {
        "HTTP-Referer": "https://endpoint-proxy.local",
        "X-Title": "Endpoint Proxy"
      }
    },
    modelsFetcher: {
      url: "https://openrouter.ai/api/v1/models",
      type: "openrouter-free"
    },
    models: [
      {
        id: "openai/text-embedding-3-large",
        name: "OpenAI Text Embedding 3 Large",
        kind: "embedding"
      },
      {
        id: "openai/text-embedding-3-small",
        name: "OpenAI Text Embedding 3 Small",
        kind: "embedding"
      },
      {
        id: "openai/text-embedding-ada-002",
        name: "OpenAI Text Embedding Ada 002",
        kind: "embedding"
      },
      {
        id: "qwen/qwen3-embedding-8b",
        name: "Qwen3 Embedding 8B",
        kind: "embedding"
      },
      {
        id: "perplexity/pplx-embed-v1-4b",
        name: "Perplexity Embed V1 4B",
        kind: "embedding"
      },
      {
        id: "perplexity/pplx-embed-v1-0.6b",
        name: "Perplexity Embed V1 0.6B",
        kind: "embedding"
      },
      {
        id: "nvidia/llama-nemotron-embed-vl-1b-v2:free",
        name: "NVIDIA Nemotron Embed VL 1B V2 (Free)",
        kind: "embedding"
      },
      {
        id: "openai/gpt-4o-mini-tts",
        name: "GPT-4o Mini TTS",
        kind: "tts"
      },
      {
        id: "openai/tts-1-hd",
        name: "TTS-1 HD",
        kind: "tts"
      },
      {
        id: "openai/tts-1",
        name: "TTS-1",
        kind: "tts"
      },
      {
        id: "openai/dall-e-3",
        name: "DALL-E 3 (via OpenRouter)",
        params: [
          "size",
          "quality",
          "style",
          "response_format"
        ],
        kind: "image"
      },
      {
        id: "openai/gpt-image-1",
        name: "GPT Image 1 (via OpenRouter)",
        params: [
          "n",
          "size",
          "quality",
          "response_format"
        ],
        kind: "image"
      },
      {
        id: "google/imagen-3.0-generate-002",
        name: "Imagen 3 (via OpenRouter)",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      },
      {
        id: "black-forest-labs/FLUX.1-schnell",
        name: "FLUX.1 Schnell (via OpenRouter)",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      },
      {
        id: "google/veo-3.1",
        name: "Veo 3.1 (via OpenRouter)",
        params: [
          "duration",
          "aspect_ratio",
          "resolution"
        ],
        kind: "video"
      },
      {
        id: "openai/sora-2-pro",
        name: "Sora 2 Pro (via OpenRouter)",
        params: [
          "duration",
          "aspect_ratio",
          "resolution"
        ],
        kind: "video"
      },
      {
        id: "bytedance/seedance-2.0",
        name: "Seedance 2.0 (via OpenRouter)",
        params: [
          "duration",
          "aspect_ratio",
          "resolution"
        ],
        kind: "video"
      }
    ]
  },
  {
    id: "perplexity-web",
    priority: 220,
    alias: "perplexity-web",
    aliases: [
      "pw"
    ],
    uiAlias: "pw",
    category: "webCookie",
    display: {
      name: "Perplexity Web (Pro/Max)",
      icon: "search",
      color: "#20808D",
      textIcon: "PW",
      website: "https://www.perplexity.ai"
    },
    authType: "cookie",
    authHint: "Paste your __Secure-next-auth.session-token cookie value from perplexity.ai",
    models: [
      {
        id: "pplx-auto",
        name: "Perplexity Auto (Free)"
      },
      {
        id: "pplx-sonar",
        name: "Perplexity Sonar"
      },
      {
        id: "pplx-gpt",
        name: "GPT-5.4 (via Perplexity)"
      },
      {
        id: "pplx-gemini",
        name: "Gemini 3.1 Pro (via Perplexity)"
      },
      {
        id: "pplx-sonnet",
        name: "Claude Sonnet 4.6 (via Perplexity)"
      },
      {
        id: "pplx-opus",
        name: "Claude Opus 4.6 (via Perplexity)"
      },
      {
        id: "pplx-nemotron",
        name: "Nemotron 3 Super (via Perplexity)"
      }
    ]
  },
  {
    id: "perplexity",
    priority: 180,
    alias: "perplexity",
    aliases: [
      "pplx"
    ],
    uiAlias: "pplx",
    category: "apikey",
    display: {
      name: "Perplexity",
      icon: "search",
      color: "#20808D",
      textIcon: "PP",
      website: "https://www.perplexity.ai",
      notice: {
        apiKeyUrl: "https://www.perplexity.ai/settings/api"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "llm",
      "webSearch"
    ],
    searchViaChat: {
      defaultModel: "sonar",
      endpoint: "https://api.perplexity.ai/chat/completions",
      pricingUrl: "https://docs.perplexity.ai/guides/pricing"
    },
    models: [
      {
        id: "sonar-pro",
        name: "Sonar Pro"
      },
      {
        id: "sonar",
        name: "Sonar"
      }
    ]
  },
  {
    id: "perplexity-agent",
    priority: 181,
    alias: "perplexity-agent",
    aliases: [
      "pplx-agent",
      "pplx-responses"
    ],
    uiAlias: "pa",
    category: "apikey",
    display: {
      name: "Perplexity Agent",
      icon: "travel_explore",
      color: "#20808D",
      textIcon: "PA",
      website: "https://www.perplexity.ai",
      notice: {
        text: "Perplexity Agent API exposes GPT, Claude, Gemini, Grok, GLM, Kimi, and Sonar models through one OpenAI-compatible Responses API.",
        apiKeyUrl: "https://www.perplexity.ai/settings/api"
      }
    },
    authType: "apikey",
    passthroughModels: true,
    serviceKinds: [
      "llm",
      "webSearch"
    ],
    searchViaChat: {
      defaultModel: "perplexity/sonar",
      endpoint: "https://api.perplexity.ai/v1/responses",
      pricingUrl: "https://docs.perplexity.ai/docs/agent-api/models"
    },
    modelsFetcher: {
      url: "https://api.perplexity.ai/v1/models",
      type: "openai"
    },
    models: [
      {
        id: "perplexity/sonar",
        name: "Perplexity Sonar"
      },
      {
        id: "openai/gpt-5.5",
        name: "GPT-5.5"
      },
      {
        id: "openai/gpt-5.4",
        name: "GPT-5.4"
      },
      {
        id: "openai/gpt-5.4-mini",
        name: "GPT-5.4 Mini"
      },
      {
        id: "anthropic/claude-sonnet-4-6",
        name: "Claude Sonnet 4.6"
      },
      {
        id: "anthropic/claude-opus-4-8",
        name: "Claude Opus 4.8"
      },
      {
        id: "google/gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro"
      },
      {
        id: "xai/grok-4.20-reasoning",
        name: "Grok 4.20 Reasoning"
      },
      {
        id: "perplexity/glm-5.2",
        name: "GLM 5.2"
      },
      {
        id: "perplexity/kimi-k2.7-code",
        name: "Kimi K2.7 Code"
      },
      {
        id: "nvidia/nemotron-3-super-120b-a12b",
        name: "Nemotron 3 Super 120B"
      }
    ]
  },
  {
    id: "playht",
    alias: "playht",
    category: "apikey",
    hidden: true,
    display: {
      name: "PlayHT",
      icon: "play_circle",
      color: "#00B4D8",
      textIcon: "PH",
      website: "https://play.ht",
      notice: {
        apiKeyUrl: "https://play.ht/studio/api-access"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "tts"
    ],
    ttsConfig: {
      baseUrl: "https://api.play.ht/api/v2/tts/stream",
      authType: "apikey",
      authHeader: "playht",
      format: "playht",
      models: [
        {
          id: "PlayDialog",
          name: "PlayDialog"
        },
        {
          id: "Play3.0-mini",
          name: "Play 3.0 Mini"
        }
      ]
    }
  },
  {
    id: "qoder",
    priority: 30,
    alias: "qd",
    uiAlias: "qd",
    category: "oauth",
    display: {
      name: "Qoder",
      icon: "water_drop",
      color: "#EC4899",
      website: "https://qoder.com",
      notice: {
        signupUrl: "https://qoder.com"
      }
    },
    hasOAuth: true,
    authModes: [
      "oauth",
      "apikey"
    ],
    authHint: "Personal Access Token (pt-...) từ https://qoder.com/account/integrations",
    features: {
      usage: true,
      usageApikey: true
    },
    models: [
      {
        id: "ultimate",
        name: "Ultimate"
      },
      {
        id: "auto",
        name: "Auto"
      },
      {
        id: "performance",
        name: "Performance"
      },
      {
        id: "efficient",
        name: "Efficient"
      },
      {
        id: "lite",
        name: "Lite"
      },
      {
        id: "qmodel_38max",
        name: "Qwen3.8-Max"
      },
      {
        id: "qmodel_latest",
        name: "Qwen3.7-Max"
      },
      {
        id: "qmodel",
        name: "Qwen3.7-Plus"
      },
      {
        id: "qfmodel",
        name: "Qwen3.8-Flash"
      },
      {
        id: "kmodel_latest",
        name: "Kimi-K3"
      },
      {
        id: "kmodel",
        name: "Kimi-K2.7-Code"
      },
      {
        id: "gmodel",
        name: "GLM-5.3"
      },
      {
        id: "gfmodel",
        name: "GLM-5.3-Flash"
      },
      {
        id: "dmodel",
        name: "DeepSeek-V4-Pro"
      },
      {
        id: "dfmodel",
        name: "DeepSeek-V4-Flash"
      },
      {
        id: "mmodel",
        name: "MiniMax-M3"
      }
    ]
  },
  {
    id: "recraft",
    priority: 70,
    alias: "recraft",
    category: "apikey",
    display: {
      name: "Recraft",
      icon: "image",
      color: "#EC4899",
      textIcon: "RC",
      website: "https://recraft.ai",
      notice: {
        apiKeyUrl: "https://www.recraft.ai/profile/api"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "image"
    ],
    imageConfig: {
      baseUrl: "https://external.api.recraft.ai/v1/images/generations"
    },
    models: [
      {
        id: "recraftv3",
        name: "Recraft V3",
        params: [
          "n",
          "size",
          "style"
        ],
        kind: "image"
      },
      {
        id: "recraftv2",
        name: "Recraft V2",
        params: [
          "n",
          "size",
          "style"
        ],
        kind: "image"
      }
    ]
  },
  {
    id: "runwayml",
    priority: 80,
    alias: "runwayml",
    aliases: [
      "runway"
    ],
    uiAlias: "runway",
    category: "apikey",
    display: {
      name: "Runway ML",
      icon: "movie",
      color: "#000000",
      textIcon: "RW",
      website: "https://runwayml.com",
      notice: {
        apiKeyUrl: "https://dev.runwayml.com"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "image"
    ],
    imageConfig: {
      baseUrl: "https://api.dev.runwayml.com/v1"
    },
    models: [
      {
        id: "gen4_image",
        name: "Gen-4 Image",
        params: [
          "size"
        ],
        kind: "image"
      },
      {
        id: "gen4_image_turbo",
        name: "Gen-4 Image Turbo",
        params: [
          "size"
        ],
        kind: "image"
      },
      {
        id: "gen4_turbo",
        name: "Gen-4 Turbo",
        params: [],
        kind: "video"
      },
      {
        id: "gen3a_turbo",
        name: "Gen-3 Alpha Turbo",
        params: [],
        kind: "video"
      }
    ]
  },
  {
    id: "sdwebui",
    priority: 110,
    alias: "sdwebui",
    category: "apikey",
    display: {
      name: "SD WebUI",
      icon: "brush",
      color: "#FF7043",
      textIcon: "SD",
      website: "https://github.com/AUTOMATIC1111/stable-diffusion-webui"
    },
    serviceKinds: [
      "image"
    ],
    imageConfig: {
      baseUrl: "http://localhost:7860/sdapi/v1/txt2img"
    },
    models: [
      {
        id: "stable-diffusion-v1-5",
        name: "Stable Diffusion v1.5",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      },
      {
        id: "sdxl-base-1.0",
        name: "SDXL Base 1.0",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      }
    ]
  },
  {
    id: "searchapi",
    alias: "searchapi",
    category: "apikey",
    display: {
      name: "SearchAPI",
      icon: "search",
      color: "#0EA5A4",
      textIcon: "SA",
      website: "https://www.searchapi.io",
      notice: {
        apiKeyUrl: "https://www.searchapi.io/dashboard"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "webSearch"
    ],
    searchConfig: {
      baseUrl: "https://www.searchapi.io/api/v1/search",
      method: "GET",
      authType: "apikey",
      authHeader: "api_key",
      costPerQuery: 0.004,
      freeMonthlyQuota: 100,
      searchTypes: [
        "web",
        "news"
      ],
      defaultMaxResults: 5,
      maxMaxResults: 100,
      timeoutMs: 10000,
      cacheTTLMs: 300000
    }
  },
  {
    id: "searxng",
    alias: "searxng",
    category: "freeTier",
    display: {
      name: "SearXNG",
      icon: "saved_search",
      color: "#3B82F6",
      textIcon: "SX",
      website: "https://docs.searxng.org"
    },
    authType: "none",
    noAuth: true,
    serviceKinds: [
      "webSearch"
    ],
    searchConfig: {
      baseUrl: "http://localhost:8888/search",
      method: "GET",
      authType: "none",
      authHeader: "none",
      costPerQuery: 0,
      freeMonthlyQuota: 999999,
      searchTypes: [
        "web",
        "news"
      ],
      defaultMaxResults: 5,
      maxMaxResults: 50,
      timeoutMs: 10000,
      cacheTTLMs: 180000
    }
  },
  {
    id: "serper",
    alias: "serper",
    category: "apikey",
    display: {
      name: "Serper",
      icon: "search",
      color: "#4F46E5",
      textIcon: "SP",
      website: "https://serper.dev",
      notice: {
        apiKeyUrl: "https://serper.dev/api-key"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "webSearch"
    ],
    searchConfig: {
      baseUrl: "https://google.serper.dev",
      method: "POST",
      authType: "apikey",
      authHeader: "x-api-key",
      costPerQuery: 0.001,
      freeMonthlyQuota: 2500,
      searchTypes: [
        "web",
        "news"
      ],
      defaultMaxResults: 5,
      maxMaxResults: 100,
      timeoutMs: 10000,
      cacheTTLMs: 300000
    }
  },
  {
    id: "siliconflow",
    priority: 250,
    alias: "siliconflow",
    category: "apikey",
    display: {
      name: "SiliconFlow",
      icon: "cloud_queue",
      color: "#5B6EF5",
      textIcon: "SF",
      website: "https://cloud.siliconflow.com",
      notice: {
        apiKeyUrl: "https://cloud.siliconflow.com/account/ak"
      }
    },
    models: [
      {
        id: "deepseek-ai/DeepSeek-V4-Pro",
        name: "DeepSeek V4 Pro"
      },
      {
        id: "deepseek-ai/DeepSeek-V4-Flash",
        name: "DeepSeek V4 Flash"
      },
      {
        id: "deepseek-ai/DeepSeek-V3.2",
        name: "DeepSeek V3.2"
      },
      {
        id: "deepseek-ai/DeepSeek-V3.2-Exp",
        name: "DeepSeek V3.2 Exp"
      },
      {
        id: "deepseek-ai/DeepSeek-V3.1",
        name: "DeepSeek V3.1"
      },
      {
        id: "deepseek-ai/DeepSeek-V3.1-Terminus",
        name: "DeepSeek V3.1 Terminus"
      },
      {
        id: "deepseek-ai/DeepSeek-R1",
        name: "DeepSeek R1"
      },
      {
        id: "Qwen/Qwen3.5-397B-A17B",
        name: "Qwen 3.5 397B A17B"
      },
      {
        id: "Qwen/Qwen3.5-122B-A10B",
        name: "Qwen 3.5 122B A10B"
      },
      {
        id: "zai-org/GLM-5.1",
        name: "GLM 5.1"
      },
      {
        id: "zai-org/GLM-5",
        name: "GLM 5"
      },
      {
        id: "moonshotai/Kimi-K2.6",
        name: "Kimi K2.6"
      },
      {
        id: "moonshotai/Kimi-K2.5",
        name: "Kimi K2.5"
      },
      {
        id: "openai/gpt-oss-120b",
        name: "GPT OSS 120B"
      },
      {
        id: "MiniMaxAI/MiniMax-M2.5",
        name: "MiniMax M2.5"
      },
      {
        id: "inclusionAI/Ling-flash-2.0",
        name: "Ling Flash 2.0"
      }
    ]
  },
  {
    id: "stability-ai",
    priority: 60,
    alias: "stability-ai",
    aliases: [
      "stability"
    ],
    uiAlias: "stability",
    category: "apikey",
    display: {
      name: "Stability AI",
      icon: "image",
      color: "#8B5CF6",
      textIcon: "SA",
      website: "https://stability.ai",
      notice: {
        apiKeyUrl: "https://platform.stability.ai/account/keys"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "image"
    ],
    imageConfig: {
      baseUrl: "https://api.stability.ai/v2beta/stable-image/generate"
    },
    models: [
      {
        id: "stable-image-ultra",
        name: "Stable Image Ultra",
        params: [
          "size"
        ],
        kind: "image"
      },
      {
        id: "stable-image-core",
        name: "Stable Image Core",
        params: [
          "size",
          "style"
        ],
        kind: "image"
      },
      {
        id: "sd3.5-large",
        name: "Stable Diffusion 3.5 Large",
        params: [
          "size"
        ],
        kind: "image"
      },
      {
        id: "sd3.5-large-turbo",
        name: "Stable Diffusion 3.5 Large Turbo",
        params: [
          "size"
        ],
        kind: "image"
      },
      {
        id: "sd3.5-medium",
        name: "Stable Diffusion 3.5 Medium",
        params: [
          "size"
        ],
        kind: "image"
      }
    ]
  },
  {
    id: "tavily",
    alias: "tavily",
    category: "apikey",
    display: {
      name: "Tavily",
      icon: "search",
      color: "#5B21B6",
      textIcon: "TV",
      website: "https://tavily.com",
      notice: {
        apiKeyUrl: "https://app.tavily.com/home"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "webSearch",
      "webFetch"
    ],
    searchConfig: {
      baseUrl: "https://api.tavily.com/search",
      method: "POST",
      authType: "apikey",
      authHeader: "bearer",
      costPerQuery: 0.008,
      freeMonthlyQuota: 1000,
      searchTypes: [
        "web",
        "news"
      ],
      defaultMaxResults: 5,
      maxMaxResults: 20,
      timeoutMs: 10000,
      cacheTTLMs: 300000
    },
    fetchConfig: {
      baseUrl: "https://api.tavily.com/extract",
      method: "POST",
      authType: "apikey",
      authHeader: "bearer",
      costPerQuery: 0.008,
      freeMonthlyQuota: 1000,
      formats: [
        "markdown",
        "text"
      ],
      maxCharacters: 100000,
      timeoutMs: 15000
    }
  },
  {
    id: "together",
    priority: 60,
    alias: "together",
    category: "apikey",
    display: {
      name: "Together AI",
      icon: "group_work",
      color: "#0F6FFF",
      textIcon: "TG",
      website: "https://www.together.ai",
      notice: {
        apiKeyUrl: "https://api.together.xyz/settings/api-keys"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "llm",
      "embedding"
    ],
    embeddingConfig: {
      baseUrl: "https://api.together.xyz/v1/embeddings"
    },
    models: [
      {
        id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        name: "Llama 3.3 70B Turbo"
      },
      {
        id: "deepseek-ai/DeepSeek-R1",
        name: "DeepSeek R1"
      },
      {
        id: "Qwen/Qwen3-235B-A22B",
        name: "Qwen3 235B"
      },
      {
        id: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
        name: "Llama 4 Maverick"
      },
      {
        id: "BAAI/bge-large-en-v1.5",
        name: "BGE Large EN v1.5",
        kind: "embedding"
      },
      {
        id: "togethercomputer/m2-bert-80M-8k-retrieval",
        name: "M2 BERT 80M 8K",
        kind: "embedding"
      }
    ]
  },
  {
    id: "topaz",
    alias: "topaz",
    category: "apikey",
    display: {
      name: "Topaz",
      icon: "image",
      color: "#059669",
      textIcon: "TP",
      website: "https://topazlabs.com",
      notice: {
        apiKeyUrl: "https://topazlabs.com/account"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "image"
    ]
  },
  {
    id: "tortoise",
    alias: "tortoise",
    category: "freeTier",
    hidden: true,
    display: {
      name: "Tortoise TTS",
      icon: "record_voice_over",
      color: "#7C3AED",
      textIcon: "TT",
      website: "https://github.com/neonbjb/tortoise-tts"
    },
    authType: "none",
    noAuth: true,
    serviceKinds: [
      "tts"
    ],
    ttsConfig: {
      baseUrl: "http://localhost:5000/api/tts",
      authType: "none",
      authHeader: "none",
      format: "tortoise",
      models: [
        {
          id: "tortoise-v2",
          name: "Tortoise v2"
        }
      ]
    }
  },
  {
    id: "venice",
    priority: 115,
    alias: "venice",
    aliases: [
      "vn"
    ],
    uiAlias: "venice",
    category: "apikey",
    display: {
      name: "Venice AI",
      icon: "shield",
      color: "#DC2626",
      textIcon: "VE",
      website: "https://venice.ai",
      notice: {
        text: "OpenAI-compatible. Private inference + uncensored models (Venice Uncensored, GLM, Qwen, DeepSeek, Llama).",
        apiKeyUrl: "https://venice.ai/settings/api"
      }
    },
    passthroughModels: true,
    serviceKinds: [
      "llm",
      "embedding",
      "image"
    ],
    embeddingConfig: {
      baseUrl: "https://api.venice.ai/api/v1/embeddings",
      authType: "apikey",
      authHeader: "bearer"
    },
    imageConfig: {
      baseUrl: "https://api.venice.ai/api/v1/images/generations"
    },
    modelsFetcher: {
      url: "https://api.venice.ai/api/v1/models",
      type: "openai"
    },
    models: [
      {
        id: "venice-uncensored-1-2",
        name: "Venice Uncensored 1.2"
      },
      {
        id: "zai-org-glm-5",
        name: "GLM-5"
      },
      {
        id: "qwen3-235b-a22b-instruct-2507",
        name: "Qwen3 235B A22B Instruct"
      },
      {
        id: "qwen3-coder-480b-a35b-instruct-turbo",
        name: "Qwen3 Coder 480B A35B Turbo"
      },
      {
        id: "qwen3-vl-235b-a22b",
        name: "Qwen3 VL 235B A22B"
      },
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro"
      },
      {
        id: "llama-3.3-70b",
        name: "Llama 3.3 70B"
      },
      {
        id: "hermes-3-llama-3.1-405b",
        name: "Hermes 3 Llama 3.1 405B"
      },
      {
        id: "mistral-small-3-2-24b-instruct",
        name: "Mistral Small 3.2 24B"
      },
      {
        id: "text-embedding-3-large",
        name: "Text Embedding 3 Large",
        kind: "embedding"
      },
      {
        id: "text-embedding-bge-m3",
        name: "BGE-M3 Embedding",
        kind: "embedding"
      },
      {
        id: "text-embedding-qwen3-8b",
        name: "Qwen3 8B Embedding",
        kind: "embedding"
      },
      {
        id: "venice-sd35",
        name: "Venice SD3.5",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      },
      {
        id: "flux-2-pro",
        name: "FLUX.2 Pro",
        params: [
          "n",
          "size"
        ],
        kind: "image"
      },
      {
        id: "gpt-image-2",
        name: "GPT Image 2 (via Venice)",
        params: [
          "n",
          "size",
          "quality"
        ],
        kind: "image"
      }
    ]
  },
  {
    id: "vercel-ai-gateway",
    priority: 160,
    alias: "vercel-ai-gateway",
    aliases: [
      "vercel"
    ],
    uiAlias: "vercel",
    category: "apikey",
    display: {
      name: "Vercel AI Gateway",
      icon: "deployed_code",
      color: "#111827",
      textIcon: "VG",
      website: "https://vercel.com/ai-gateway",
      notice: {
        text: "Unified OpenAI-compatible endpoint from Vercel. Use your AI Gateway API key, then pick models with provider/model IDs like anthropic/claude-sonnet-4.6 or openai/gpt-5.4.",
        apiKeyUrl: "https://vercel.com/dashboard/~/ai-gateway"
      }
    },
    passthroughModels: true,
    features: {
      usage: true,
      usageApikey: true
    },
    serviceKinds: [
      "llm",
      "embedding",
      "image",
      "imageToText",
      "webSearch"
    ],
    embeddingConfig: {
      baseUrl: "https://ai-gateway.vercel.sh/v1/embeddings"
    },
    imageConfig: {
      baseUrl: "https://ai-gateway.vercel.sh/v1/images/generations"
    },
    searchViaChat: {
      defaultModel: "openai/gpt-4o-mini",
      pricingUrl: "https://vercel.com/docs/ai-gateway/pricing"
    },
    modelsFetcher: {
      url: "https://ai-gateway.vercel.sh/v1/models",
      type: "openai"
    }
  },
  {
    id: "vertex-partner",
    priority: 260,
    alias: "vertex-partner",
    aliases: [
      "vxp"
    ],
    uiAlias: "vxp",
    category: "apikey",
    display: {
      name: "Vertex Partner",
      icon: "cloud",
      color: "#34A853",
      textIcon: "VP",
      website: "https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-partner-models",
      notice: {
        apiKeyUrl: "https://console.cloud.google.com/iam-admin/serviceaccounts"
      }
    },
    models: [
      {
        id: "deepseek-ai/deepseek-v3.2-maas",
        name: "DeepSeek V3.2 (Vertex)"
      },
      {
        id: "qwen/qwen3-next-80b-a3b-thinking-maas",
        name: "Qwen3 Next 80B Thinking (Vertex)"
      },
      {
        id: "qwen/qwen3-next-80b-a3b-instruct-maas",
        name: "Qwen3 Next 80B Instruct (Vertex)"
      },
      {
        id: "zai-org/glm-5-maas",
        name: "GLM-5 (Vertex)"
      }
    ]
  },
  {
    id: "vertex",
    priority: 40,
    alias: "vertex",
    aliases: [
      "vx"
    ],
    uiAlias: "vx",
    category: "freeTier",
    display: {
      name: "Vertex AI",
      icon: "cloud",
      color: "#4285F4",
      textIcon: "VX",
      website: "https://cloud.google.com/vertex-ai",
      notice: {
        text: "New Google Cloud accounts get $300 free credits. Requires GCP project + Service Account with Vertex AI API enabled.",
        apiKeyUrl: "https://console.cloud.google.com/iam-admin/serviceaccounts"
      }
    },
    serviceKinds: [
      "llm",
      "imageToText",
      "video"
    ],
    videoConfig: {
      baseUrl: "https://aiplatform.googleapis.com"
    },
    models: [
      {
        id: "gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro Preview"
      },
      {
        id: "gemini-3.1-flash-lite-preview",
        name: "Gemini 3.1 Flash Lite Preview"
      },
      {
        id: "gemini-3-flash-preview",
        name: "Gemini 3 Flash Preview"
      },
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash"
      },
      {
        id: "veo-3.1-generate-preview",
        name: "Veo 3.1 (Preview)",
        params: [
          "duration",
          "aspect_ratio",
          "resolution",
          "negative_prompt",
          "seed",
          "storage_uri",
          "generate_audio"
        ],
        kind: "video"
      },
      {
        id: "veo-3.1-fast-generate-preview",
        name: "Veo 3.1 Fast (Preview)",
        params: [
          "duration",
          "aspect_ratio",
          "resolution",
          "negative_prompt",
          "seed",
          "storage_uri",
          "generate_audio"
        ],
        kind: "video"
      },
      {
        id: "veo-3.0-generate-001",
        name: "Veo 3",
        params: [
          "duration",
          "aspect_ratio",
          "resolution",
          "negative_prompt",
          "seed",
          "storage_uri",
          "generate_audio"
        ],
        kind: "video"
      },
      {
        id: "veo-2.0-generate-001",
        name: "Veo 2",
        params: [
          "duration",
          "aspect_ratio",
          "negative_prompt",
          "seed",
          "storage_uri"
        ],
        kind: "video"
      }
    ]
  },
  {
    id: "volcengine-ark",
    priority: 270,
    alias: "volcengine-ark",
    aliases: [
      "ark"
    ],
    uiAlias: "ark",
    category: "apikey",
    display: {
      name: "Volcengine Ark",
      icon: "cloud",
      color: "#1677FF",
      textIcon: "ARK",
      website: "https://ark.cn-beijing.volces.com",
      notice: {
        apiKeyUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey"
      }
    },
    models: [
      {
        id: "Doubao-Seed-2.0-Code",
        name: "Doubao-Seed-2.0-Code"
      },
      {
        id: "Doubao-Seed-2.0-pro",
        name: "Doubao-Seed-2.0-pro"
      },
      {
        id: "Doubao-Seed-2.0-lite",
        name: "Doubao-Seed-2.0-lite"
      },
      {
        id: "Doubao-Seed-Code",
        name: "Doubao-Seed-Code"
      },
      {
        id: "DeepSeek-V4-Flash",
        name: "DeepSeek-V4-Flash"
      },
      {
        id: "DeepSeek-V4-Pro",
        name: "DeepSeek-V4-Pro"
      },
      {
        id: "GLM-5.1",
        name: "GLM-5.1"
      },
      {
        id: "MiniMax-M2.7",
        name: "MiniMax-M2.7"
      },
      {
        id: "Kimi-K2.6",
        name: "Kimi-K2.6"
      }
    ]
  },
  {
    id: "voyage-ai",
    priority: 40,
    alias: "voyage-ai",
    uiAlias: "voyage",
    category: "apikey",
    display: {
      name: "Voyage AI",
      icon: "data_array",
      color: "#0EA5E9",
      textIcon: "VG",
      website: "https://www.voyageai.com",
      notice: {
        apiKeyUrl: "https://dash.voyageai.com/api-keys"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "embedding"
    ],
    embeddingConfig: {
      baseUrl: "https://api.voyageai.com/v1/embeddings"
    },
    models: [
      {
        id: "voyage-3-large",
        name: "Voyage 3 Large",
        kind: "embedding"
      },
      {
        id: "voyage-3.5",
        name: "Voyage 3.5",
        kind: "embedding"
      },
      {
        id: "voyage-3.5-lite",
        name: "Voyage 3.5 Lite",
        kind: "embedding"
      },
      {
        id: "voyage-code-3",
        name: "Voyage Code 3",
        kind: "embedding"
      },
      {
        id: "voyage-finance-2",
        name: "Voyage Finance 2",
        kind: "embedding"
      },
      {
        id: "voyage-law-2",
        name: "Voyage Law 2",
        kind: "embedding"
      },
      {
        id: "voyage-multilingual-2",
        name: "Voyage Multilingual 2",
        kind: "embedding"
      }
    ]
  },
  {
    id: "xai",
    priority: 280,
    alias: "xai",
    category: "oauth",
    display: {
      name: "xAI (Grok)",
      icon: "auto_awesome",
      color: "#1DA1F2",
      textIcon: "XA",
      website: "https://x.ai",
      notice: {
        apiKeyUrl: "https://console.x.ai"
      }
    },
    hasOAuth: true,
    authModes: [
      "oauth",
      "apikey"
    ],
    serviceKinds: [
      "llm",
      "imageToText",
      "webSearch",
      "image",
      "video"
    ],
    imageConfig: {
      baseUrl: "https://api.x.ai/v1/images/generations",
      bodyFields: [
        "model",
        "prompt",
        "n",
        "response_format"
      ]
    },
    videoConfig: {
      baseUrl: "https://api.x.ai/v1/videos"
    },
    searchViaChat: {
      defaultModel: "grok-4.20-reasoning",
      endpoint: "https://api.x.ai/v1/responses",
      pricingUrl: "https://x.ai/api#pricing"
    },
    models: [
      {
        id: "grok-4.6",
        name: "Grok 4.6"
      },
      {
        id: "grok-4.5",
        name: "Grok 4.5"
      },
      {
        id: "grok-4",
        name: "Grok 4"
      },
      {
        id: "grok-4-fast-reasoning",
        name: "Grok 4 Fast Reasoning"
      },
      {
        id: "grok-code-fast-1",
        name: "Grok Code Fast"
      },
      {
        id: "grok-3",
        name: "Grok 3"
      },
      {
        id: "grok-2-image-1212",
        name: "Grok 2 Image",
        params: [
          "n",
          "response_format"
        ],
        kind: "image"
      },
      {
        id: "grok-imagine-video",
        name: "Grok Imagine Video",
        params: [
          "duration",
          "aspect_ratio",
          "resolution"
        ],
        kind: "video"
      }
    ]
  },
  {
    id: "xiaomi-mimo",
    priority: 290,
    alias: "xiaomi-mimo",
    aliases: [
      "mimo",
      "mimo-desktop",
      "xmd"
    ],
    uiAlias: "mimo",
    category: "oauth",
    display: {
      name: "Xiaomi MiMo",
      icon: "smart_toy",
      color: "#FF6900",
      textIcon: "XM",
      website: "https://xiaomimimo.com",
      notice: {
        apiKeyUrl: "https://platform.xiaomimimo.com/console/api-keys",
        signupUrl: "https://mimo.xiaomimimo.com/desktop/invite/"
      }
    },
    hasOAuth: true,
    authModes: [
      "oauth",
      "apikey"
    ],
    features: {
      usage: true,
      usageApikey: true
    },
    serviceKinds: [
      "llm",
      "tts"
    ],
    ttsConfig: {
      baseUrl: "https://api.xiaomimimo.com/v1/chat/completions",
      authType: "apikey",
      authHeader: "bearer",
      format: "xiaomi-mimo-tts"
    },
    models: [
      {
        id: "mimo-x-pro-preview",
        name: "MiMo-X-Pro-Preview",
        upstreamModelId: "xiaomi/mimo-x-pro-preview",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "mimo-x-flash-preview",
        name: "MiMo-X-Flash-Preview",
        upstreamModelId: "xiaomi/mimo-x-flash-preview",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "mimo-v2.5-pro",
        name: "MiMo V2.5 Pro"
      },
      {
        id: "mimo-v2.5",
        name: "MiMo V2.5"
      },
      {
        id: "mimo-v2-omni",
        name: "MiMo V2 Omni"
      },
      {
        id: "mimo-v2-flash",
        name: "MiMo V2 Flash"
      },
      {
        id: "mimo-v2.5-tts",
        name: "MiMo V2.5 TTS",
        kind: "tts"
      }
    ]
  },
  {
    id: "xiaomi-tokenplan",
    priority: 300,
    alias: "xiaomi-tokenplan",
    aliases: [
      "xmtp"
    ],
    uiAlias: "xmtp",
    category: "apikey",
    display: {
      name: "Xiaomi MiMo (Token Plan)",
      icon: "smart_toy",
      color: "#FF6700",
      textIcon: "XT",
      website: "https://mimo.xiaomi.com",
      notice: {
        text: "Xiaomi MiMo Token Plan subscription (API key starts with tp-). Token Plan keys are cluster-specific — select the region matching your subscription.",
        apiKeyUrl: "https://mimo.xiaomi.com"
      }
    },
    hasProviderSpecificData: true,
    regions: [
      {
        id: "sgp",
        label: "Singapore (新加坡)"
      },
      {
        id: "cn",
        label: "China (中国大陆)"
      },
      {
        id: "ams",
        label: "Amsterdam (阿姆斯特丹)"
      }
    ],
    defaultRegion: "sgp",
    models: [
      {
        id: "mimo-v2.5-pro",
        name: "MiMo V2.5 Pro"
      },
      {
        id: "mimo-v2.5-pro-claude",
        name: "MiMo V2.5 Pro (Claude Native)",
        targetFormat: "claude",
        upstreamModelId: "mimo-v2.5-pro"
      },
      {
        id: "mimo-v2.5",
        name: "MiMo V2.5"
      },
      {
        id: "mimo-v2-pro",
        name: "MiMo V2 Pro"
      },
      {
        id: "mimo-v2-omni",
        name: "MiMo V2 Omni"
      },
      {
        id: "mimo-v2-tts",
        name: "MiMo V2 TTS"
      },
      {
        id: "mimo-v2.5-tts",
        name: "MiMo V2.5 TTS"
      },
      {
        id: "mimo-v2.5-tts-voiceclone",
        name: "MiMo V2.5 TTS Voice Clone"
      },
      {
        id: "mimo-v2.5-tts-voicedesign",
        name: "MiMo V2.5 TTS Voice Design"
      }
    ]
  },
  {
    id: "youcom",
    alias: "youcom",
    category: "apikey",
    display: {
      name: "You.com Search",
      icon: "search",
      color: "#7C3AED",
      textIcon: "YC",
      website: "https://you.com",
      notice: {
        apiKeyUrl: "https://api.you.com"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "webSearch"
    ],
    searchConfig: {
      baseUrl: "https://ydc-index.io/v1/search",
      method: "GET",
      authType: "apikey",
      authHeader: "x-api-key",
      costPerQuery: 0.005,
      freeMonthlyQuota: 0,
      searchTypes: [
        "web",
        "news"
      ],
      defaultMaxResults: 5,
      maxMaxResults: 100,
      timeoutMs: 10000,
      cacheTTLMs: 300000
    }
  },
  {
    id: "alims-intl",
    priority: 11,
    alias: "alims-intl",
    category: "apikey",
    display: {
      name: "Alibaba Studio",
      icon: "cloud",
      color: "#FF6A00",
      textIcon: "ALi",
      website: "https://modelstudio.console.alibabacloud.com",
      notice: {
        apiKeyUrl: "https://modelstudio.console.alibabacloud.com/?apiKey=1"
      }
    },
    models: [
      {
        id: "qwen3.5-plus",
        name: "Qwen3.5 Plus"
      },
      {
        id: "kimi-k2.5",
        name: "Kimi K2.5"
      },
      {
        id: "glm-5",
        name: "GLM 5"
      },
      {
        id: "MiniMax-M2.5",
        name: "MiniMax M2.5"
      },
      {
        id: "qwen3-coder-next",
        name: "Qwen3 Coder Next"
      },
      {
        id: "qwen3-coder-plus",
        name: "Qwen3 Coder Plus"
      },
      {
        id: "glm-4.7",
        name: "GLM 4.7"
      }
    ]
  },
  {
    id: "codebuddy-intl",
    priority: 90,
    alias: "cbai",
    uiAlias: "cbai",
    category: "oauth",
    hidden: false,
    display: {
      name: "CodeBuddy",
      icon: "smart_toy",
      color: "#006EFF",
      website: "https://www.codebuddy.ai",
      notice: {
        signupUrl: "https://www.codebuddy.ai"
      }
    },
    hasOAuth: true,
    authModes: [
      "oauth",
      "apikey"
    ],
    features: {
      usage: true,
      usageApikey: true
    },
    models: [
      {
        id: "hy3",
        name: "Hy3"
      },
      {
        id: "hy3-x",
        name: "Hy3 X"
      },
      {
        id: "hy4-preview",
        name: "Hy4 Preview"
      },
      {
        id: "deepseek-v4.1-flash",
        name: "DeepSeek-V4.1-Flash"
      },
      {
        id: "glm-5.3",
        name: "GLM-5.3"
      },
      {
        id: "glm-5.3-flash",
        name: "GLM-5.3-Flash"
      },
      {
        id: "glm-5.2",
        name: "GLM-5.2"
      },
      {
        id: "glm-5.1",
        name: "GLM-5.1"
      },
      {
        id: "glm-5.0",
        name: "GLM-5.0"
      },
      {
        id: "glm-5.0-turbo",
        name: "GLM-5.0-Turbo"
      },
      {
        id: "glm-5v-turbo",
        name: "GLM-5v-Turbo"
      },
      {
        id: "glm-4.7",
        name: "GLM-4.7"
      },
      {
        id: "minimax-m3",
        name: "MiniMax-M3"
      },
      {
        id: "minimax-m2.7",
        name: "MiniMax-M2.7"
      },
      {
        id: "kimi-k3-1",
        name: "Kimi-K3"
      },
      {
        id: "kimi-k3",
        name: "Kimi-K3"
      },
      {
        id: "kimi-k2.8-preview",
        name: "Kimi-K2.8-Preview"
      },
      {
        id: "kimi-k2.7",
        name: "Kimi-K2.7-Code"
      },
      {
        id: "kimi-k2.6",
        name: "Kimi-K2.6"
      },
      {
        id: "kimi-k2.5",
        name: "Kimi-K2.5"
      },
      {
        id: "hy3-preview",
        name: "Hy3 Preview"
      },
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek-V4-Pro"
      },
      {
        id: "deepseek-v4.1-flash",
        name: "DeepSeek-V4.1-Flash"
      },
      {
        id: "deepseek-v3-2-volc",
        name: "DeepSeek-V3.2"
      },
      {
        id: "gpt-5.6-luna",
        name: "GPT-5.6-Luna"
      },
      {
        id: "claude-opus-5",
        name: "Claude Opus 5"
      },
      {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6"
      }
    ]
  },
  {
    id: "trae",
    alias: "tr",
    aliases: [
      "marscode"
    ],
    uiAlias: "tr",
    category: "oauth",
    display: {
      name: "Trae",
      icon: "bolt",
      color: "#FF6A00",
      textIcon: "TR",
      website: "https://www.trae.ai",
      notice: {
        signupUrl: "https://www.trae.ai"
      }
    },
    authType: "oauth",
    hasOAuth: true,
    authModes: [
      "oauth"
    ],
    features: {
      usage: true
    },
    models: [
      {
        id: "auto",
        name: "Auto (Server Picks)"
      },
      {
        id: "work",
        name: "Work (Fast)"
      },
      {
        id: "gemini-3.1-pro",
        name: "Gemini 3.1 Pro"
      },
      {
        id: "gemini-3-flash-solo",
        name: "Gemini 3 Flash"
      },
      {
        id: "minimax-m3",
        name: "MiniMax M3"
      },
      {
        id: "minimax-m2.7",
        name: "MiniMax M2.7"
      },
      {
        id: "kimi-k2.5",
        name: "Kimi K2.5"
      },
      {
        id: "gpt-5.4",
        name: "GPT 5.4"
      },
      {
        id: "gpt-5.2",
        name: "GPT 5.2"
      }
    ]
  },
  {
    id: "zed",
    priority: 999,
    alias: "zd",
    uiAlias: "zd",
    category: "oauth",
    display: {
      name: "Zed",
      icon: "code",
      color: "#A855F7",
      website: "https://zed.dev",
      notice: {
        signupUrl: "https://zed.dev/native_app_signin"
      }
    },
    authType: "oauth",
    hasOAuth: true,
    passthroughModels: true,
    features: {
      usage: true
    },
    models: []
  },
  {
    id: "api-airforce",
    alias: "af",
    aliases: [
      "airforce"
    ],
    uiAlias: "af",
    category: "freeTier",
    display: {
      name: "API.airforce",
      icon: "flight",
      color: "#0EA5E9",
      textIcon: "AF",
      website: "https://api.airforce",
      notice: {
        apiKeyUrl: "https://api.airforce"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    passthroughModels: true,
    modelsFetcher: {
      url: "https://api.airforce/v1/models",
      type: "airforce-free"
    },
    models: [
      {
        id: "gpt-oss-120b",
        name: "GPT-OSS 120B (Free)",
        contextLength: 131072
      },
      {
        id: "gpt-oss-20b",
        name: "GPT-OSS 20B (Free)",
        contextLength: 131072
      },
      {
        id: "kimi-k2.7-code",
        name: "Kimi K2.7 Code (Free)",
        contextLength: 262144
      }
    ]
  },
  {
    id: "baidu",
    alias: "qianfan",
    aliases: [
      "qianfan",
      "ernie",
      "baidu-qianfan"
    ],
    uiAlias: "qianfan",
    category: "apikey",
    display: {
      name: "Baidu Qianfan",
      icon: "search",
      color: "#2932E1",
      textIcon: "BD",
      website: "https://cloud.baidu.com/product/qianfan.html",
      notice: {
        apiKeyUrl: "https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    models: [
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        contextLength: 1048576
      },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        contextLength: 1048576
      },
      {
        id: "glm-5.2",
        name: "GLM 5.2",
        contextLength: 512000
      },
      {
        id: "glm-5.1",
        name: "GLM 5.1",
        contextLength: 198000
      },
      {
        id: "kimi-k2.6",
        name: "Kimi K2.6",
        contextLength: 262144
      },
      {
        id: "qwen3.5-397b-a17b",
        name: "Qwen 3.5 397B A17B",
        contextLength: 262144
      },
      {
        id: "qwen3.5-27b",
        name: "Qwen 3.5 27B",
        contextLength: 262144
      }
    ]
  },
  {
    id: "bazaarlink",
    alias: "bzl",
    aliases: [
      "bazaar-link"
    ],
    uiAlias: "bzl",
    category: "freeTier",
    display: {
      name: "Bazaarlink",
      icon: "storefront",
      color: "#DC2626",
      textIcon: "BZ",
      website: "https://bazaarlink.ai",
      notice: {
        apiKeyUrl: "https://bazaarlink.ai"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    models: [
      {
        id: "auto:free",
        name: "Auto Free (Zero Cost)"
      },
      {
        id: "claude-opus-4.7",
        name: "Claude Opus 4.7",
        contextLength: 1000000
      },
      {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        contextLength: 1000000
      },
      {
        id: "claude-haiku-4.5",
        name: "Claude Haiku 4.5",
        contextLength: 200000
      },
      {
        id: "gpt-5.5",
        name: "GPT-5.5",
        contextLength: 1050000
      },
      {
        id: "gpt-5.4",
        name: "GPT-5.4",
        contextLength: 1050000
      },
      {
        id: "gpt-5.4-mini",
        name: "GPT-5.4 Mini",
        contextLength: 400000
      },
      {
        id: "gpt-5.4-nano",
        name: "GPT-5.4 Nano",
        contextLength: 400000
      },
      {
        id: "grok-4.3",
        name: "Grok 4.3",
        contextLength: 1000000
      },
      {
        id: "grok-4.20",
        name: "Grok 4.20",
        contextLength: 2000000
      },
      {
        id: "gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro",
        contextLength: 1048576
      },
      {
        id: "gemini-3-flash-preview",
        name: "Gemini 3 Flash",
        contextLength: 1048576
      },
      {
        id: "gemini-3.1-flash-lite-preview",
        name: "Gemini 3.1 Flash Lite",
        contextLength: 1048576
      },
      {
        id: "kimi-k2.6",
        name: "Kimi K2.6",
        contextLength: 262144
      },
      {
        id: "kimi-k2.5",
        name: "Kimi K2.5",
        contextLength: 262144
      },
      {
        id: "glm-5.1",
        name: "GLM 5.1",
        contextLength: 204800
      },
      {
        id: "glm-5",
        name: "GLM 5",
        contextLength: 204800
      },
      {
        id: "mimo-v2.5-pro",
        name: "MiMo-V2.5-Pro",
        contextLength: 1050000
      },
      {
        id: "mimo-v2.5",
        name: "MiMo-V2.5",
        contextLength: 1050000
      },
      {
        id: "minimax-m3",
        name: "MiniMax M3",
        contextLength: 1048576
      },
      {
        id: "minimax-m2.7",
        name: "MiniMax M2.7",
        contextLength: 204800
      },
      {
        id: "minimax-m2.5",
        name: "MiniMax M2.5",
        contextLength: 204800
      },
      {
        id: "qwen3.6-plus",
        name: "Qwen 3.6 Plus",
        contextLength: 1000000
      },
      {
        id: "nemotron-3-super-120b-a12b",
        name: "Nemotron 3 Super",
        contextLength: 1000000
      }
    ]
  },
  {
    id: "bluesminds",
    alias: "bm",
    aliases: [
      "blue-sminds"
    ],
    uiAlias: "bm",
    category: "apikey",
    hidden: true,
    display: {
      name: "BluesMinds",
      icon: "psychology",
      color: "#2563EB",
      textIcon: "BM",
      website: "https://bluesminds.com",
      notice: {
        apiKeyUrl: "https://bluesminds.com"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    models: [
      {
        id: "gpt-4.1",
        name: "GPT-4.1",
        contextLength: 1048576
      },
      {
        id: "gpt-4.1-mini",
        name: "GPT-4.1 Mini",
        contextLength: 1048576
      },
      {
        id: "gpt-4.1-nano",
        name: "GPT-4.1 Nano",
        contextLength: 1048576
      },
      {
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5",
        contextLength: 200000
      },
      {
        id: "claude-haiku-4-5",
        name: "Claude Haiku 4.5",
        contextLength: 200000
      },
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        contextLength: 1048576
      },
      {
        id: "gemini-2.0-flash-exp",
        name: "Gemini 2.0 Flash (Exp)",
        contextLength: 1048576
      },
      {
        id: "qwen-turbo",
        name: "Qwen Turbo",
        contextLength: 1000000
      },
      {
        id: "kimi-k2",
        name: "Kimi K2",
        contextLength: 262144
      },
      {
        id: "kimi-k2-thinking",
        name: "Kimi K2 Thinking",
        contextLength: 262144
      },
      {
        id: "glm-4.7",
        name: "GLM 4.7",
        contextLength: 204800
      },
      {
        id: "minimax-m2.5",
        name: "MiniMax M2.5",
        contextLength: 204800
      },
      {
        id: "claude-opus-4-5",
        name: "Claude Opus 4.5 (VIP)",
        contextLength: 200000
      },
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro (VIP)",
        contextLength: 1048576
      }
    ]
  },
  {
    id: "kilo-gateway",
    alias: "kgw",
    aliases: [
      "kilo-gateway",
      "kilogateway"
    ],
    uiAlias: "kgw",
    category: "freeTier",
    display: {
      name: "Kilo Gateway",
      icon: "login",
      color: "#8B5CF6",
      textIcon: "KG",
      website: "https://kilo.ai",
      notice: {
        apiKeyUrl: "https://kilo.ai/dashboard?tab=apiKeys"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    models: [
      {
        id: "kilo-auto/free",
        name: "Kilo Auto Free",
        contextLength: 256000
      },
      {
        id: "nvidia/nemotron-3-super-120b-a12b:free",
        name: "Nemotron 3 Super 120B (Free)",
        contextLength: 262144
      },
      {
        id: "nvidia/nemotron-3-ultra-550b-a55b:free",
        name: "Nemotron 3 Ultra 550B (Free)",
        contextLength: 1000000
      },
      {
        id: "kwaipilot/kat-coder-pro-v2.5:free",
        name: "Kat Coder Pro v2.5 (Free)",
        contextLength: 256000
      },
      {
        id: "kilo-auto/frontier",
        name: "Kilo Auto Frontier",
        contextLength: 1000000
      },
      {
        id: "kilo-auto/balanced",
        name: "Kilo Auto Balanced",
        contextLength: 1000000
      }
    ]
  },
  {
    id: "llm7",
    alias: "llm7",
    aliases: [
      "llm-7"
    ],
    uiAlias: "llm7",
    category: "apikey",
    display: {
      name: "LLM7",
      icon: "pool",
      color: "#7C3AED",
      textIcon: "L7",
      website: "https://llm7.io",
      notice: {
        apiKeyUrl: "https://llm7.io"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    passthroughModels: true,
    models: [
      {
        id: "GLM-5.3-Flash",
        name: "GLM 5.3 Flash",
        contextLength: 131072,
        reasoning: true
      },
      {
        id: "codestral-latest",
        name: "Codestral (Mistral)",
        contextLength: 256000,
        reasoning: true
      },
      {
        id: "mistral-Nemo-Instruct-2407",
        name: "Mistral Nemo 12B",
        contextLength: 128000
      },
      {
        id: "gpt-5.5",
        name: "GPT-5.5 (LLM7)",
        contextLength: 1050000
      },
      {
        id: "claude-opus-5",
        name: "Claude Opus 5 (LLM7)",
        contextLength: 1000000
      },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash (LLM7)",
        contextLength: 1000000
      },
      {
        id: "grok-4.5",
        name: "Grok 4.5 (LLM7)",
        contextLength: 500000
      },
      {
        id: "kimi-k3",
        name: "Kimi K3 (LLM7)",
        contextLength: 1000000
      }
    ]
  },
  {
    id: "sambanova",
    alias: "samba",
    aliases: [
      "sambanova-ai"
    ],
    uiAlias: "samba",
    category: "apikey",
    hidden: true,
    display: {
      name: "SambaNova",
      icon: "memory",
      color: "#F97316",
      textIcon: "SN",
      website: "https://sambanova.ai",
      notice: {
        apiKeyUrl: "https://cloud.sambanova.ai/apis"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    models: [
      {
        id: "MiniMax-M2.7",
        name: "MiniMax M2.7",
        contextLength: 196608
      }
    ]
  },
  {
    id: "tencent",
    alias: "hunyuan",
    aliases: [
      "hunyuan",
      "tencent-hunyuan"
    ],
    uiAlias: "hunyuan",
    category: "apikey",
    display: {
      name: "Tencent Hunyuan",
      icon: "cloud",
      color: "#0052D9",
      textIcon: "HY",
      website: "https://cloud.tencent.com/product/hunyuan",
      notice: {
        apiKeyUrl: "https://console.cloud.tencent.com/hunyuan/api-key"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    models: [
      {
        id: "hunyuan-turbos-latest",
        name: "Hunyuan TurboS Latest",
        contextLength: 200000
      },
      {
        id: "hunyuan-t1-latest",
        name: "Hunyuan T1 Latest",
        contextLength: 256000
      }
    ]
  },
  {
    id: "morphllm",
    alias: "morphllm",
    aliases: [
      "mrp",
      "morph"
    ],
    uiAlias: "mrp",
    category: "apikey",
    display: {
      name: "MorphLLM",
      icon: "change_history",
      color: "#14B8A6",
      textIcon: "MP",
      website: "https://morphllm.com",
      notice: {
        apiKeyUrl: "https://morphllm.com"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    models: [
      {
        id: "morph-dsv41flash",
        name: "DeepSeek V4.1 Flash",
        contextLength: 1048576,
        vision: true,
        reasoning: true
      },
      {
        id: "morph-kimik3",
        name: "Kimi K3 2.8T",
        contextLength: 1048576,
        vision: true,
        reasoning: true
      },
      {
        id: "morph-kimik3-fast",
        name: "Kimi K3 Fast",
        contextLength: 1048576,
        vision: true,
        reasoning: true
      },
      {
        id: "morph-glm53-744b",
        name: "GLM-5.3 744B",
        contextLength: 1048576,
        reasoning: true
      },
      {
        id: "morph-glm53flash",
        name: "GLM-5.3-Flash",
        contextLength: 1048576,
        vision: true,
        reasoning: true
      },
      {
        id: "morph-dsv4flash",
        name: "DeepSeek V4 Flash",
        contextLength: 1048576,
        reasoning: true
      }
    ]
  },
  {
    id: "devin-cli",
    alias: "dv",
    aliases: [
      "devin"
    ],
    uiAlias: "dv",
    category: "free",
    display: {
      name: "Devin CLI",
      icon: "smart_toy",
      color: "#6366F1",
      textIcon: "DV",
      website: "https://devin.ai",
      notice: {
        signupUrl: "https://cli.devin.ai",
        text: "Install: `curl -fsSL https://cli.devin.ai/install.sh | bash` (macOS: `brew install --cask devin-cli`, Windows PowerShell: `irm https://static.devin.ai/cli/setup.ps1 | iex`). Then run `devin auth login`. No API key needed."
      }
    },
    authType: "none",
    authModes: [
      "none"
    ],
    noAuth: true,
    models: [
      {
        id: "swe-1.6-fast",
        name: "SWE-1.6 Fast"
      },
      {
        id: "swe-1.6",
        name: "SWE-1.6"
      },
      {
        id: "swe-1.5-fast",
        name: "SWE-1.5 Fast"
      },
      {
        id: "swe-1.5",
        name: "SWE-1.5"
      },
      {
        id: "claude-opus-4.7-max",
        name: "Claude Opus 4.7 Max",
        contextLength: 200000
      },
      {
        id: "claude-opus-4.7-high",
        name: "Claude Opus 4.7 High",
        contextLength: 200000
      },
      {
        id: "claude-opus-4.7-medium",
        name: "Claude Opus 4.7 Medium",
        contextLength: 200000
      },
      {
        id: "claude-opus-4.7-low",
        name: "Claude Opus 4.7 Low",
        contextLength: 200000
      },
      {
        id: "claude-sonnet-4.6-thinking-1m",
        name: "Claude Sonnet 4.6 Thinking 1M",
        contextLength: 1000000
      },
      {
        id: "claude-sonnet-4.6-thinking",
        name: "Claude Sonnet 4.6 Thinking",
        contextLength: 200000
      },
      {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        contextLength: 200000
      },
      {
        id: "claude-opus-4.6-thinking",
        name: "Claude Opus 4.6 Thinking",
        contextLength: 200000
      },
      {
        id: "claude-opus-4.6",
        name: "Claude Opus 4.6",
        contextLength: 200000
      },
      {
        id: "claude-sonnet-4.5",
        name: "Claude Sonnet 4.5",
        contextLength: 200000
      },
      {
        id: "claude-haiku-4.5",
        name: "Claude Haiku 4.5",
        contextLength: 200000
      },
      {
        id: "gpt-5.5-xhigh",
        name: "GPT-5.5 XHigh",
        contextLength: 200000
      },
      {
        id: "gpt-5.5-high",
        name: "GPT-5.5 High",
        contextLength: 200000
      },
      {
        id: "gpt-5.5-medium",
        name: "GPT-5.5 Medium",
        contextLength: 200000
      },
      {
        id: "gpt-5.5-low",
        name: "GPT-5.5 Low",
        contextLength: 200000
      },
      {
        id: "gpt-5.4-high",
        name: "GPT-5.4 High",
        contextLength: 200000
      },
      {
        id: "gpt-5.4-medium",
        name: "GPT-5.4 Medium",
        contextLength: 200000
      },
      {
        id: "gpt-5.4-low",
        name: "GPT-5.4 Low",
        contextLength: 200000
      },
      {
        id: "gpt-5.3-codex-high",
        name: "GPT-5.3 Codex High",
        contextLength: 200000
      },
      {
        id: "gpt-5.3-codex-medium",
        name: "GPT-5.3 Codex Medium",
        contextLength: 200000
      },
      {
        id: "gpt-5.3-codex-low",
        name: "GPT-5.3 Codex Low",
        contextLength: 200000
      },
      {
        id: "gpt-5.2-high",
        name: "GPT-5.2 High",
        contextLength: 200000
      },
      {
        id: "gpt-5.2-medium",
        name: "GPT-5.2 Medium",
        contextLength: 200000
      },
      {
        id: "gpt-5.2-low",
        name: "GPT-5.2 Low",
        contextLength: 200000
      },
      {
        id: "gemini-3.1-pro-high",
        name: "Gemini 3.1 Pro High",
        contextLength: 1000000
      },
      {
        id: "gemini-3.1-pro-low",
        name: "Gemini 3.1 Pro Low",
        contextLength: 1000000
      },
      {
        id: "gemini-3.0-flash-high",
        name: "Gemini 3 Flash High",
        contextLength: 1000000
      },
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        contextLength: 1000000
      },
      {
        id: "deepseek-v4",
        name: "DeepSeek V4",
        contextLength: 1048576
      },
      {
        id: "kimi-k2.6",
        name: "Kimi K2.6",
        contextLength: 262144
      },
      {
        id: "glm-5.1",
        name: "GLM-5.1",
        contextLength: 204800
      }
    ]
  },
  {
    id: "windsurf",
    alias: "ws",
    uiAlias: "ws",
    category: "oauth",
    display: {
      name: "Windsurf",
      icon: "surfing",
      color: "#14B8A6",
      website: "https://windsurf.com",
      notice: {
        signupUrl: "https://windsurf.com"
      }
    },
    authType: "oauth",
    hasOAuth: true,
    authModes: [
      "oauth",
      "apikey"
    ],
    models: [
      {
        id: "swe-1.6-fast",
        name: "SWE-1.6 Fast"
      },
      {
        id: "swe-1.6",
        name: "SWE-1.6"
      },
      {
        id: "swe-1.5-fast",
        name: "SWE-1.5 Fast"
      },
      {
        id: "swe-1.5",
        name: "SWE-1.5"
      },
      {
        id: "claude-opus-4.7-max",
        name: "Claude Opus 4.7 Max"
      },
      {
        id: "claude-opus-4.7-xhigh",
        name: "Claude Opus 4.7 XHigh"
      },
      {
        id: "claude-opus-4.7-high",
        name: "Claude Opus 4.7 High"
      },
      {
        id: "claude-opus-4.7-medium",
        name: "Claude Opus 4.7 Medium"
      },
      {
        id: "claude-opus-4.7-low",
        name: "Claude Opus 4.7 Low"
      },
      {
        id: "claude-opus-4.7-review",
        name: "Claude Opus 4.7 Review"
      },
      {
        id: "claude-sonnet-4.6-thinking-1m",
        name: "Claude Sonnet 4.6 Thinking 1M"
      },
      {
        id: "claude-sonnet-4.6-1m",
        name: "Claude Sonnet 4.6 1M"
      },
      {
        id: "claude-sonnet-4.6-thinking",
        name: "Claude Sonnet 4.6 Thinking"
      },
      {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6"
      },
      {
        id: "claude-opus-4.6-thinking",
        name: "Claude Opus 4.6 Thinking"
      },
      {
        id: "claude-opus-4.6",
        name: "Claude Opus 4.6"
      },
      {
        id: "claude-opus-4.5-thinking",
        name: "Claude Opus 4.5 Thinking"
      },
      {
        id: "claude-opus-4.5",
        name: "Claude Opus 4.5"
      },
      {
        id: "claude-sonnet-4.5-thinking",
        name: "Claude Sonnet 4.5 Thinking"
      },
      {
        id: "claude-sonnet-4.5",
        name: "Claude Sonnet 4.5"
      },
      {
        id: "claude-haiku-4.5",
        name: "Claude Haiku 4.5"
      },
      {
        id: "gpt-5.5-xhigh-fast",
        name: "GPT-5.5 XHigh Fast"
      },
      {
        id: "gpt-5.5-xhigh",
        name: "GPT-5.5 XHigh"
      },
      {
        id: "gpt-5.5-high-fast",
        name: "GPT-5.5 High Fast"
      },
      {
        id: "gpt-5.5-high",
        name: "GPT-5.5 High"
      },
      {
        id: "gpt-5.5-medium-fast",
        name: "GPT-5.5 Medium Fast"
      },
      {
        id: "gpt-5.5-medium",
        name: "GPT-5.5 Medium"
      },
      {
        id: "gpt-5.5-low-fast",
        name: "GPT-5.5 Low Fast"
      },
      {
        id: "gpt-5.5-low",
        name: "GPT-5.5 Low"
      },
      {
        id: "gpt-5.5-none-fast",
        name: "GPT-5.5 None Fast"
      },
      {
        id: "gpt-5.5-none",
        name: "GPT-5.5 None"
      },
      {
        id: "gpt-5.4-xhigh-fast",
        name: "GPT-5.4 XHigh Fast"
      },
      {
        id: "gpt-5.4-xhigh",
        name: "GPT-5.4 XHigh"
      },
      {
        id: "gpt-5.4-high-fast",
        name: "GPT-5.4 High Fast"
      },
      {
        id: "gpt-5.4-high",
        name: "GPT-5.4 High"
      },
      {
        id: "gpt-5.4-medium-fast",
        name: "GPT-5.4 Medium Fast"
      },
      {
        id: "gpt-5.4-medium",
        name: "GPT-5.4 Medium"
      },
      {
        id: "gpt-5.4-low-fast",
        name: "GPT-5.4 Low Fast"
      },
      {
        id: "gpt-5.4-low",
        name: "GPT-5.4 Low"
      },
      {
        id: "gpt-5.4-none-fast",
        name: "GPT-5.4 None Fast"
      },
      {
        id: "gpt-5.4-none",
        name: "GPT-5.4 None"
      },
      {
        id: "gpt-5.4-mini-xhigh",
        name: "GPT-5.4 Mini XHigh"
      },
      {
        id: "gpt-5.4-mini-high",
        name: "GPT-5.4 Mini High"
      },
      {
        id: "gpt-5.4-mini-medium",
        name: "GPT-5.4 Mini Medium"
      },
      {
        id: "gpt-5.4-mini-low",
        name: "GPT-5.4 Mini Low"
      },
      {
        id: "gpt-5.3-codex-xhigh-fast",
        name: "GPT-5.3 Codex XHigh Fast"
      },
      {
        id: "gpt-5.3-codex-xhigh",
        name: "GPT-5.3 Codex XHigh"
      },
      {
        id: "gpt-5.3-codex-high-fast",
        name: "GPT-5.3 Codex High Fast"
      },
      {
        id: "gpt-5.3-codex-high",
        name: "GPT-5.3 Codex High"
      },
      {
        id: "gpt-5.3-codex-medium-fast",
        name: "GPT-5.3 Codex Medium Fast"
      },
      {
        id: "gpt-5.3-codex-medium",
        name: "GPT-5.3 Codex Medium"
      },
      {
        id: "gpt-5.3-codex-low-fast",
        name: "GPT-5.3 Codex Low Fast"
      },
      {
        id: "gpt-5.3-codex-low",
        name: "GPT-5.3 Codex Low"
      },
      {
        id: "gpt-5.2-xhigh",
        name: "GPT-5.2 XHigh"
      },
      {
        id: "gpt-5.2-high",
        name: "GPT-5.2 High"
      },
      {
        id: "gpt-5.2-medium",
        name: "GPT-5.2 Medium"
      },
      {
        id: "gpt-5.2-low",
        name: "GPT-5.2 Low"
      },
      {
        id: "gpt-5.2-none",
        name: "GPT-5.2 None"
      },
      {
        id: "gpt-5",
        name: "GPT-5"
      },
      {
        id: "gpt-4.1",
        name: "GPT-4.1"
      },
      {
        id: "gpt-4.1-mini",
        name: "GPT-4.1 Mini"
      },
      {
        id: "gpt-4.1-nano",
        name: "GPT-4.1 Nano"
      },
      {
        id: "gpt-4o",
        name: "GPT-4o"
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini"
      },
      {
        id: "gemini-3.1-pro-high",
        name: "Gemini 3.1 Pro High"
      },
      {
        id: "gemini-3.1-pro-low",
        name: "Gemini 3.1 Pro Low"
      },
      {
        id: "gemini-3.0-flash-high",
        name: "Gemini 3 Flash High"
      },
      {
        id: "gemini-3.0-flash-medium",
        name: "Gemini 3 Flash Medium"
      },
      {
        id: "gemini-3.0-flash-low",
        name: "Gemini 3 Flash Low"
      },
      {
        id: "gemini-3.0-flash-minimal",
        name: "Gemini 3 Flash Minimal"
      },
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro"
      },
      {
        id: "deepseek-v4",
        name: "DeepSeek V4"
      },
      {
        id: "kimi-k2.6",
        name: "Kimi K2.6"
      },
      {
        id: "kimi-k2.5",
        name: "Kimi K2.5"
      },
      {
        id: "glm-5.1",
        name: "GLM-5.1"
      }
    ]
  },
  {
    id: "poolside",
    priority: 60,
    alias: "poolside",
    aliases: [
      "ps"
    ],
    uiAlias: "ps",
    category: "freeTier",
    display: {
      name: "Poolside",
      icon: "water_drop",
      color: "#0EA5E9",
      textIcon: "PS",
      website: "https://poolside.ai",
      notice: {
        apiKeyUrl: "https://platform.poolside.ai/api-keys"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    models: [
      {
        id: "poolside/laguna-s-2.1",
        name: "Laguna S 2.1"
      },
      {
        id: "poolside/laguna-xs-2.1",
        name: "Laguna XS 2.1"
      }
    ]
  },
  {
    id: "tokenrouter",
    alias: "tokenrouter",
    aliases: [
      "tr"
    ],
    uiAlias: "tokenrouter",
    category: "apikey",
    display: {
      name: "TokenRouter",
      icon: "hub",
      color: "#0EA5E9",
      textIcon: "TR",
      website: "https://www.tokenrouter.com",
      notice: {
        text: "OpenAI-compatible gateway. 300+ models (OpenAI, Claude, Gemini, Qwen, DeepSeek, Kimi, GLM, dsb).",
        apiKeyUrl: "https://www.tokenrouter.com"
      }
    },
    passthroughModels: true,
    thinkingConfig: {
      options: [
        "low",
        "medium",
        "high",
        "xhigh",
        "max"
      ],
      defaultMode: "high"
    },
    serviceKinds: [
      "llm",
      "embedding",
      "image"
    ],
    embeddingConfig: {
      baseUrl: "https://api.tokenrouter.com/v1/embeddings",
      authType: "apikey",
      authHeader: "bearer"
    },
    imageConfig: {
      baseUrl: "https://api.tokenrouter.com/v1/images/generations"
    },
    modelsFetcher: {
      url: "https://api.tokenrouter.com/v1/models",
      type: "openai"
    },
    models: [
      {
        id: "anthropic/claude-haiku-4.5",
        name: "Claude Haiku 4.5"
      },
      {
        id: "anthropic/claude-sonnet-4.6",
        name: "Claude Sonnet 4.6"
      },
      {
        id: "anthropic/claude-opus-4.8",
        name: "Claude Opus 4.8"
      },
      {
        id: "anthropic/claude-opus-4.8-fast",
        name: "Claude Opus 4.8 Fast"
      },
      {
        id: "openai/gpt-5.4",
        name: "Gpt 5.4"
      },
      {
        id: "openai/gpt-5.4-mini",
        name: "Gpt 5.4 Mini"
      },
      {
        id: "openai/gpt-5.4-pro",
        name: "Gpt 5.4 Pro"
      },
      {
        id: "openai/gpt-5.5",
        name: "Gpt 5.5"
      },
      {
        id: "openai/gpt-5.6-sol",
        name: "Gpt 5.6 Sol"
      },
      {
        id: "google/gemini-3.5-flash",
        name: "Gemini 3.5 Flash"
      },
      {
        id: "google/gemini-3.6-flash",
        name: "Gemini 3.6 Flash"
      },
      {
        id: "deepseek/deepseek-v4-flash",
        name: "Deepseek V4 Flash"
      },
      {
        id: "deepseek/deepseek-v4-pro",
        name: "Deepseek V4 Pro"
      },
      {
        id: "qwen/qwen3-coder-next",
        name: "Qwen3 Coder Next"
      },
      {
        id: "qwen/qwen3.7-max",
        name: "Qwen3.7 Max"
      },
      {
        id: "qwen/qwen3.8-max",
        name: "Qwen3.8 Max"
      },
      {
        id: "moonshotai/kimi-k2.7-code",
        name: "Kimi K2.7 Code"
      },
      {
        id: "moonshotai/kimi-k3-free",
        name: "Kimi K3 Free"
      },
      {
        id: "z-ai/glm-5.3-free",
        name: "Glm 5.3 Free"
      },
      {
        id: "z-ai/glm-5.2",
        name: "Glm 5.2"
      },
      {
        id: "z-ai/glm-5-turbo",
        name: "Glm 5 Turbo"
      },
      {
        id: "x-ai/grok-4.5",
        name: "Grok 4.5"
      }
    ]
  },
  {
    id: "selfhosted-stt",
    priority: 50,
    alias: "selfhosted-stt",
    category: "apikey",
    display: {
      name: "Self-hosted STT",
      icon: "cloud",
      color: "#ffffffff",
      textIcon: "ST",
      website: "https://github.com/ggml-org/whisper.cpp"
    },
    hasFree: true,
    serviceKinds: [
      "stt"
    ],
    sttConfig: {
      baseUrl: "http://localhost:8080/v1/audio/transcriptions",
      authType: "apikey",
      authHeader: "bearer",
      format: "openai"
    },
    models: [
      {
        id: "whisper-1",
        name: "Whisper (self-hosted)",
        params: [
          "language",
          "response_format",
          "temperature",
          "prompt"
        ],
        kind: "stt"
      }
    ]
  },
  {
    id: "selfhosted-tts",
    priority: 50,
    alias: "selfhosted-tts",
    category: "apikey",
    display: {
      name: "Self-hosted TTS",
      icon: "cloud",
      color: "#ffffffff",
      textIcon: "TT",
      website: "https://github.com/remsky/Kokoro-FastAPI"
    },
    hasFree: true,
    serviceKinds: [
      "tts"
    ],
    ttsConfig: {
      baseUrl: "http://localhost:8880",
      defaultModel: "kokoro",
      authType: "apikey",
      format: "openai-speech"
    },
    models: [
      {
        id: "kokoro",
        name: "Kokoro (self-hosted)",
        params: [
          "voice",
          "response_format",
          "speed"
        ],
        kind: "tts"
      }
    ]
  },
  {
    id: "selfhosted-embedding",
    priority: 50,
    alias: "selfhosted-embedding",
    category: "apikey",
    display: {
      name: "Self-hosted Embedding",
      icon: "cloud",
      color: "#ffffffff",
      textIcon: "SE",
      website: "https://github.com/ggml-org/llama.cpp"
    },
    hasFree: true,
    serviceKinds: [
      "embedding"
    ],
    embeddingConfig: {
      baseUrl: "http://localhost:8080/v1/embeddings",
      authType: "apikey",
      authHeader: "bearer"
    },
    models: [
      {
        id: "embedding",
        name: "Self-hosted embedding model",
        kind: "embedding"
      }
    ]
  },
  {
    id: "fish-audio",
    alias: "fish",
    category: "apikey",
    display: {
      name: "Fish Audio",
      icon: "record_voice_over",
      color: "#1E9BF0",
      textIcon: "FA",
      website: "https://fish.audio",
      notice: {
        apiKeyUrl: "https://fish.audio/app/api-keys/"
      }
    },
    authType: "apikey",
    serviceKinds: [
      "tts"
    ],
    ttsConfig: {
      baseUrl: "https://api.fish.audio/v1/tts",
      authType: "apikey",
      authHeader: "bearer",
      format: "fish-audio",
      models: [
        {
          id: "s2.1-pro-free",
          name: "S2.1 Pro Free"
        },
        {
          id: "s2.1-pro",
          name: "S2.1 Pro"
        },
        {
          id: "s2-pro",
          name: "S2 Pro"
        },
        {
          id: "s1",
          name: "S1"
        }
      ]
    }
  },
  {
    id: "alitp-intl",
    priority: 11,
    alias: "alitp-intl",
    category: "apikey",
    display: {
      name: "Alibaba Token Plan",
      icon: "cloud",
      color: "#FF6A00",
      textIcon: "ATP",
      website: "https://www.alibabacloud.com/campaign/ai-landing-page-token",
      notice: {
        apiKeyUrl: "https://modelstudio.console.alibabacloud.com/?apiKey=1"
      }
    },
    models: [
      {
        id: "qwen3.8-max-preview",
        name: "Qwen3.8 Max Preview"
      },
      {
        id: "qwen3.7-max",
        name: "Qwen3.7 Max"
      },
      {
        id: "qwen3.7-plus",
        name: "Qwen3.7 Plus"
      },
      {
        id: "qwen3.6-flash",
        name: "Qwen3.6 Flash"
      },
      {
        id: "glm-5.2",
        name: "GLM 5.2"
      },
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro"
      }
    ]
  },
  {
    id: "xquik",
    alias: "xquik",
    category: "apikey",
    display: {
      name: "Xquik",
      icon: "tag",
      color: "#5C3327",
      textIcon: "XQ",
      website: "https://docs.xquik.com/api-reference/x/search-tweets",
      notice: {
        apiKeyUrl: "https://xquik.com",
        text: "Searches public X posts. Billing uses 1 Xquik credit per returned post."
      }
    },
    authType: "apikey",
    serviceKinds: [
      "webSearch"
    ],
    searchConfig: {
      baseUrl: "https://xquik.com/api/v1/x/tweets/search",
      validateUrl: "https://xquik.com/api/v1/credits",
      method: "GET",
      authType: "apikey",
      authHeader: "x-api-key",
      searchTypes: [
        "x"
      ],
      defaultMaxResults: 5,
      maxMaxResults: 100,
      timeoutMs: 10000,
      cacheTTLMs: 60000,
      creditsPerResult: 1
    }
  },
  {
    id: "ollama-search",
    alias: "ollama-search",
    category: "apikey",
    display: {
      name: "Ollama Search",
      icon: "cloud",
      color: "#ffffff",
      textIcon: "OL",
      website: "https://ollama.com",
      notice: {
        text: "Web search via Ollama Cloud subscription. Reuses the API key from the Ollama (chat) provider.",
        apiKeyUrl: "https://ollama.com/settings/keys"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    serviceKinds: [
      "webSearch"
    ],
    searchConfig: {
      baseUrl: "https://ollama.com/api/web_search",
      method: "POST",
      authType: "apikey",
      authHeader: "bearer",
      costPerQuery: 0,
      freeMonthlyQuota: 1000,
      searchTypes: [
        "web"
      ],
      defaultMaxResults: 5,
      maxMaxResults: 10,
      timeoutMs: 10000,
      cacheTTLMs: 300000
    },
    credentialFallback: "ollama"
  },
  {
    id: "unikey",
    priority: 120,
    alias: "unikey",
    aliases: [
      "uk"
    ],
    uiAlias: "uk",
    category: "apikey",
    display: {
      name: "UniKey",
      icon: "key",
      color: "#2563EB",
      textIcon: "UK",
      website: "https://www.getunikey.ai",
      notice: {
        text: "Unified AI API gateway (OpenAI-compatible). Add your UniKey API key.",
        apiKeyUrl: "https://www.getunikey.ai"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    passthroughModels: true,
    features: {
      usage: false,
      usageApikey: false
    },
    serviceKinds: [
      "llm",
      "imageToText",
      "embedding",
      "image",
      "video",
      "webSearch"
    ],
    imageConfig: {
      baseUrl: "https://www.getunikey.ai/v1/images/generations"
    },
    videoConfig: {
      baseUrl: "https://www.getunikey.ai/v1/videos",
      singleEndpoint: true
    },
    searchViaChat: {
      defaultModel: "claude-opus-4-8",
      endpoint: "https://www.getunikey.ai/v1/chat/completions",
      pricingUrl: "https://www.getunikey.ai"
    },
    modelsFetcher: {
      url: "https://www.getunikey.ai/v1/models",
      type: "openai"
    },
    models: [
      {
        id: "claude-opus-4-8",
        name: "Claude Opus 4.8",
        kinds: [
          "llm",
          "webSearch"
        ],
        capabilities: [
          "search",
          "vision"
        ]
      },
      {
        id: "gpt-5.6-sol",
        name: "GPT-5.6 Sol",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "google/gemini-3.1-pro-preview",
        name: "Google Gemini 3.1 Pro Preview",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "google/gemini-3.1-flash-lite",
        name: "Google Gemini 3.1 Flash Lite",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "claude-haiku-4-5-20251001",
        name: "Claude Haiku 4.5"
      },
      {
        id: "claude-opus-4-6",
        name: "Claude Opus 4.6",
        kinds: [
          "llm",
          "webSearch"
        ],
        capabilities: [
          "search",
          "vision"
        ]
      },
      {
        id: "claude-opus-4-7",
        name: "Claude Opus 4.7",
        kinds: [
          "llm",
          "webSearch"
        ],
        capabilities: [
          "search",
          "vision"
        ]
      },
      {
        id: "google/gemini-3.5-flash",
        name: "Google Gemini 3.5 Flash"
      },
      {
        id: "gemini-3.5-flash",
        name: "Gemini 3.5 Flash"
      },
      {
        id: "gemini-3.1-pro",
        name: "Gemini 3.1 Pro"
      },
      {
        id: "gpt-6-astra",
        name: "GPT-6 Astra"
      },
      {
        id: "gpt-5.6-luna",
        name: "GPT-5.6 Luna",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "gpt-5.6-terra",
        name: "GPT-5.6 Terra",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "gpt-5.5",
        name: "GPT-5.5"
      },
      {
        id: "z-ai/glm-5.1",
        name: "GLM 5.1"
      },
      {
        id: "deepseek/deepseek-v4-pro",
        name: "DeepSeek V4 Pro"
      },
      {
        id: "deepseek/deepseek-v4-flash",
        name: "DeepSeek V4 Flash"
      },
      {
        id: "x-ai/grok-4.3",
        name: "Grok 4.3"
      },
      {
        id: "bytedance-seed/seedream-5-0-pro",
        name: "Bytedance Seedream 5.0 Pro",
        type: "video"
      },
      {
        id: "bytedance/seedance-2.5",
        name: "Bytedance Seedance 2.5",
        type: "video"
      },
      {
        id: "google/gemini-3-pro-image",
        name: "Google Gemini 3 Pro Image",
        type: "image"
      },
      {
        id: "google/gemini-3.1-flash-image",
        name: "Google Gemini 3.1 Flash Image",
        type: "image"
      },
      {
        id: "gpt-image-2",
        name: "GPT Image 2",
        type: "image"
      },
      {
        id: "minimax/hailuo-3",
        name: "MiniMax Hailuo 3",
        type: "video"
      },
      {
        id: "kwaivgi/kling-v3.0-pro",
        name: "Kuaishou Kling v3.0 Pro",
        type: "video"
      },
      {
        id: "bytedance/seedance-2.0-fast",
        name: "Bytedance Seedance 2.0 Fast",
        type: "video"
      },
      {
        id: "openai/gpt-5-image-mini",
        name: "OpenAI GPT-5 Image Mini",
        type: "image"
      },
      {
        id: "qwen/qwen-image-3",
        name: "Qwen Image 3",
        type: "image"
      },
      {
        id: "BAAI/bge-m3",
        name: "BAAI BGE-M3",
        type: "embedding"
      }
    ]
  },
  {
    id: "cline-free",
    priority: 79,
    alias: "cline-free",
    uiAlias: "cline-free",
    category: "oauth",
    display: {
      name: "Cline Free",
      icon: "smart_toy",
      color: "#5B9BD5",
      textIcon: "CF",
      website: "https://cline.bot",
      notice: {
        signupUrl: "https://cline.bot"
      }
    },
    hasOAuth: true,
    authModes: [
      "oauth",
      "apikey"
    ],
    passthroughModels: true,
    modelsFetcher: {
      url: "https://api.cline.bot/api/v1/models",
      type: "cline-free"
    },
    models: [
      {
        id: "z-ai/glm-5.2:free",
        name: "GLM 5.2 (Free)"
      },
      {
        id: "z-ai/glm-5.3-flash",
        name: "GLM 5.3 Flash (Free Daily Limit)"
      },
      {
        id: "z-ai/glm-4.7-flash",
        name: "GLM 4.7 Flash"
      },
      {
        id: "z-ai/glm-4.5",
        name: "GLM 4.5"
      },
      {
        id: "google/gemma-4-26b-a4b-it:free",
        name: "Gemma 4 26B (Free)"
      },
      {
        id: "google/gemma-4-31b-it:free",
        name: "Gemma 4 31B (Free)"
      },
      {
        id: "nvidia/nemotron-3-super-120b-a12b:free",
        name: "Nemotron 3 Super 120B (Free)"
      },
      {
        id: "nvidia/nemotron-3-ultra-550b-a55b:free",
        name: "Nemotron 3 Ultra 550B (Free)"
      },
      {
        id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        name: "Nemotron 3 Nano Omni Reasoning (Free)"
      },
      {
        id: "nvidia/nemotron-3.5-lightning:free",
        name: "Nemotron 3.5 Lightning (Free)"
      },
      {
        id: "nvidia/nemotron-3.5-content-safety:free",
        name: "Nemotron 3.5 Content Safety (Free)"
      },
      {
        id: "thinkingmachines/inkling:free",
        name: "Inkling (Free)"
      },
      {
        id: "thinkingmachines/inkling-small:free",
        name: "Inkling Small (Free)"
      },
      {
        id: "poolside/laguna-xs-2.1:free",
        name: "Laguna XS 2.1 (Free)"
      },
      {
        id: "poolside/laguna-s-2.1:free",
        name: "Laguna S 2.1 (Free)"
      },
      {
        id: "cohere/north-mini-code:free",
        name: "North Mini Code (Free)"
      },
      {
        id: "nex-agi/nex-n2.5-pro:free",
        name: "Nex N2.5 Pro (Free)"
      },
      {
        id: "liquid/lfm-2.5-2.6b:free",
        name: "LFM 2.5 2.6B (Free)"
      },
      {
        id: "dots-studio/dots-3-note-preview:free",
        name: "Dots 3 Note Preview (Free)"
      },
      {
        id: "inclusionai/ling-3.0-flash-vl:free",
        name: "Ling 3.0 Flash VL (Free)"
      },
      {
        id: "inclusionai/ling-3.0-flash-fin:free",
        name: "Ling 3.0 Flash Fin (Free)"
      },
      {
        id: "inclusionai/ling-3.0-flash-sante:free",
        name: "Ling 3.0 Flash Santé (Free)"
      },
      {
        id: "deepseek/deepseek-v4-flash-0731:free",
        name: "DeepSeek V4 Flash (Free)"
      },
      {
        id: "moonshotai/kimi-k3",
        name: "Kimi K3 (Free)",
        contextLength: 262144
      },
      {
        id: "openrouter/free",
        name: "OpenRouter Free"
      }
    ]
  },
  {
    id: "orcarouter",
    priority: 110,
    alias: "orcarouter",
    aliases: [
      "orca"
    ],
    uiAlias: "orca",
    category: "apikey",
    display: {
      name: "OrcaRouter",
      icon: "hub",
      color: "#0284C7",
      textIcon: "ORCA",
      website: "https://www.orcarouter.ai",
      notice: {
        text: "OpenAI-compatible adaptive routing gateway. 200+ models across frontier and open-source.",
        apiKeyUrl: "https://www.orcarouter.ai/console/api-keys"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    passthroughModels: true,
    features: {
      usage: false,
      usageApikey: false
    },
    serviceKinds: [
      "llm",
      "imageToText"
    ],
    modelsFetcher: {
      url: "https://api.orcarouter.ai/v1/models",
      type: "orcarouter-free"
    },
    models: [
      {
        id: "orcarouter/auto",
        name: "Auto (smart routing)",
        upstreamModelId: "orcarouter/auto"
      },
      {
        id: "auto",
        name: "Auto (smart routing)",
        upstreamModelId: "orcarouter/auto"
      },
      {
        id: "orcarouter/free",
        name: "Free (free tier router)",
        upstreamModelId: "orcarouter/free",
        isFree: true
      },
      {
        id: "free",
        name: "Free (free tier router)",
        upstreamModelId: "orcarouter/free",
        isFree: true
      },
      {
        id: "deepseek/deepseek-v4-flash-free",
        name: "DeepSeek V4 Flash (Free)",
        upstreamModelId: "deepseek/deepseek-v4-flash-free",
        isFree: true
      },
      {
        id: "tencent/hy3-free",
        name: "Tencent HY3 (Free)",
        upstreamModelId: "tencent/hy3-free",
        isFree: true
      },
      {
        id: "z-ai/glm-5.3-flash-free",
        name: "GLM 5.3 Flash (Free)",
        upstreamModelId: "z-ai/glm-5.3-flash-free",
        isFree: true
      },
      {
        id: "orcarouter/fusion",
        name: "Fusion",
        upstreamModelId: "orcarouter/fusion"
      },
      {
        id: "fusion",
        name: "Fusion",
        upstreamModelId: "orcarouter/fusion"
      },
      {
        id: "orcarouter/fusion-flash",
        name: "Fusion Flash",
        upstreamModelId: "orcarouter/fusion-flash"
      },
      {
        id: "fusion-flash",
        name: "Fusion Flash",
        upstreamModelId: "orcarouter/fusion-flash"
      },
      {
        id: "orcarouter/fusion-mini",
        name: "Fusion Mini",
        upstreamModelId: "orcarouter/fusion-mini"
      },
      {
        id: "fusion-mini",
        name: "Fusion Mini",
        upstreamModelId: "orcarouter/fusion-mini"
      },
      {
        id: "openai/gpt-5.5",
        name: "GPT-5.5",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "gpt-5.5",
        name: "GPT-5.5",
        upstreamModelId: "openai/gpt-5.5",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "openai/gpt-6-astra",
        name: "GPT-6 Astra",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "gpt-6-astra",
        name: "GPT-6 Astra",
        upstreamModelId: "openai/gpt-6-astra",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "google/gemini-3.8-flash",
        name: "Gemini 3.8 Flash",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "gemini-3.8-flash",
        name: "Gemini 3.8 Flash",
        upstreamModelId: "google/gemini-3.8-flash",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "google/gemini-3.5-flash",
        name: "Gemini 3.5 Flash",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "gemini-3.5-flash",
        name: "Gemini 3.5 Flash",
        upstreamModelId: "google/gemini-3.5-flash",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "anthropic/claude-opus-5",
        name: "Claude Opus 5",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "claude-opus-5",
        name: "Claude Opus 5",
        upstreamModelId: "anthropic/claude-opus-5",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "anthropic/claude-opus-4.8",
        name: "Claude Opus 4.8",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "claude-opus-4.8",
        name: "Claude Opus 4.8",
        upstreamModelId: "anthropic/claude-opus-4.8",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "anthropic/claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        upstreamModelId: "anthropic/claude-sonnet-4.6",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "grok/grok-4.3",
        name: "Grok 4.3",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "grok-4.3",
        name: "Grok 4.3",
        upstreamModelId: "grok/grok-4.3",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "deepseek/deepseek-v4.1-flash",
        name: "DeepSeek V4.1 Flash"
      },
      {
        id: "deepseek-v4.1-flash",
        name: "DeepSeek V4.1 Flash",
        upstreamModelId: "deepseek/deepseek-v4.1-flash"
      },
      {
        id: "deepseek/deepseek-v4-pro",
        name: "DeepSeek V4 Pro"
      },
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        upstreamModelId: "deepseek/deepseek-v4-pro"
      },
      {
        id: "minimax/minimax-m2.7",
        name: "MiniMax M2.7"
      },
      {
        id: "minimax-m2.7",
        name: "MiniMax M2.7",
        upstreamModelId: "minimax/minimax-m2.7"
      },
      {
        id: "qwen/qwen3.7-max",
        name: "Qwen3.7 Max"
      },
      {
        id: "qwen3.7-max",
        name: "Qwen3.7 Max",
        upstreamModelId: "qwen/qwen3.7-max"
      },
      {
        id: "qwen/qwen3.8-max-0902",
        name: "Qwen3.8 Max"
      },
      {
        id: "qwen3.8-max",
        name: "Qwen3.8 Max",
        upstreamModelId: "qwen/qwen3.8-max"
      }
    ]
  },
  {
    id: "tokenharbor",
    priority: 110,
    alias: "tokenharbor",
    aliases: [
      "th"
    ],
    uiAlias: "th",
    category: "apikey",
    display: {
      name: "Token Harbor",
      icon: "anchor",
      color: "#0D9488",
      textIcon: "TH",
      website: "https://tokenharbor.ai",
      notice: {
        text: "Unified API gateway for frontier AI models (OpenAI-compatible). Free $5 credit for new accounts.",
        apiKeyUrl: "https://tokenharbor.ai/dashboard"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    passthroughModels: true,
    features: {
      usage: false,
      usageApikey: false
    },
    serviceKinds: [
      "llm",
      "imageToText"
    ],
    modelsFetcher: {
      url: "https://tokenharbor.ai/v1/models",
      type: "openai"
    },
    models: [
      {
        id: "deepseek-v4.1-flash:free",
        name: "DeepSeek V4.1 Flash (Free)",
        isFree: true
      },
      {
        id: "deepseek/deepseek-v4.1-flash:free",
        name: "DeepSeek V4.1 Flash (Free)",
        upstreamModelId: "deepseek-v4.1-flash:free",
        isFree: true
      },
      {
        id: "deepseek-v4-flash:free",
        name: "DeepSeek V4 Flash (Free)",
        isFree: true
      },
      {
        id: "deepseek/deepseek-v4-flash:free",
        name: "DeepSeek V4 Flash (Free)",
        upstreamModelId: "deepseek-v4-flash:free",
        isFree: true
      },
      {
        id: "mimo-v2.5:free",
        name: "Xiaomi MiMo V2.5 (Free)",
        isFree: true
      },
      {
        id: "xiaomi/mimo-v2.5:free",
        name: "Xiaomi MiMo V2.5 (Free)",
        upstreamModelId: "mimo-v2.5:free",
        isFree: true
      },
      {
        id: "gpt-5.6-sol",
        name: "GPT-5.6 Sol",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "openai/gpt-5.6-sol",
        name: "GPT-5.6 Sol",
        upstreamModelId: "gpt-5.6-sol",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "gpt-6-astra",
        name: "GPT-6 Astra",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "openai/gpt-6-astra",
        name: "GPT-6 Astra",
        upstreamModelId: "gpt-6-astra",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "claude-opus-5",
        name: "Claude Opus 5",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "anthropic/claude-opus-5",
        name: "Claude Opus 5",
        upstreamModelId: "claude-opus-5",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "claude-opus-4.8",
        name: "Claude Opus 4.8",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "anthropic/claude-opus-4.8",
        name: "Claude Opus 4.8",
        upstreamModelId: "claude-opus-4.8",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "claude-sonnet-5",
        name: "Claude Sonnet 5",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "anthropic/claude-sonnet-5",
        name: "Claude Sonnet 5",
        upstreamModelId: "claude-sonnet-5",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "anthropic/claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        upstreamModelId: "claude-sonnet-4.6",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "gemini-3.8-flash",
        name: "Gemini 3.8 Flash",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "google/gemini-3.8-flash",
        name: "Gemini 3.8 Flash",
        upstreamModelId: "gemini-3.8-flash",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "gemini-3.7-flash",
        name: "Gemini 3.7 Flash",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "google/gemini-3.7-flash",
        name: "Gemini 3.7 Flash",
        upstreamModelId: "gemini-3.7-flash",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "gemini-3.5-flash",
        name: "Gemini 3.5 Flash",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "google/gemini-3.5-flash",
        name: "Gemini 3.5 Flash",
        upstreamModelId: "gemini-3.5-flash",
        capabilities: [
          "vision"
        ]
      },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash"
      },
      {
        id: "deepseek/deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        upstreamModelId: "deepseek-v4-flash"
      },
      {
        id: "deepseek-v4.1-flash",
        name: "DeepSeek V4.1 Flash"
      },
      {
        id: "deepseek/deepseek-v4.1-flash",
        name: "DeepSeek V4.1 Flash",
        upstreamModelId: "deepseek-v4.1-flash"
      },
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro"
      },
      {
        id: "deepseek/deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        upstreamModelId: "deepseek-v4-pro"
      },
      {
        id: "qwen3.8-max",
        name: "Qwen3.8 Max"
      },
      {
        id: "qwen/qwen3.8-max",
        name: "Qwen3.8 Max",
        upstreamModelId: "qwen3.8-max"
      },
      {
        id: "kimi-k3",
        name: "Kimi K3"
      },
      {
        id: "moonshotai/kimi-k3",
        name: "Kimi K3",
        upstreamModelId: "kimi-k3"
      },
      {
        id: "mimo-v2.5",
        name: "Xiaomi MiMo V2.5"
      },
      {
        id: "xiaomi/mimo-v2.5",
        name: "Xiaomi MiMo V2.5",
        upstreamModelId: "mimo-v2.5"
      },
      {
        id: "glm-5.3-flash",
        name: "GLM 5.3 Flash"
      },
      {
        id: "z-ai/glm-5.3-flash",
        name: "GLM 5.3 Flash",
        upstreamModelId: "glm-5.3-flash"
      },
      {
        id: "grok-4.6",
        name: "Grok 4.6"
      },
      {
        id: "x-ai/grok-4.6",
        name: "Grok 4.6",
        upstreamModelId: "grok-4.6"
      },
      {
        id: "th-orchestra",
        name: "TH Orchestra (Router)"
      }
    ]
  },
  {
    id: "opencode-zen",
    priority: 205,
    alias: "opencode-zen",
    aliases: [
      "ocz",
      "zen"
    ],
    uiAlias: "ocz",
    category: "apikey",
    display: {
      name: "OpenCode Zen",
      icon: "terminal",
      color: "#E87040",
      textIcon: "OZ",
      website: "https://opencode.ai/zen",
      notice: {
        text: "OpenCode Zen pay-as-you-go curated models for coding agents.",
        apiKeyUrl: "https://opencode.ai/auth"
      }
    },
    passthroughModels: true,
    modelsFetcher: {
      url: "https://opencode.ai/zen/v1/models",
      type: "openai"
    },
    models: [
      {
        id: "gpt-6-astra",
        name: "GPT 6 Astra",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.6-sol",
        name: "GPT 5.6 Sol",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.6-terra",
        name: "GPT 5.6 Terra",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.6-luna",
        name: "GPT 5.6 Luna",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.5",
        name: "GPT 5.5",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.5-pro",
        name: "GPT 5.5 Pro",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.4",
        name: "GPT 5.4",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.4-pro",
        name: "GPT 5.4 Pro",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.4-mini",
        name: "GPT 5.4 Mini",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.4-nano",
        name: "GPT 5.4 Nano",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.3-codex",
        name: "GPT 5.3 Codex",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.3-codex-spark",
        name: "GPT 5.3 Codex Spark",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.2",
        name: "GPT 5.2",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.2-codex",
        name: "GPT 5.2 Codex",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.1",
        name: "GPT 5.1",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.1-codex",
        name: "GPT 5.1 Codex",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.1-codex-max",
        name: "GPT 5.1 Codex Max",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5.1-codex-mini",
        name: "GPT 5.1 Codex Mini",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5",
        name: "GPT 5",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5-codex",
        name: "GPT 5 Codex",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "gpt-5-nano",
        name: "GPT 5 Nano",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "grok-4.6",
        name: "Grok 4.6",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "grok-4.5",
        name: "Grok 4.5",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "grok-build-0.1",
        name: "Grok Build 0.1",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "muse-spark-1.3",
        name: "Muse Spark 1.3",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "muse-spark-1.2",
        name: "Muse Spark 1.2",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "muse-spark-1.3-contributor-free",
        name: "Muse Spark 1.3 Contributor Free",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "muse-spark-1.2-contributor-free",
        name: "Muse Spark 1.2 Contributor Free",
        targetFormat: "openai-responses",
        supportedFormats: [
          "openai-responses"
        ]
      },
      {
        id: "claude-fable-5-1",
        name: "Claude Fable 5.1",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "claude-fable-5",
        name: "Claude Fable 5",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "claude-opus-5",
        name: "Claude Opus 5",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "claude-opus-4-8",
        name: "Claude Opus 4.8",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "claude-opus-4-7",
        name: "Claude Opus 4.7",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "claude-opus-4-6",
        name: "Claude Opus 4.6",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "claude-opus-4-5",
        name: "Claude Opus 4.5",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "claude-sonnet-5",
        name: "Claude Sonnet 5",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "claude-haiku-4-5",
        name: "Claude Haiku 4.5",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "qwen3.6-plus",
        name: "Qwen 3.6 Plus",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "qwen3.5-plus",
        name: "Qwen 3.5 Plus",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        supportedFormats: [
          "openai",
          "claude",
          "openai-responses"
        ]
      },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        supportedFormats: [
          "openai",
          "claude",
          "openai-responses"
        ]
      },
      {
        id: "deepseek-v4-flash-vision-exp",
        name: "DeepSeek V4 Flash Vision (Exp)",
        supportedFormats: [
          "openai",
          "claude",
          "openai-responses"
        ]
      },
      {
        id: "deepseek-v4-flash-free",
        name: "DeepSeek V4 Flash Free",
        supportedFormats: [
          "openai",
          "claude",
          "openai-responses"
        ]
      },
      {
        id: "glm-5.3-flash",
        name: "GLM 5.3 Flash",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "glm-5.3",
        name: "GLM 5.3",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "glm-5.2",
        name: "GLM 5.2",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "glm-5.1",
        name: "GLM 5.1",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "glm-5",
        name: "GLM 5",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "minimax-m3",
        name: "MiniMax M3",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "minimax-m2.7",
        name: "MiniMax M2.7",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "minimax-m2.5",
        name: "MiniMax M2.5",
        supportedFormats: [
          "openai",
          "claude"
        ]
      },
      {
        id: "kimi-k3",
        name: "Kimi K3",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "kimi-k2.7-code",
        name: "Kimi K2.7 Code",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "kimi-k2.6",
        name: "Kimi K2.6",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "kimi-k2.5",
        name: "Kimi K2.5",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "gemini-3.8-flash",
        name: "Gemini 3.8 Flash",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "gemini-3.7-flash",
        name: "Gemini 3.7 Flash",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "gemini-3.6-flash",
        name: "Gemini 3.6 Flash",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "gemini-3.5-flash",
        name: "Gemini 3.5 Flash",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "gemini-3.5-flash-lite",
        name: "Gemini 3.5 Flash Lite",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "gemini-3.1-pro",
        name: "Gemini 3.1 Pro",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "gemini-3-flash",
        name: "Gemini 3 Flash",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "big-pickle",
        name: "Big Pickle (Free)",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "mimo-v2.5-free",
        name: "MiMo V2.5 (Free)",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "ling-3.0-flash-fin-free",
        name: "Ling 3.0 Flash Fin (Free)",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "nemotron-3-ultra-free",
        name: "Nemotron 3 Ultra (Free)",
        supportedFormats: [
          "openai"
        ]
      },
      {
        id: "nemotron-3.5-lightning-free",
        name: "Nemotron 3.5 Lightning (Free)",
        supportedFormats: [
          "openai"
        ]
      }
    ]
  },
  {
    id: "workbuddy",
    priority: 90,
    alias: "wb",
    uiAlias: "wb",
    category: "oauth",
    hidden: false,
    display: {
      name: "WorkBuddy",
      icon: "smart_toy",
      color: "#006EFF",
      website: "https://www.workbuddy.ai",
      notice: {
        signupUrl: "https://workbuddy.ai/invite?code=FUACYYR4"
      }
    },
    hasOAuth: true,
    authModes: [
      "oauth",
      "apikey"
    ],
    passthroughModels: true,
    features: {
      usage: true,
      usageApikey: true
    },
    models: [
      {
        id: "hy3",
        name: "Hy3"
      },
      {
        id: "deepseek-v4.1-flash",
        name: "DeepSeek-V4.1-Flash"
      },
      {
        id: "hy4-preview",
        name: "Hy4 Preview"
      },
      {
        id: "glm-5.3",
        name: "GLM-5.3"
      },
      {
        id: "glm-5.2",
        name: "GLM-5.2"
      },
      {
        id: "glm-5.1",
        name: "GLM-5.1"
      },
      {
        id: "glm-5v-turbo",
        name: "GLM-5v-Turbo"
      },
      {
        id: "minimax-m3",
        name: "MiniMax-M3"
      },
      {
        id: "kimi-k3",
        name: "Kimi-K3"
      },
      {
        id: "kimi-k2.7",
        name: "Kimi-K2.7-Code"
      },
      {
        id: "kimi-k2.6",
        name: "Kimi-K2.6"
      },
      {
        id: "kimi-k2.5",
        name: "Kimi-K2.5"
      },
      {
        id: "gpt-5.6-luna",
        name: "GPT-5.6-Luna"
      },
      {
        id: "gpt-5.5",
        name: "GPT-5.5"
      },
      {
        id: "gpt-5.4",
        name: "GPT-5.4"
      },
      {
        id: "claude-opus-5",
        name: "Claude Opus 5"
      },
      {
        id: "claude-opus-4.6",
        name: "Claude Opus 4.6"
      },
      {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6"
      }
    ]
  },
  {
    id: "bai",
    priority: 250,
    alias: "bai",
    uiAlias: "bai",
    category: "apikey",
    hidden: false,
    display: {
      name: "B.ai",
      icon: "smart_toy",
      color: "#7C3AED",
      textIcon: "BAI",
      website: "https://b.ai",
      notice: {
        text: "Free tier: hy3, mimo-v2.5, qwen3.8-flash work with no credits. All other models require a funded B.ai balance.",
        apiKeyUrl: "https://b.ai"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    passthroughModels: true,
    models: [
      {
        id: "hy3",
        name: "Hy3"
      },
      {
        id: "mimo-v2.5",
        name: "Mimo V2.5"
      },
      {
        id: "qwen3.8-flash",
        name: "Qwen3.8 Flash"
      },
      {
        id: "deepseek-v4.1-flash",
        name: "DeepSeek V4.1 Flash"
      },
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro"
      },
      {
        id: "glm-5.1",
        name: "GLM 5.1"
      },
      {
        id: "glm-5.2",
        name: "GLM 5.2"
      },
      {
        id: "glm-5.3",
        name: "GLM 5.3"
      },
      {
        id: "glm-5.3-flash",
        name: "GLM 5.3 Flash"
      },
      {
        id: "minimax-m2.7",
        name: "MiniMax M2.7"
      },
      {
        id: "minimax-m3",
        name: "MiniMax M3"
      },
      {
        id: "mimo-v2.5-pro",
        name: "Mimo V2.5 Pro"
      },
      {
        id: "hy4-preview",
        name: "Hy4 Preview"
      },
      {
        id: "kimi-k2.6",
        name: "Kimi K2.6"
      },
      {
        id: "kimi-k3",
        name: "Kimi K3"
      },
      {
        id: "qwen3.8-27b",
        name: "Qwen3.8 27B"
      },
      {
        id: "qwen3.8-max",
        name: "Qwen3.8 Max"
      },
      {
        id: "gpt-5-mini",
        name: "GPT-5 Mini"
      },
      {
        id: "gpt-5-nano",
        name: "GPT-5 Nano"
      },
      {
        id: "gpt-5.2",
        name: "GPT-5.2"
      },
      {
        id: "gpt-5.4",
        name: "GPT-5.4"
      },
      {
        id: "gpt-5.4-mini",
        name: "GPT-5.4 Mini"
      },
      {
        id: "gpt-5.4-nano",
        name: "GPT-5.4 Nano"
      },
      {
        id: "gpt-5.4-pro",
        name: "GPT-5.4 Pro"
      },
      {
        id: "gpt-5.5",
        name: "GPT-5.5"
      },
      {
        id: "gpt-5.5-instant",
        name: "GPT-5.5 Instant"
      },
      {
        id: "gpt-5.6-luna",
        name: "GPT-5.6 Luna"
      },
      {
        id: "gpt-5.6-sol",
        name: "GPT-5.6 Sol"
      },
      {
        id: "gpt-5.6-terra",
        name: "GPT-5.6 Terra"
      },
      {
        id: "gpt-6-astra",
        name: "GPT-6 Astra"
      },
      {
        id: "claude-fable-5",
        name: "Claude Fable 5"
      },
      {
        id: "claude-fable-5.1",
        name: "Claude Fable 5.1"
      },
      {
        id: "claude-haiku-4.5",
        name: "Claude Haiku 4.5"
      },
      {
        id: "claude-opus-4.5",
        name: "Claude Opus 4.5"
      },
      {
        id: "claude-opus-4.6",
        name: "Claude Opus 4.6"
      },
      {
        id: "claude-opus-4.7",
        name: "Claude Opus 4.7"
      },
      {
        id: "claude-opus-4.8",
        name: "Claude Opus 4.8"
      },
      {
        id: "claude-opus-5",
        name: "Claude Opus 5"
      },
      {
        id: "claude-sonnet-4.5",
        name: "Claude Sonnet 4.5"
      },
      {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6"
      },
      {
        id: "claude-sonnet-5",
        name: "Claude Sonnet 5"
      },
      {
        id: "gemini-3-flash",
        name: "Gemini 3 Flash"
      },
      {
        id: "gemini-3.1-pro",
        name: "Gemini 3.1 Pro"
      },
      {
        id: "gemini-3.5-flash",
        name: "Gemini 3.5 Flash"
      },
      {
        id: "gemini-3.5-flash-lite",
        name: "Gemini 3.5 Flash Lite"
      },
      {
        id: "gemini-3.6-flash",
        name: "Gemini 3.6 Flash"
      },
      {
        id: "gemini-3.8-flash",
        name: "Gemini 3.8 Flash"
      }
    ]
  },
  {
    id: "kilocode-free",
    priority: 45,
    alias: "kcf",
    aliases: [
      "kilocode-free",
      "kilo-free",
      "kf"
    ],
    uiAlias: "kcf",
    category: "free",
    display: {
      name: "Kilo Code Free",
      icon: "code",
      color: "#FF6B35",
      textIcon: "KF",
      website: "https://kilo.ai",
      notice: {
        text: "Free AI models powered by Kilo AI Gateway. No account or API key required (IP rate-limited to 200 req/hr)."
      }
    },
    noAuth: true,
    passthroughModels: true,
    hasFree: true,
    modelsFetcher: {
      url: "https://api.kilo.ai/api/gateway/models",
      type: "kilocode-free"
    },
    models: [
      {
        id: "kilo-auto/free",
        name: "Auto Free",
        contextLength: 256000,
        maxTokens: 10000
      },
      {
        id: "nvidia/nemotron-3-ultra-550b-a55b:free",
        name: "Nemotron 3 Ultra 550B (Free)",
        contextLength: 1000000,
        maxTokens: 65536,
        reasoning: true
      },
      {
        id: "nvidia/nemotron-3.5-lightning:free",
        name: "Nemotron 3.5 Lightning (Free)",
        contextLength: 1000000,
        maxTokens: 65536,
        reasoning: true
      },
      {
        id: "thinkingmachines/inkling-small:free",
        name: "Inkling Small (Free)",
        contextLength: 1048576,
        maxTokens: 262144,
        vision: true,
        reasoning: true
      },
      {
        id: "dots-studio/dots-3-note-preview:free",
        name: "Dots 3 Note Preview (Free)",
        contextLength: 512000,
        maxTokens: 460800,
        vision: true,
        reasoning: true
      },
      {
        id: "stepfun/step-3.7-flash:free",
        name: "StepFun Step 3.7 Flash (Free)",
        contextLength: 262144,
        maxTokens: 262144,
        vision: true,
        reasoning: true
      },
      {
        id: "qwen/qwen3.8-27b:free",
        name: "Qwen 3.8 27B (Free)",
        contextLength: 262144,
        maxTokens: 235929,
        vision: true,
        reasoning: true
      },
      {
        id: "nex-agi/nex-n2.5-pro:free",
        name: "Nex N2.5 Pro (Free)",
        contextLength: 262144,
        maxTokens: 235929,
        vision: true,
        reasoning: true
      },
      {
        id: "nex-agi/nex-n2.5-mini:free",
        name: "Nex N2.5 Mini (Free)",
        contextLength: 262144,
        maxTokens: 235929,
        vision: true,
        reasoning: true
      },
      {
        id: "nvidia/nemotron-3-super-120b-a12b:free",
        name: "Nemotron 3 Super 120B (Free)",
        contextLength: 262144,
        maxTokens: 235929,
        reasoning: true
      },
      {
        id: "poolside/laguna-s-2.1:free",
        name: "Laguna S 2.1 (Free)",
        contextLength: 262144,
        maxTokens: 32768,
        reasoning: true
      },
      {
        id: "poolside/laguna-xs-2.1:free",
        name: "Laguna XS 2.1 (Free)",
        contextLength: 262144,
        maxTokens: 32768,
        reasoning: true
      },
      {
        id: "inclusionai/ling-3.0-flash-vl:free",
        name: "Ling 3.0 Flash VL (Free)",
        contextLength: 262144,
        maxTokens: 32768,
        vision: true,
        reasoning: true
      },
      {
        id: "inclusionai/ling-3.0-flash-sante:free",
        name: "Ling 3.0 Flash Santé (Free)",
        contextLength: 262144,
        maxTokens: 32768,
        reasoning: true
      },
      {
        id: "inclusionai/ling-3.0-flash-fin:free",
        name: "Ling 3.0 Flash Fin (Free)",
        contextLength: 262144,
        maxTokens: 32768,
        reasoning: true
      },
      {
        id: "cohere/north-mini-code:free",
        name: "North Mini Code (Free)",
        contextLength: 256000,
        maxTokens: 64000,
        reasoning: true
      },
      {
        id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        name: "Nemotron 3 Nano Omni (Free)",
        contextLength: 256000,
        maxTokens: 65536,
        vision: true,
        reasoning: true
      },
      {
        id: "openrouter/free",
        name: "OpenRouter Free (Free)",
        contextLength: 200000,
        vision: true,
        reasoning: true
      },
      {
        id: "nvidia/nemotron-3.5-content-safety:free",
        name: "Nemotron 3.5 Content Safety (Free)",
        contextLength: 128000,
        maxTokens: 8192,
        vision: true,
        reasoning: true
      },
      {
        id: "liquid/lfm-2.5-2.6b:free",
        name: "LiquidAI LFM 2.5 2.6B (Free)",
        contextLength: 65536,
        maxTokens: 8192,
        reasoning: true
      },
      {
        id: "z-ai/glm-5.2:free",
        name: "GLM 5.2 (Free)",
        contextLength: 32768,
        maxTokens: 29491,
        reasoning: true
      }
    ]
  },
  {
    id: "ovhcloud-free",
    priority: 45,
    alias: "ovhcf",
    aliases: [
      "ovhcloud-free",
      "ovh-cloud-free",
      "ovh-free"
    ],
    uiAlias: "ovhcf",
    category: "free",
    display: {
      name: "OVHcloud AI Free",
      icon: "cloud",
      color: "#000E9C",
      textIcon: "OV",
      website: "https://ovhcloud.com",
      notice: {
        text: "EU-hosted open-weight models. Anonymous: 2 RPM per IP per model. Authenticated: 400 RPM per project."
      }
    },
    noAuth: true,
    passthroughModels: true,
    hasFree: true,
    modelsFetcher: {
      url: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/models",
      type: "ovhcloud-free"
    },
    models: [
      {
        id: "Qwen3.8-27B",
        name: "Qwen 3.8 27B",
        contextLength: 131072,
        reasoning: true,
        vision: true
      },
      {
        id: "Qwen3-Coder-30B-A3B-Instruct",
        name: "Qwen3 Coder 30B",
        contextLength: 262144,
        reasoning: true
      },
      {
        id: "gpt-oss-120b",
        name: "GPT-OSS 120B",
        contextLength: 131072,
        reasoning: true
      },
      {
        id: "gpt-oss-20b",
        name: "GPT-OSS 20B",
        contextLength: 131072,
        reasoning: true
      },
      {
        id: "Meta-Llama-3_3-70B-Instruct",
        name: "Llama 3.3 70B",
        contextLength: 131072
      },
      {
        id: "Qwen3-32B",
        name: "Qwen3 32B",
        contextLength: 131072,
        reasoning: true
      },
      {
        id: "Qwen3.6-27B",
        name: "Qwen 3.6 27B",
        contextLength: 131072,
        vision: true,
        reasoning: true
      },
      {
        id: "Qwen3.5-397B-A17B",
        name: "Qwen 3.5 397B MoE",
        contextLength: 131072,
        reasoning: true
      },
      {
        id: "Mistral-Small-3.2-24B-Instruct-2506",
        name: "Mistral Small 3.2 24B",
        contextLength: 128000
      },
      {
        id: "Qwen2.5-VL-72B-Instruct",
        name: "Qwen 2.5 VL 72B (Vision)",
        contextLength: 128000,
        vision: true
      }
    ]
  },
  {
    id: "ovhcloud",
    priority: 60,
    alias: "ovh",
    aliases: [
      "ovhcloud",
      "ovh"
    ],
    uiAlias: "ovh",
    category: "apikey",
    display: {
      name: "OVHcloud AI",
      icon: "cloud",
      color: "#000E9C",
      textIcon: "OV",
      website: "https://ovhcloud.com",
      notice: {
        text: "EU-hosted open-weight models. 400 RPM per project per model with API key. Free tier available.",
        apiKeyUrl: "https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    passthroughModels: true,
    modelsFetcher: {
      url: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/models",
      type: "ovhcloud-free"
    },
    models: [
      {
        id: "Qwen3.8-27B",
        name: "Qwen 3.8 27B",
        contextLength: 131072,
        reasoning: true,
        vision: true
      },
      {
        id: "Qwen3-Coder-30B-A3B-Instruct",
        name: "Qwen3 Coder 30B",
        contextLength: 262144,
        reasoning: true
      },
      {
        id: "gpt-oss-120b",
        name: "GPT-OSS 120B",
        contextLength: 131072,
        reasoning: true
      },
      {
        id: "gpt-oss-20b",
        name: "GPT-OSS 20B",
        contextLength: 131072,
        reasoning: true
      },
      {
        id: "Meta-Llama-3_3-70B-Instruct",
        name: "Llama 3.3 70B",
        contextLength: 131072
      },
      {
        id: "Qwen3-32B",
        name: "Qwen3 32B",
        contextLength: 131072,
        reasoning: true
      },
      {
        id: "Qwen3.6-27B",
        name: "Qwen 3.6 27B",
        contextLength: 131072,
        vision: true,
        reasoning: true
      },
      {
        id: "Qwen3.5-397B-A17B",
        name: "Qwen 3.5 397B MoE",
        contextLength: 131072,
        reasoning: true
      },
      {
        id: "Mistral-Small-3.2-24B-Instruct-2506",
        name: "Mistral Small 3.2 24B",
        contextLength: 128000
      },
      {
        id: "Qwen2.5-VL-72B-Instruct",
        name: "Qwen 2.5 VL 72B (Vision)",
        contextLength: 128000,
        vision: true
      }
    ]
  },
  {
    id: "vlmrun",
    priority: 61,
    alias: "vlmr",
    aliases: [
      "vlmrun",
      "vlm-run"
    ],
    uiAlias: "vlmr",
    category: "apikey",
    display: {
      name: "VLM Run",
      icon: "visibility",
      color: "#6366F1",
      textIcon: "VR",
      website: "https://vlm.run",
      notice: {
        text: "Vision-language model gateway. 240 RPM, 10,000/hr with API key + $10 free signup balance.",
        apiKeyUrl: "https://app.vlm.run/dashboard/settings/api-keys"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    passthroughModels: true,
    modelsFetcher: {
      url: "https://gateway.vlm.run/v1/openai/models",
      type: "openai"
    },
    models: [
      {
        id: "qwen/qwen3.8-27b",
        name: "Qwen 3.8 27B",
        contextLength: 262144,
        reasoning: true,
        vision: true
      }
    ]
  },
  {
    id: "llmtech-free",
    priority: 47,
    alias: "ltf",
    aliases: [
      "llmtech-free",
      "llm-tech-free"
    ],
    uiAlias: "ltf",
    category: "free",
    display: {
      name: "LLM Tech Free",
      icon: "memory",
      color: "#059669",
      textIcon: "LT",
      website: "https://llmtech.eu",
      notice: {
        text: "EU-hosted Qwen 3.8 27B NVFP4 on Blackwell. 2 concurrent, 2M tokens/day. Zero data retention."
      }
    },
    noAuth: true,
    hasFree: true,
    models: [
      {
        id: "nvidia/Qwen3.8-27B-NVFP4",
        name: "Qwen 3.8 27B NVFP4 (EU)",
        contextLength: 262144,
        reasoning: true,
        vision: true
      }
    ]
  },
  {
    id: "llmtech",
    priority: 62,
    alias: "lt",
    aliases: [
      "llmtech",
      "llm-tech"
    ],
    uiAlias: "lt",
    category: "apikey",
    display: {
      name: "LLM Tech",
      icon: "memory",
      color: "#059669",
      textIcon: "LT",
      website: "https://llmtech.eu",
      notice: {
        text: "EU-hosted Qwen 3.8 27B NVFP4 on Blackwell. 64 concurrent, unlimited tokens. $0.25/$2.09 per 1M tokens.",
        apiKeyUrl: "https://llmtech.eu/docs/"
      }
    },
    authType: "apikey",
    authModes: [
      "apikey"
    ],
    models: [
      {
        id: "nvidia/Qwen3.8-27B-NVFP4",
        name: "Qwen 3.8 27B NVFP4 (EU)",
        contextLength: 262144,
        reasoning: true,
        vision: true
      }
    ]
  },
  {
    id: "llm7-free",
    priority: 44,
    alias: "l7f",
    aliases: [
      "llm7-free",
      "llm-7-free"
    ],
    uiAlias: "l7f",
    category: "free",
    display: {
      name: "LLM7 Free",
      icon: "pool",
      color: "#7C3AED",
      textIcon: "L7",
      website: "https://llm7.io",
      notice: {
        text: "500k tokens/day, 10 RPM anonymous. Free token at dash.llm7.io doubles limits."
      }
    },
    noAuth: true,
    hasFree: true,
    models: [
      {
        id: "GLM-5.3-Flash",
        name: "GLM 5.3 Flash",
        contextLength: 131072,
        reasoning: true
      },
      {
        id: "codestral-latest",
        name: "Codestral (Mistral)",
        contextLength: 256000,
        reasoning: true
      },
      {
        id: "mistral-Nemo-Instruct-2407",
        name: "Mistral Nemo 12B",
        contextLength: 128000
      }
    ]
  },
  {
    id: "atria-asi",
    priority: 75,
    alias: "atria-asi",
    category: "apikey",
    display: {
      name: "Atria ASI",
      icon: "science",
      color: "#6366F1",
      textIcon: "AT",
      website: "https://atria-asi.ai",
      notice: {
        apiKeyUrl: "https://api.atria-asi.ai/console/keys"
      }
    },
    serviceKinds: [
      "llm"
    ],
    models: [
      {
        id: "Atria-Dawn-Preview",
        name: "Atria Dawn Preview",
        targetFormat: "openai-responses"
      }
    ]
  }
];

export default REGISTRY_UI;
