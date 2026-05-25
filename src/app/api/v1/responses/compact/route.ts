import {
  getCachedSettings,
  instrumentV1Request,
} from "@/lib/observability/otel";
import { dispatchMorphCapability } from "@/app/api/morph/_dispatch";
import { getConfiguredMorphSettings } from "@/app/api/morph/_shared";
import { initTranslators } from "../../../../../../open-sse/translator/index";
import {
  extractApiKey,
  isValidApiKey,
  hasApiKeys,
} from "@/sse/services/apiKeyAuth";

const ANSI_BRIGHT_BLUE = "\x1b[94m";
const ANSI_RESET = "\x1b[0m";

let initialized = false;

function hasUsableMorphKey(morphSettings) {
  return Boolean(
    morphSettings?.baseUrl &&
    Array.isArray(morphSettings.apiKeys) &&
    morphSettings.apiKeys.some(
      (entry) =>
        entry?.key && entry.status !== "inactive" && entry.isExhausted !== true,
    ),
  );
}

async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/**
 * POST /v1/responses/compact - Compact conversation context
 * Prefer Morph native compact when usable Morph keys exist; otherwise reuse the
 * existing provider/model compact pipeline as a fallback.
 */
export async function POST(request) {
  return instrumentV1Request(request, "responses-compact", async () => {
    const apiKey = extractApiKey(request);
    const keysConfigured = await hasApiKeys();
    if (keysConfigured && !apiKey)
      return new Response(
        JSON.stringify({
          error: { message: "Missing API key", type: "auth_error" },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    if (keysConfigured && apiKey && !(await isValidApiKey(apiKey)))
      return new Response(
        JSON.stringify({
          error: { message: "Invalid API key", type: "auth_error" },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );

    await ensureInitialized();
    const cachedSettings = getCachedSettings();
    const cachedMorphSettings = cachedSettings?.morph;
    const morphSettings =
      cachedMorphSettings?.baseUrl &&
      Array.isArray(cachedMorphSettings.apiKeys) &&
      cachedMorphSettings.apiKeys.length > 0
        ? cachedMorphSettings
        : await getConfiguredMorphSettings();

    if (hasUsableMorphKey(morphSettings)) {
      console.log(
        `${ANSI_BRIGHT_BLUE}[COMPACT] /v1/responses/compact -> Morph native /v1/compact${ANSI_RESET}`,
      );
      return dispatchMorphCapability({
        capability: "compact",
        req: request,
        morphSettings,
        upstreamTarget: { method: "POST", path: "/v1/compact" },
        requestLabel: "morph:/v1/compact",
      });
    }

    console.log(
      `${ANSI_BRIGHT_BLUE}[COMPACT] /v1/responses/compact -> provider/model fallback${ANSI_RESET}`,
    );
    const body = await request.json().catch(() => null);
    if (!body) {
      return Response.json(
        {
          error: {
            message: "Invalid JSON body",
            type: "invalid_request_error",
          },
        },
        { status: 400 },
      );
    }
    body._compact = true;
    const newRequest = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(body),
    });
    const { handleChat } = await import("@/sse/handlers/chat");
    return await handleChat(newRequest);
  });
}
