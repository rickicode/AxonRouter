import { instrumentV1Request } from "@/lib/observability/otel";
import {
  UNIFIED_MODALITIES,
  UNIFIED_MODALITY_ENDPOINT,
} from "@/lib/routing/unifiedContract";
import {
  extractApiKey,
  isValidApiKey,
  hasApiKeys,
} from "@/sse/services/apiKeyAuth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, { headers: CORS_HEADERS });
}

/**
 * GET /v1 - Return models list (OpenAI compatible) and unified routing metadata
 */
export async function GET(request: Request) {
  return instrumentV1Request(request, "", async () => {
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

    const models = [
      {
        id: "claude-sonnet-4-20250514",
        object: "model",
        owned_by: "anthropic",
      },
      {
        id: "claude-3-5-sonnet-20241022",
        object: "model",
        owned_by: "anthropic",
      },
      { id: "gpt-4o", object: "model", owned_by: "openai" },
      { id: "gemini-2.5-pro", object: "model", owned_by: "google" },
    ];

    return new Response(
      JSON.stringify({
        object: "list",
        data: models,
        unified: {
          endpoint: UNIFIED_MODALITY_ENDPOINT,
          modes: Object.values(UNIFIED_MODALITIES).map((mode) => ({
            mode: mode.mode,
            targetPath: mode.targetPath,
            capability: mode.capability,
            requestFields: mode.requestFields,
            responseShape: mode.responseShape,
          })),
        },
      }),
      {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      },
    );
  });
}
