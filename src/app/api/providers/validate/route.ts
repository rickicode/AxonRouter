import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentProviderNodeById } from "@/lib/providerNodeReadAccess";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { getDefaultModel } from "../../../../../open-sse/config/providerModels";
import { resolveOllamaLocalHost } from "../../../../../open-sse/config/providers";
import { proxyAwareFetch } from "../../../../../open-sse/utils/proxyFetch";

const COMMANDCODE_TEST_MODEL = "deepseek/deepseek-v4-flash";

type ValidationBody = {
  provider?: string;
  apiKey?: string;
  providerSpecificData?: {
    azureEndpoint?: string;
    deployment?: string;
    apiVersion?: string;
    organization?: string;
    [key: string]: unknown;
  };
};

type ServiceAccountKey = {
  type?: string;
  client_email?: string;
  private_key?: string;
  project_id?: string;
};

function buildCommandCodeValidationPayload(message = "test") {
  return {
    model: COMMANDCODE_TEST_MODEL,
    messages: [{ role: "user", content: message }],
    memory: "",
    params: {
      messages: [{ role: "user", content: message }],
      model: COMMANDCODE_TEST_MODEL,
      provider: COMMANDCODE_TEST_MODEL.split("/")[0],
      stream: false,
      max_tokens: 1,
    },
    config: {
      workingDir: "/tmp",
      date: new Date().toISOString().split("T")[0],
      environment: "linux",
      structure: [],
      isGitRepo: false,
      currentBranch: "",
      mainBranch: "",
      gitStatus: "",
      recentCommits: [],
    },
  };
}

function parseServiceAccountKey(apiKey: string): ServiceAccountKey | null {
  try {
    const parsed = JSON.parse(apiKey) as ServiceAccountKey;
    return parsed.type === "service_account" ? parsed : null;
  } catch {
    return null;
  }
}

// POST /api/providers/validate - Validate API key with provider
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as ValidationBody;
    const { provider, apiKey, providerSpecificData } = body;

    if (!provider || (!apiKey && provider !== "ollama-local")) {
      return NextResponse.json({ error: "Provider and API key required" }, { status: 400 });
    }

    let isValid = false;
    let error: string | null = null;

    // Validate with each provider
    try {
      if (isOpenAICompatibleProvider(provider)) {
        const node = await getCurrentProviderNodeById(provider);
        if (!node) {
          return NextResponse.json({ error: "OpenAI Compatible node not found" }, { status: 404 });
        }
        const modelsUrl = `${node.baseUrl?.replace(/\/$/, "")}/models`;
        const res = await fetch(modelsUrl, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        isValid = res.ok;
        return NextResponse.json({
          valid: isValid,
          error: isValid ? null : "Invalid API key",
        });
      }

      if (isAnthropicCompatibleProvider(provider)) {
        const node = await getCurrentProviderNodeById(provider);
        if (!node) {
          return NextResponse.json({ error: "Anthropic Compatible node not found" }, { status: 404 });
        }

        let normalizedBase = node.baseUrl?.trim().replace(/\/$/, "") || "";
        if (normalizedBase.endsWith("/messages")) {
          normalizedBase = normalizedBase.slice(0, -9);
        }

        const modelsUrl = `${normalizedBase}/models`;

        const res = await fetch(modelsUrl, {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            Authorization: `Bearer ${apiKey}`,
          },
        });

        isValid = res.ok;
        return NextResponse.json({
          valid: isValid,
          error: isValid ? null : "Invalid API key",
        });
      }

      if (provider === "azure") {
        const endpoint = (providerSpecificData?.azureEndpoint || "").replace(/\/$/, "");
        const deployment = providerSpecificData?.deployment || "gpt-4";
        const apiVersion = providerSpecificData?.apiVersion || "2024-10-01-preview";
        const organization = providerSpecificData?.organization;

        const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
        const headers: Record<string, string> = {
          "api-key": apiKey,
          "Content-Type": "application/json",
        };
        if (organization) headers["OpenAI-Organization"] = organization;

        const azureRes = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            messages: [{ role: "user", content: "test" }],
            max_tokens: 1,
          }),
        });
        isValid = azureRes.status !== 401 && azureRes.status !== 403;
        return NextResponse.json({
          valid: isValid,
          error: isValid ? null : "Invalid API key or Azure configuration",
        });
      }

      switch (provider) {
        case "azure": {
          if (!providerSpecificData?.azureEndpoint) {
            return NextResponse.json(
              {
                valid: false,
                error: "Azure endpoint is required",
              },
              { status: 400 },
            );
          }

          if (!providerSpecificData?.deployment) {
            return NextResponse.json(
              {
                valid: false,
                error: "Deployment name is required",
              },
              { status: 400 },
            );
          }

          try {
            const parsedUrl = new URL(providerSpecificData.azureEndpoint);
            if (parsedUrl.protocol !== "https:") {
              return NextResponse.json(
                {
                  valid: false,
                  error: "Azure endpoint must use HTTPS",
                },
                { status: 400 },
              );
            }
          } catch {
            return NextResponse.json(
              {
                valid: false,
                error: "Invalid Azure endpoint URL format",
              },
              { status: 400 },
            );
          }

          const endpoint = providerSpecificData.azureEndpoint.replace(/\/$/, "");
          const deployment = providerSpecificData.deployment;
          const apiVersion = providerSpecificData?.apiVersion || "2024-10-01-preview";
          const organization = providerSpecificData?.organization;

          const url = `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${apiVersion}`;
          const headers: Record<string, string> = {
            "api-key": apiKey,
            "Content-Type": "application/json",
          };

          if (organization) headers["OpenAI-Organization"] = organization;

          const azureRes = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
              messages: [{ role: "user", content: "test" }],
              max_tokens: 5,
              stream: false,
            }),
          });

          isValid = azureRes.status !== 401 && azureRes.status !== 403;
          let errorMsg = "Invalid API key or Azure configuration";

          if (!isValid && azureRes.status >= 400) {
            try {
              const errBody = (await azureRes.json()) as { error?: { message?: string } };
              errorMsg = errBody?.error?.message || errorMsg;
            } catch {}
          }

          return NextResponse.json({
            valid: isValid,
            error: isValid ? null : errorMsg,
          });
        }

        case "openai": {
          const openaiRes = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          isValid = openaiRes.ok;
          break;
        }

        case "anthropic": {
          const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-3-haiku-20240307",
              max_tokens: 1,
              messages: [{ role: "user", content: "test" }],
            }),
          });
          isValid = anthropicRes.status !== 401;
          break;
        }

        case "gemini": {
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
          isValid = geminiRes.ok;
          break;
        }

        case "openrouter": {
          const openrouterRes = await fetch("https://openrouter.ai/api/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          isValid = openrouterRes.ok;
          break;
        }

        case "glm":
        case "glm-cn":
        case "kimi":
        case "minimax":
        case "minimax-cn":
        case "alicode-intl":
        case "alicode": {
          const claudeBaseUrls: Record<string, string> = {
            glm: "https://api.z.ai/api/anthropic/v1/messages",
            "glm-cn": "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions",
            kimi: "https://api.kimi.com/coding/v1/messages",
            minimax: "https://api.minimax.io/anthropic/v1/messages",
            "minimax-cn": "https://api.minimaxi.com/anthropic/v1/messages",
            alicode: "https://coding.dashscope.aliyuncs.com/v1/chat/completions",
            "alicode-intl": "https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions",
          };

          if (provider === "glm-cn" || provider === "alicode" || provider === "alicode-intl") {
            const testModel = getDefaultModel(provider);
            const glmCnRes = await fetch(claudeBaseUrls[provider], {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model: testModel,
                max_tokens: 1,
                messages: [{ role: "user", content: "test" }],
              }),
            });
            isValid = glmCnRes.status !== 401 && glmCnRes.status !== 403;
          } else {
            const claudeRes = await fetch(claudeBaseUrls[provider], {
              method: "POST",
              headers: {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model: "kimi-k2.5",
                max_tokens: 1,
                messages: [{ role: "user", content: "test" }],
              }),
            });
            isValid = claudeRes.status !== 401;
          }
          break;
        }

        case "volcengine-ark": {
          const testModel = getDefaultModel(provider);
          const res = await fetch("https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: testModel,
              max_tokens: 1,
              messages: [{ role: "user", content: "test" }],
            }),
          });
          isValid = res.status !== 401 && res.status !== 403;
          break;
        }

        case "commandcode": {
          const ccRes = await proxyAwareFetch("https://api.commandcode.ai/alpha/generate", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "x-command-code-version": "0.25.0",
            },
            body: JSON.stringify(buildCommandCodeValidationPayload()),
          });
          isValid = ccRes.ok;
          if (!isValid) {
            const errText = await ccRes.text().catch(() => "");
            let providerMsg = "Invalid API key or unsupported Command Code plan";
            try {
              const parsed = JSON.parse(errText) as { error?: { message?: string }; message?: string };
              providerMsg = parsed?.error?.message || parsed?.message || providerMsg;
            } catch {
              if (errText) providerMsg = errText;
            }
            error = providerMsg;
          }
          break;
        }

        case "freebuff": {
          const sessionRes = await fetch("https://www.codebuff.com/api/v1/freebuff/session", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "User-Agent": "ai-sdk/openai-compatible/0.0.96/codebuff-freebuff",
            },
          });
          const payload = await sessionRes.json().catch(() => null);
          isValid = sessionRes.ok || sessionRes.status === 429;
          if (!isValid) {
            error = payload?.message || payload?.error || "Invalid Freebuff token";
          }
          break;
        }

        case "deepseek":
        case "groq":
        case "xai":
        case "mistral":
        case "perplexity":
        case "together":
        case "fireworks":
        case "cerebras":
        case "cohere":
        case "nebius":
        case "siliconflow":
        case "hyperbolic":
        case "mimo":
        case "ollama":
        case "ollama-local":
        case "assemblyai":
        case "nanobanana":
        case "chutes":
        case "nvidia": {
          const endpoints: Record<string, string> = {
            deepseek: "https://api.deepseek.com/models",
            groq: "https://api.groq.com/openai/v1/models",
            xai: "https://api.x.ai/v1/models",
            mistral: "https://api.mistral.ai/v1/models",
            perplexity: "https://api.perplexity.ai/models",
            together: "https://api.together.xyz/v1/models",
            fireworks: "https://api.fireworks.ai/inference/v1/models",
            cerebras: "https://api.cerebras.ai/v1/models",
            cohere: "https://api.cohere.ai/v1/models",
            nebius: "https://api.studio.nebius.ai/v1/models",
            siliconflow: "https://api.siliconflow.cn/v1/models",
            hyperbolic: "https://api.hyperbolic.xyz/v1/models",
            mimo: "https://api.mioffice.cn/v1/models",
            ollama: "https://ollama.com/api/tags",
            "ollama-local": `${resolveOllamaLocalHost({ providerSpecificData })}/api/tags`,
            assemblyai: "https://api.assemblyai.com/v1/account",
            nanobanana: "https://api.nanobananaapi.ai/v1/models",
            chutes: "https://llm.chutes.ai/v1/models",
            nvidia: "https://integrate.api.nvidia.com/v1/models",
          };
          const headers: Record<string, string> = {};
          if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
          const res = await fetch(endpoints[provider], { headers });
          isValid = res.ok;
          break;
        }

        case "opencode-go": {
          const res = await fetch("https://opencode.ai/zen/go/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: getDefaultModel("opencode-go"),
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 1,
              stream: false,
            }),
          });
          isValid = res.status !== 401 && res.status !== 403;
          break;
        }

        case "opencode-zen": {
          const res = await fetch("https://opencode.ai/zen/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "x-opencode-client": "desktop" },
            body: JSON.stringify({
              model: getDefaultModel("opencode-zen"),
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 1,
              stream: false,
            }),
          });
          isValid = res.status !== 401 && res.status !== 403;
          break;
        }

        case "deepgram": {
          const res = await fetch("https://api.deepgram.com/v1/projects", {
            headers: { Authorization: `Token ${apiKey}` },
          });
          isValid = res.ok;
          break;
        }

        case "blackbox": {
          const res = await fetch("https://api.blackbox.ai/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o",
              messages: [{ role: "user", content: "test" }],
              max_tokens: 10,
            }),
          });
          isValid = res.status === 200 || res.status === 400;
          break;
        }

        case "vertex": {
          const saJson = parseServiceAccountKey(apiKey);
          if (saJson) {
            isValid = !!(saJson.client_email && saJson.private_key && saJson.project_id);
          } else {
            const probeRes = await fetch(
              `https://aiplatform.googleapis.com/v1/publishers/google/models/__probe__:generateContent?key=${apiKey}`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
            );
            isValid = probeRes.status !== 401 && probeRes.status !== 403;
          }
          break;
        }

        case "vertex-partner": {
          const saJson = parseServiceAccountKey(apiKey);
          if (saJson) {
            isValid = !!(saJson.client_email && saJson.private_key && saJson.project_id);
          } else {
            const probeRes = await fetch(
              `https://aiplatform.googleapis.com/v1/publishers/google/models/__probe__:generateContent?key=${apiKey}`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
            );
            isValid = probeRes.status !== 401 && probeRes.status !== 403;
          }
          break;
        }

        case "grok-web": {
          const token = apiKey.startsWith("sso=") ? apiKey.slice(4) : apiKey;
          const randomHex = (n: number) => {
            const a = new Uint8Array(n);
            crypto.getRandomValues(a);
            return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
          };
          const statsigId = Buffer.from("e:TypeError: Cannot read properties of null (reading 'children')").toString("base64");
          const traceId = randomHex(16);
          const spanId = randomHex(8);
          const res = await fetch("https://grok.com/rest/app-chat/conversations/new", {
            method: "POST",
            headers: {
              Accept: "*/*",
              "Accept-Encoding": "gzip, deflate, br, zstd",
              "Accept-Language": "en-US,en;q=0.9",
              "Cache-Control": "no-cache",
              "Content-Type": "application/json",
              Cookie: `sso=${token}`,
              Origin: "https://grok.com",
              Pragma: "no-cache",
              Referer: "https://grok.com/",
              "Sec-Ch-Ua": '"Google Chrome";v="136", "Chromium";v="136", "Not(A:Brand";v="24"',
              "Sec-Ch-Ua-Mobile": "?0",
              "Sec-Ch-Ua-Platform": '"macOS"',
              "Sec-Fetch-Dest": "empty",
              "Sec-Fetch-Mode": "cors",
              "Sec-Fetch-Site": "same-origin",
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
              "x-statsig-id": statsigId,
              "x-xai-request-id": crypto.randomUUID(),
              traceparent: `00-${traceId}-${spanId}-00`,
            },
            body: JSON.stringify({
              temporary: true,
              modelName: "grok-4",
              modelMode: "MODEL_MODE_GROK_4",
              message: "ping",
              fileAttachments: [],
              imageAttachments: [],
              disableSearch: false,
              enableImageGeneration: false,
              returnImageBytes: false,
              returnRawGrokInXaiRequest: false,
              enableImageStreaming: false,
              imageGenerationCount: 0,
              forceConcise: false,
              toolOverrides: {},
              enableSideBySide: true,
              sendFinalMetadata: true,
              isReasoning: false,
              disableTextFollowUps: true,
              disableMemory: true,
              forceSideBySide: false,
              isAsyncChat: false,
              disableSelfHarmShortCircuit: false,
            }),
          });
          if (res.status === 401 || res.status === 403) {
            isValid = false;
            error = "Invalid SSO cookie — re-paste from grok.com DevTools → Cookies → sso";
          } else {
            isValid = true;
          }
          break;
        }

        case "perplexity-web": {
          let sessionToken = apiKey;
          if (sessionToken.startsWith("__Secure-next-auth.session-token=")) {
            sessionToken = sessionToken.slice("__Secure-next-auth.session-token=".length);
          }
          const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
          const res = await fetch("https://www.perplexity.ai/rest/sse/perplexity_ask", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              Origin: "https://www.perplexity.ai",
              Referer: "https://www.perplexity.ai/",
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
              "X-App-ApiClient": "default",
              "X-App-ApiVersion": "2.18",
              Cookie: `__Secure-next-auth.session-token=${sessionToken}`,
            },
            body: JSON.stringify({
              query_str: "ping",
              params: {
                query_str: "ping",
                search_focus: "internet",
                mode: "concise",
                model_preference: "pplx_pro",
                sources: ["web"],
                attachments: [],
                frontend_uuid: crypto.randomUUID(),
                frontend_context_uuid: crypto.randomUUID(),
                version: "2.18",
                language: "en-US",
                timezone: tz,
                search_recency_filter: null,
                is_incognito: true,
                use_schematized_api: true,
                last_backend_uuid: null,
              },
            }),
          });
          if (res.status === 401 || res.status === 403) {
            isValid = false;
            error = "Invalid session cookie — re-paste __Secure-next-auth.session-token from perplexity.ai";
          } else {
            isValid = true;
          }
          break;
        }

        default:
          return NextResponse.json({ error: "Provider validation not supported" }, { status: 400 });
      }
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : String(err);
      isValid = false;
    }

    return NextResponse.json({
      valid: isValid,
      error: isValid ? null : error || "Invalid API key",
    });
  } catch (error: unknown) {
    console.log("Error validating API key:", error);
    return NextResponse.json({ error: "Validation failed" }, { status: 500 });
  }
}
