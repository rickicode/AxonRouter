import { instrumentV1Request } from "@/lib/observability/otel";
import {
  buildCorrelationId,
  dispatchUnifiedModality,
} from "@/lib/routing/unifiedContract";
import { validateUnifiedRequestBody } from "@/lib/routing/unifiedValidation";
import {
  extractApiKey,
  isValidApiKey,
  hasApiKeys,
} from "@/sse/services/apiKeyAuth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function OPTIONS() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function POST(request) {
  return instrumentV1Request(request, "unified", async () => {
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

    let body;
    try {
      body = await request.clone().json();
    } catch {
      return Response.json(
        { error: "Invalid JSON body", code: "invalid_json" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const validation = validateUnifiedRequestBody(body);
    if (!validation.ok) {
      return Response.json(
        { error: validation.error, code: validation.code },
        { status: validation.status, headers: CORS_HEADERS },
      );
    }

    const mode = validation.mode;
    const correlationId = buildCorrelationId();
    const response = await dispatchUnifiedModality({
      request,
      mode,
      correlationId,
      requestBody: body,
    });
    const headers = new Headers(response.headers);
    Object.entries(CORS_HEADERS).forEach(([key, value]) =>
      headers.set(key, value),
    );
    return new Response(response.body, { status: response.status, headers });
  });
}
