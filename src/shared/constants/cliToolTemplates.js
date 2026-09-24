/**
 * Centralized CLI Tool Configuration Templates
 *
 * Single source of truth for:
 * 1. Target config file paths on POSIX vs Windows.
 * 2. Configuration formats (JSON, TOML, YAML, ENV).
 * 3. Configuration generation functions.
 * 4. Manual copy modal generation & remote setup script generation.
 */

export const TOOL_TEMPLATES = {
  claude: {
    id: "claude",
    name: "Claude Code",
    format: "json_merge",
    paths: {
      posix: ["~/.claude/settings.json"],
      windows: ["$env:USERPROFILE\\.claude\\settings.json"],
    },
    defaultModels: {
      sonnet: "cc/claude-sonnet-5",
      opus: "cc/claude-opus-5",
      haiku: "cc/claude-haiku-4-5-20251001",
    },
    generateConfig: ({ baseUrl, apiKey, models = {}, maxContextTokens }) => {
      const env = {
        ANTHROPIC_BASE_URL: baseUrl,
        ANTHROPIC_AUTH_TOKEN: apiKey || "sk_axonrouter",
        ANTHROPIC_DEFAULT_SONNET_MODEL: models.sonnet || "cc/claude-sonnet-5",
        ANTHROPIC_DEFAULT_OPUS_MODEL: models.opus || "cc/claude-opus-5",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: models.haiku || "cc/claude-haiku-4-5-20251001",
      };
      if (models.fable) env.ANTHROPIC_DEFAULT_FABLE_MODEL = models.fable;
      if (models.model) env.ANTHROPIC_MODEL = models.model;
      if (maxContextTokens) env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = String(maxContextTokens);

      return {
        hasCompletedOnboarding: true,
        env,
      };
    },
    verifyCmd: "claude --version",
  },

  codex: {
    id: "codex",
    name: "OpenAI Codex",
    format: "toml_block",
    paths: {
      posix: ["~/.codex/config.toml"],
      windows: ["$env:USERPROFILE\\.codex\\config.toml"],
    },
    generateConfig: ({ baseUrl, apiKey, model = "gpt-5", subagentModel }) => {
      const cleanBase = baseUrl.endsWith("/v1") ? baseUrl.slice(0, -3) : baseUrl;
      const subModel = subagentModel || model;
      return `model = "${model}"
model_provider = "axonrouter"

[model_providers.axonrouter]
name = "AxonRouter"
base_url = "${cleanBase}"
wire_api = "responses"

[model_providers.axonrouter.http_headers]
Authorization = "Bearer ${apiKey || "sk_axonrouter"}"

[agents]
default_subagent_model = "${subModel}"
`;
    },
    verifyCmd: "codex --version",
  },

  openclaw: {
    id: "openclaw",
    name: "Open Claw",
    format: "json_merge",
    paths: {
      posix: ["~/.openclaw/openclaw.json"],
      windows: ["$env:USERPROFILE\\.openclaw\\openclaw.json"],
    },
    generateConfig: ({ baseUrl, apiKey, model = "claude-sonnet-5" }) => {
      const cleanBase = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
      return {
        agents: {
          defaults: {
            model: {
              primary: `axonrouter/${model}`,
            },
          },
        },
        models: {
          providers: {
            "axonrouter": {
              baseUrl: cleanBase,
              apiKey: apiKey || "sk_axonrouter",
              api: "openai-completions",
              models: [
                {
                  id: model,
                  name: model.split("/").pop() || model,
                },
              ],
            },
          },
        },
      };
    },
    verifyCmd: "openclaw --version",
  },

  droid: {
    id: "droid",
    name: "Factory Droid",
    format: "json_merge",
    paths: {
      posix: ["~/.factory/settings.json"],
      windows: ["$env:USERPROFILE\\.factory\\settings.json"],
    },
    generateConfig: ({ baseUrl, apiKey, modelsList = ["claude-sonnet-5", "claude-opus-5", "gpt-5"] }) => {
      const cleanBase = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
      return {
        customModels: modelsList.map((m, i) => ({
          model: m,
          id: `custom:AxonRouter-${i}`,
          index: i,
          baseUrl: cleanBase,
          apiKey: apiKey || "sk_axonrouter",
          displayName: m,
          maxOutputTokens: 131072,
          noImageSupport: false,
          provider: "openai",
        })),
      };
    },
    verifyCmd: "droid --version",
  },

  hermes: {
    id: "hermes",
    name: "Hermes Agent",
    format: "multi_file",
    files: [
      {
        pathPosix: "~/.hermes/config.yaml",
        pathWin: "$env:USERPROFILE\\.hermes\\config.yaml",
        content: ({ baseUrl, model = "hermes-3-llama-3.1-405b" }) => `model:
  default: "${model}"
  provider: "custom"
  base_url: "${baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`}"
  api_key: \${OPENAI_API_KEY}
`,
      },
      {
        pathPosix: "~/.hermes/.env",
        pathWin: "$env:USERPROFILE\\.hermes\\.env",
        content: ({ apiKey }) => `OPENAI_API_KEY=${apiKey || "sk_axonrouter"}\n`,
      },
    ],
    verifyCmd: "hermes --version",
  },

  opencode: {
    id: "opencode",
    name: "OpenCode",
    format: "json_merge",
    paths: {
      posix: ["~/.config/opencode/opencode.json"],
      windows: ["$env:APPDATA\\opencode\\opencode.json"],
    },
    generateConfig: ({ baseUrl, apiKey, model = "claude-sonnet-5", subagentModel }) => {
      const cleanBase = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
      return {
        provider: {
          "axonrouter": {
            npm: "@ai-sdk/openai-compatible",
            options: {
              baseURL: cleanBase,
              apiKey: apiKey || "sk_axonrouter",
            },
            models: {
              [model]: {
                name: model,
                modalities: { input: ["text", "image"], output: ["text"] },
              },
            },
          },
        },
        model: `axonrouter/${model}`,
        agent: {
          explorer: {
            mode: "subagent",
            model: `axonrouter/${subagentModel || model}`,
          },
        },
      };
    },
    verifyCmd: "opencode --version",
  },

  cline: {
    id: "cline",
    name: "Cline",
    format: "multi_file",
    files: [
      {
        pathPosix: "~/.cline/data/globalState.json",
        pathWin: "$env:USERPROFILE\\.cline\\data\\globalState.json",
        content: ({ baseUrl, model = "claude-sonnet-5" }) =>
          JSON.stringify(
            {
              actModeApiProvider: "openai",
              planModeApiProvider: "openai",
              openAiBaseUrl: baseUrl.replace(/\/v1$/, ""),
              openAiModelId: model,
              planModeOpenAiModelId: model,
            },
            null,
            2,
          ),
      },
      {
        pathPosix: "~/.cline/data/secrets.json",
        pathWin: "$env:USERPROFILE\\.cline\\data\\secrets.json",
        content: ({ apiKey }) =>
          JSON.stringify(
            {
              openAiApiKey: apiKey || "sk_axonrouter",
            },
            null,
            2,
          ),
      },
    ],
  },

  kilo: {
    id: "kilo",
    name: "Kilo Code",
    format: "json_merge",
    paths: {
      posix: ["~/.local/share/kilo/auth.json"],
      windows: ["$env:LOCALAPPDATA\\kilo\\auth.json"],
    },
    generateConfig: ({ baseUrl, apiKey, model = "claude-sonnet-5" }) => {
      const cleanBase = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
      return {
        "openai-compatible": {
          type: "api-key",
          apiKey: apiKey || "sk_axonrouter",
          baseUrl: cleanBase,
          model,
        },
      };
    },
  },

  "deepseek-tui": {
    id: "deepseek-tui",
    name: "DeepSeek TUI",
    format: "toml_replace",
    paths: {
      posix: ["~/.deepseek/config.toml"],
      windows: ["$env:USERPROFILE\\.deepseek\\config.toml"],
    },
    generateConfig: ({ baseUrl, apiKey, model = "deepseek-chat" }) => {
      const cleanBase = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
      return `[providers.openai]
base_url = "${cleanBase}"
api_key = "${apiKey || "sk_axonrouter"}"
model = "${model}"
`;
    },
  },

  jcode: {
    id: "jcode",
    name: "jcode",
    format: "multi_file",
    files: [
      {
        pathPosix: "~/.jcode/config.toml",
        pathWin: "$env:USERPROFILE\\.jcode\\config.toml",
        content: ({ baseUrl, model = "claude-sonnet-5" }) => {
          const cleanBase = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
          return `[providers.axonrouter]
type = "openai-compatible"
base_url = "${cleanBase}"
auth = "bearer"
api_key_env = "JCODE_AXONROUTER_API_KEY"
env_file = "provider-axonrouter.env"
default_model = "${model}"
requires_api_key = true

[[providers.axonrouter.models]]
id = "${model}"
`;
        },
      },
      {
        pathPosix: "~/.config/jcode/provider-axonrouter.env",
        pathWin: "$env:USERPROFILE\\.config\\jcode\\provider-axonrouter.env",
        content: ({ apiKey }) => `JCODE_AXONROUTER_API_KEY="${apiKey || "sk_axonrouter"}"\n`,
      },
    ],
  },

  "grok-build": {
    id: "grok-build",
    name: "Grok Build",
    format: "toml_block",
    paths: {
      posix: ["~/.grok/config.toml"],
      windows: ["$env:USERPROFILE\\.grok\\config.toml"],
    },
    generateConfig: ({ baseUrl, apiKey, model = "grok-beta" }) => {
      const cleanBase = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
      return `[models]
default = "axonrouter"

\[model.axonrouter\]
model = "${model}"
base_url = "${cleanBase}"
name = "AxonRouter"
description = "Routed via AxonRouter gateway"
api_backend = "chat_completions"
api_key = "${apiKey || "sk_axonrouter"}"
context_window = 200000
`;
    },
  },

  copilot: {
    id: "copilot",
    name: "GitHub Copilot",
    format: "copilot_json",
    paths: {
      posix: ["~/.config/Code/User/chatLanguageModels.json"],
      darwin: ["~/Library/Application Support/Code/User/chatLanguageModels.json"],
      windows: ["$env:APPDATA\\Code\\User\\chatLanguageModels.json"],
    },
    generateConfig: ({ baseUrl, apiKey, modelsList = ["claude-sonnet-5", "gpt-5"] }) => {
      const cleanBase = baseUrl.replace(/\/v1$/, "");
      return [
        {
          name: "AxonRouter",
          vendor: "azure",
          apiKey: apiKey || "sk_axonrouter",
          models: modelsList.map((id) => ({
            id,
            name: id,
            url: `${cleanBase}/chat/completions#models.ai.azure.com`,
            toolCalling: true,
            vision: false,
            maxInputTokens: 128000,
            maxOutputTokens: 16000,
          })),
        },
      ];
    },
  },

  cowork: {
    id: "cowork",
    name: "Claude Desktop Cowork",
    format: "json_replace",
    paths: {
      darwin: ["~/Library/Application Support/Claude-3p/configLibrary/axonrouter.json"],
      windows: ["$env:APPDATA\\Claude-3p\\configLibrary\\axonrouter.json"],
      posix: ["~/.config/Claude-3p/configLibrary/axonrouter.json"],
    },
    generateConfig: ({ baseUrl, apiKey, modelsList = ["claude-sonnet-5", "claude-opus-5"] }) => {
      const cleanBase = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
      return {
        inferenceProvider: "gateway",
        inferenceGatewayBaseUrl: cleanBase,
        inferenceGatewayApiKey: apiKey || "sk_axonrouter",
        inferenceModels: modelsList.map((name) => ({ name })),
      };
    },
  },

  qwen: {
    id: "qwen",
    name: "Qwen Code",
    format: "json_merge",
    paths: {
      posix: ["~/.qwen/settings.json"],
      windows: ["$env:USERPROFILE\\.qwen\\settings.json"],
    },
    generateConfig: ({ baseUrl, apiKey, model = "qwen-2.5-coder-32b" }) => {
      const cleanBase = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
      return {
        security: {
          auth: {
            selectedType: "openai",
            apiKey: apiKey || "sk_axonrouter",
            baseUrl: cleanBase,
          },
        },
        model: { name: model },
      };
    },
  },

  amp: {
    id: "amp",
    name: "Amp CLI",
    format: "env_export",
    paths: {
      posix: ["~/.bashrc"],
      windows: ["$PROFILE"],
    },
    generateConfig: ({ baseUrl, apiKey }) => {
      const cleanBase = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
      return `export OPENAI_BASE_URL="${cleanBase}"
export OPENAI_API_KEY="${apiKey || "sk_axonrouter"}"
`;
    },
  },
};

/**
 * Helper to get manual config modal payloads (compatible with existing ManualConfigModal)
 */
export function getToolManualConfigs(toolId, params = {}) {
  const tpl = TOOL_TEMPLATES[toolId];
  if (!tpl) return [];

  if (tpl.format === "multi_file") {
    return tpl.files.map((f) => ({
      filename: f.pathPosix,
      content: f.content(params),
    }));
  }

  const raw = tpl.generateConfig(params);
  const content = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
  const filename = tpl.paths.posix[0] || tpl.paths.darwin?.[0] || tpl.id;

  return [
    {
      filename,
      content,
    },
  ];
}
