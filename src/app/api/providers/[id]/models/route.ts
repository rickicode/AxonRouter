import { NextResponse } from "next/server";
import { getMorphManagedConnectionById } from "@/app/api/providers/_morphManaged";
import { getMorphFastModels } from "@/shared/constants/models";
import {
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
  isMorphManagedProvider,
} from "@/shared/constants/providers";
import { KiroService } from "@/lib/oauth/services/kiro";
import { GEMINI_CONFIG, getOAuthClientMetadata } from "@/lib/oauth/constants/oauth";
import {
  refreshGoogleToken,
  updateProviderCredentials,
  refreshKiroToken,
} from "@/sse/services/tokenRefresh";
import { getModelsByProviderId } from "../../../../../../open-sse/config/providerModels";
import { resolveOllamaLocalHost } from "../../../../../../open-sse/config/providers";
import { filterCodexModelsForConnection } from "@/lib/codexModelAccess";
import { getAggregateProviderModelsForProvider } from "@/lib/providerModels/aggregate";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

const GEMINI_CLI_MODELS_URL = "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels";

type JsonObject = Record<string, any>;

type ProviderConnection = {
  id: string;
  provider: string;
  apiKey?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  projectId?: string | null;
  providerSpecificData?: {
    baseUrl?: string;
    profileArn?: string;
    projectId?: string;
    resourceUrl?: string;
    copilotToken?: string;
    [key: string]: any;
  } | null;
};

type ParsedModel = {
  id: string;
  name?: string;
  [key: string]: any;
};

type ProviderModelsConfig = {
  url: string | null;
  method: "GET" | "POST";
  headers: Record<string, string>;
  authHeader?: string;
  authPrefix?: string;
  authQuery?: string;
  body?: JsonObject;
  parseResponse: (data: any) => any[];
  fallbackModels?: any[];
};

type ModelsModule = typeof import("@/models");

async function loadModels(): Promise<ModelsModule> {
  return import("@/models");
}

const parseOpenAIStyleModels = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  return data?.data || data?.models || data?.results || [];
};

const parseGeminiCliModels = (data: any): ParsedModel[] => {
  // Primary shape: { models: [...] }
  if (Array.isArray(data?.models)) {
    return data.models
      .map((item: any) => {
        const id = item?.id || item?.model || item?.name;
        if (!id) return null;
        return { id, name: item?.displayName || item?.name || id };
      })
      .filter(Boolean) as ParsedModel[];
  }

  // Alternate shape: { models: { "model-id": { ...meta } } }
  if (data?.models && typeof data.models === "object") {
    return Object.entries(data.models)
      .filter(([, info]) => !(info as any)?.isInternal)
      .map(([id, info]) => ({
        id,
        name: (info as any)?.displayName || (info as any)?.name || id,
      }));
  }

  // Defensive fallback for upstream shape drift.
  const candidates = [
    data?.availableModels,
    data?.data?.models,
    data?.result?.models,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const parsed = candidate
        .map((item: any) => {
          const id = item?.id || item?.model || item?.name;
          if (!id) return null;
          return { id, name: item?.displayName || item?.name || id };
        })
        .filter(Boolean) as ParsedModel[];
      if (parsed.length > 0) return parsed;
    }
  }

  return [];
};

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs = 15000) => {
  const signal = AbortSignal.timeout(timeoutMs);
  return fetch(url, { ...options, signal });
};

const createOpenAIModelsConfig = (url: string): ProviderModelsConfig => ({
  url,
  method: "GET",
  headers: { "Content-Type": "application/json" },
  authHeader: "Authorization",
  authPrefix: "Bearer ",
  parseResponse: parseOpenAIStyleModels,
});

const parseCommandCodeModels = (data: any): ParsedModel[] => {
  const models = Array.isArray(data?.models)
    ? data.models
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data)
        ? data
        : [];

  return models
    .map((item: any) => {
      if (typeof item === "string") {
        return { id: item, name: item };
      }
      const id = item?.id || item?.model || item?.name;
      if (!id) return null;
      return {
        id,
        name: item?.display_name || item?.displayName || item?.name || id,
      };
    })
    .filter(Boolean) as ParsedModel[];
};

const resolveQwenModelsUrl = (connection: ProviderConnection): string => {
  const fallback = "https://portal.qwen.ai/v1/models";
  const raw = connection?.providerSpecificData?.resourceUrl;
  if (!raw || typeof raw !== "string") return fallback;
  const value = raw.trim();
  if (!value) return fallback;
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return `${value.replace(/\/$/, "")}/models`;
  }
  return `https://${value.replace(/\/$/, "")}/v1/models`;
};

async function getAggregateFallbackModels(providerId: string, connection: ProviderConnection | null = null) {
  const models = await getAggregateProviderModelsForProvider(providerId);
  if (!Array.isArray(models) || models.length === 0) return null;
  return providerId === "codex"
    ? filterCodexModelsForConnection(connection, models)
    : models;
}

const PROVIDER_MODELS_CONFIG: Record<string, ProviderModelsConfig> = {
  claude: {
    url: "https://api.anthropic.com/v1/models",
    method: "GET",
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Content-Type": "application/json",
    },
    authHeader: "x-api-key",
    parseResponse: (data: any) => data.data || [],
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authQuery: "key",
    parseResponse: (data: any) => data.models || [],
  },
  qwen: {
    url: "https://portal.qwen.ai/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data: any) => data.data || [],
  },
  antigravity: {
    url: "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:models",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    body: {},
    parseResponse: (data: any) => data.models || [],
  },
  github: {
    url: "https://api.githubcopilot.com/models",
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Copilot-Integration-Id": "vscode-chat",
      "editor-version": "vscode/1.107.1",
      "editor-plugin-version": "copilot-chat/0.26.7",
      "user-agent": "GitHubCopilotChat/0.26.7",
    },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data: any) => {
      if (!data?.data) return [];
      return data.data
        .filter((m: any) => m.capabilities?.type === "chat")
        .filter((m: any) => m.policy?.state !== "disabled")
        .map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
          version: m.version,
          capabilities: m.capabilities,
          isDefault: m.model_picker_enabled === true,
        }));
    },
  },
  openai: createOpenAIModelsConfig("https://api.openai.com/v1/models"),
  openrouter: createOpenAIModelsConfig("https://openrouter.ai/api/v1/models"),
  anthropic: {
    url: "https://api.anthropic.com/v1/models",
    method: "GET",
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Content-Type": "application/json",
    },
    authHeader: "x-api-key",
    parseResponse: (data: any) => data.data || [],
  },
  alicode: {
    url: "https://coding.dashscope.aliyuncs.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data: any) => data.data || [],
  },
  "alicode-intl": {
    url: "https://coding-intl.dashscope.aliyuncs.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data: any) => data.data || [],
  },
  "volcengine-ark": createOpenAIModelsConfig("https://ark.cn-beijing.volces.com/api/coding/v3/models"),
  deepseek: createOpenAIModelsConfig("https://api.deepseek.com/models"),
  groq: createOpenAIModelsConfig("https://api.groq.com/openai/v1/models"),
  xai: createOpenAIModelsConfig("https://api.x.ai/v1/models"),
  mistral: createOpenAIModelsConfig("https://api.mistral.ai/v1/models"),
  perplexity: createOpenAIModelsConfig("https://api.perplexity.ai/models"),
  together: createOpenAIModelsConfig("https://api.together.xyz/v1/models"),
  fireworks: createOpenAIModelsConfig("https://api.fireworks.ai/inference/v1/models"),
  cerebras: createOpenAIModelsConfig("https://api.cerebras.ai/v1/models"),
  cohere: createOpenAIModelsConfig("https://api.cohere.ai/v1/models"),
  nebius: createOpenAIModelsConfig("https://api.studio.nebius.ai/v1/models"),
  siliconflow: createOpenAIModelsConfig("https://api.siliconflow.cn/v1/models"),
  hyperbolic: createOpenAIModelsConfig("https://api.hyperbolic.xyz/v1/models"),
  ollama: createOpenAIModelsConfig("https://ollama.com/api/tags"),
  nanobanana: createOpenAIModelsConfig("https://api.nanobananaapi.ai/v1/models"),
  chutes: createOpenAIModelsConfig("https://llm.chutes.ai/v1/models"),
  nvidia: createOpenAIModelsConfig("https://integrate.api.nvidia.com/v1/models"),
  assemblyai: createOpenAIModelsConfig("https://api.assemblyai.com/v1/models"),
  commandcode: {
    url: null,
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-command-code-version": "0.25.0",
    },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: parseCommandCodeModels,
    fallbackModels: getModelsByProviderId("commandcode"),
  },
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { getProviderConnectionById } = await loadModels();
    const { id } = await params;
    const connection =
      (await getMorphManagedConnectionById(id)) ||
      (await getProviderConnectionById(id));
    const typedConnection = connection as ProviderConnection | null;

    if (typedConnection && isMorphManagedProvider(typedConnection.provider)) {
      return NextResponse.json({
        provider: typedConnection.provider,
        connectionId: typedConnection.id,
        models: getMorphFastModels(),
      });
    }

    if (!typedConnection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    if (isOpenAICompatibleProvider(typedConnection.provider)) {
      const baseUrl = typedConnection.providerSpecificData?.baseUrl;
      if (!baseUrl) {
        return NextResponse.json({ error: "No base URL configured for OpenAI compatible provider" }, { status: 400 });
      }
      const url = `${baseUrl.replace(/\/$/, "")}/models`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${typedConnection.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`Error fetching models from ${typedConnection.provider}:`, errorText);
        return NextResponse.json({ error: `Failed to fetch models: ${response.status}` }, { status: response.status });
      }

      const data = await response.json();
      const models = data.data || data.models || [];

      return NextResponse.json({
        provider: typedConnection.provider,
        connectionId: typedConnection.id,
        models,
      });
    }

    if (isAnthropicCompatibleProvider(typedConnection.provider)) {
      let baseUrl = typedConnection.providerSpecificData?.baseUrl;
      if (!baseUrl) {
        return NextResponse.json({ error: "No base URL configured for Anthropic compatible provider" }, { status: 400 });
      }

      baseUrl = baseUrl.replace(/\/$/, "");
      if (baseUrl.endsWith("/messages")) {
        baseUrl = baseUrl.slice(0, -9);
      }

      const url = `${baseUrl}/models`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": typedConnection.apiKey ?? "",
          "anthropic-version": "2023-06-01",
          Authorization: `Bearer ${typedConnection.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`Error fetching models from ${typedConnection.provider}:`, errorText);
        return NextResponse.json({ error: `Failed to fetch models: ${response.status}` }, { status: response.status });
      }

      const data = await response.json();
      const models = data.data || data.models || [];

      return NextResponse.json({
        provider: typedConnection.provider,
        connectionId: typedConnection.id,
        models,
      });
    }

    if (typedConnection.provider === "kiro" || typedConnection.provider === "amazon-q") {
      let warning: string | undefined;
      try {
        const kiroService = new KiroService();
        const profileArn = typedConnection.providerSpecificData?.profileArn;
        const accessToken = typedConnection.accessToken;
        const refreshToken = typedConnection.refreshToken;

        if (accessToken && profileArn) {
          try {
            const models = await kiroService.listAvailableModels(accessToken, profileArn);
            return NextResponse.json({
              provider: typedConnection.provider,
              connectionId: typedConnection.id,
              models,
            });
          } catch (error: any) {
            if (error.message.includes("AccessDeniedException") && refreshToken) {
              console.log("Kiro token invalid/expired. Attempting refresh...");
              const refreshed: any = await refreshKiroToken(refreshToken, typedConnection.providerSpecificData);

              if (refreshed?.accessToken) {
                await updateProviderCredentials(typedConnection.id, {
                  accessToken: refreshed.accessToken,
                  refreshToken: refreshed.refreshToken || refreshToken,
                  expiresIn: refreshed.expiresIn,
                });

                const models = await kiroService.listAvailableModels(refreshed.accessToken, profileArn);
                return NextResponse.json({
                  provider: typedConnection.provider,
                  connectionId: typedConnection.id,
                  models,
                });
              }
            }
            throw error;
          }
        }
      } catch (error: any) {
        warning = `Failed to fetch ${typedConnection.provider === "amazon-q" ? "Amazon Q" : "Kiro"} models: ${error.message}`;
        console.log("Failed to fetch Kiro-compatible models dynamically, falling back to static:", error.message);
      }

      return NextResponse.json({
        provider: typedConnection.provider,
        connectionId: typedConnection.id,
        models: [],
        warning,
      });
    }

    if (typedConnection.provider === "gemini-cli") {
      const { accessToken, refreshToken } = typedConnection;
      if (!accessToken) {
        return NextResponse.json({ error: "No valid token found" }, { status: 401 });
      }

      const projectId = typedConnection.projectId || typedConnection.providerSpecificData?.projectId;
      const body = projectId ? { project: projectId } : {};

      const fetchModels = async (token: string) => {
        const response = await fetchWithTimeout(GEMINI_CLI_MODELS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "User-Agent": "google-api-nodejs-client/9.15.1",
            "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
            "Client-Metadata": JSON.stringify(getOAuthClientMetadata()),
          },
          body: JSON.stringify(body),
        });
        return response;
      };

      let warning: string | undefined;

      try {
        let response = await fetchModels(accessToken);

        if (!response.ok && (response.status === 401 || response.status === 403) && refreshToken) {
          const refreshed = await refreshGoogleToken(
            refreshToken,
            GEMINI_CONFIG.clientId,
            GEMINI_CONFIG.clientSecret,
          );
          if (refreshed?.accessToken) {
            await updateProviderCredentials(typedConnection.id, {
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken || refreshToken,
              expiresIn: refreshed.expiresIn,
            });
            response = await fetchModels(refreshed.accessToken);
          }
        }

        if (response.ok) {
          const data = await response.json();
          const models = parseGeminiCliModels(data);
          if (models.length > 0) {
            return NextResponse.json({
              provider: typedConnection.provider,
              connectionId: typedConnection.id,
              models,
            });
          }

          const staticFallbackModels = await getAggregateFallbackModels(typedConnection.provider, typedConnection);
          if (staticFallbackModels) {
            return NextResponse.json({
              provider: typedConnection.provider,
              connectionId: typedConnection.id,
              models: staticFallbackModels,
              warning: "Gemini CLI live endpoint returned no models. Using aggregate fallback models.",
            });
          }
        } else {
          const errorText = await response.text();
          warning = `Failed to fetch Gemini CLI models: ${response.status} ${errorText}`;
          console.log("Failed to fetch Gemini CLI models dynamically, falling back to static:", errorText);
        }
      } catch (error: any) {
        warning = `Failed to fetch Gemini CLI models: ${error.message}`;
        console.log("Failed to fetch Gemini CLI models dynamically, falling back to static:", error.message);
      }

      const staticFallbackModels = await getAggregateFallbackModels(typedConnection.provider, typedConnection);
      return NextResponse.json({
        provider: typedConnection.provider,
        connectionId: typedConnection.id,
        models: staticFallbackModels || [],
        warning,
      });
    }

    if (typedConnection.provider === "ollama-local") {
      const url = `${resolveOllamaLocalHost(typedConnection)}/api/tags`;
      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.log("Error fetching models from ollama-local:", errorText);
        return NextResponse.json({ error: `Failed to fetch models: ${response.status}` }, { status: response.status });
      }
      const data = await response.json();
      const models = parseOpenAIStyleModels(data);
      return NextResponse.json({
        provider: typedConnection.provider,
        connectionId: typedConnection.id,
        models,
      });
    }

    const config = PROVIDER_MODELS_CONFIG[typedConnection.provider];
    if (!config) {
      return NextResponse.json(
        { error: `Provider ${typedConnection.provider} does not support models listing` },
        { status: 400 },
      );
    }

    const token = typedConnection.providerSpecificData?.copilotToken || typedConnection.accessToken || typedConnection.apiKey;
    if (!token) {
      return NextResponse.json({ error: "No valid token found" }, { status: 401 });
    }

    let url = config.url;
    if (typedConnection.provider === "qwen") {
      url = resolveQwenModelsUrl(typedConnection);
    }
    if (typedConnection.provider === "commandcode" && !url) {
      return NextResponse.json({
        provider: typedConnection.provider,
        connectionId: typedConnection.id,
        models: config.fallbackModels,
        warning: "Command Code does not expose a public models endpoint; using curated fallback models.",
      });
    }
    if (config.authQuery && url) {
      url += `?${config.authQuery}=${token}`;
    }

    const headers: Record<string, string> = { ...config.headers };
    if (config.authHeader && !config.authQuery) {
      headers[config.authHeader] = (config.authPrefix || "") + token;
    }

    const fetchOptions: RequestInit = {
      method: config.method,
      headers,
    };

    if (config.body && config.method === "POST") {
      fetchOptions.body = JSON.stringify(config.body);
    }

    const response = await fetch(url as string, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Error fetching models from ${typedConnection.provider}:`, errorText);

      if (typedConnection.provider === "commandcode" && Array.isArray(config.fallbackModels)) {
        return NextResponse.json({
          provider: typedConnection.provider,
          connectionId: typedConnection.id,
          models: config.fallbackModels,
          warning: `Failed to fetch live Command Code models: ${response.status}`,
        });
      }

      const staticFallbackModels = await getAggregateFallbackModels(typedConnection.provider, typedConnection);
      if (staticFallbackModels) {
        return NextResponse.json({
          provider: typedConnection.provider,
          connectionId: typedConnection.id,
          models: staticFallbackModels,
          warning: `Failed to fetch live ${typedConnection.provider} models: ${response.status}. Using aggregate fallback models.`,
        });
      }

      return NextResponse.json({ error: `Failed to fetch models: ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    const models = config.parseResponse(data);
    const filteredLiveModels = typedConnection.provider === "codex"
      ? filterCodexModelsForConnection(typedConnection, models)
      : models;
    const staticFallbackModels = await getAggregateFallbackModels(typedConnection.provider, typedConnection);

    return NextResponse.json({
      provider: typedConnection.provider,
      connectionId: typedConnection.id,
      models: filteredLiveModels.length > 0
        ? filteredLiveModels
        : (typedConnection.provider === "commandcode"
          ? config.fallbackModels
          : (staticFallbackModels || filteredLiveModels)),
      ...(models.length === 0 && staticFallbackModels
        ? { warning: `Provider returned no live models. Using aggregate fallback models for ${typedConnection.provider}.` }
        : {}),
    });
  } catch (error) {
    console.log("Error fetching provider models:", error);
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}
