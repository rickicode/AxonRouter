import { instrumentV1Request } from "@/lib/observability/otel";
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
  return instrumentV1Request(request, "video-generations", async () => {
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

    const body = await request.json().catch(() => null);
    if (!body) {
      return Response.json(
        { error: "Invalid JSON body", code: "invalid_json" },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    if (!body.model) {
      return Response.json(
        { error: "Missing required field: model", code: "missing_model" },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    if (!body.prompt) {
      return Response.json(
        { error: "Missing required field: prompt", code: "missing_prompt" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    return Response.json(
      {
        created: Math.floor(Date.now() / 1000),
        data: [
          {
            object: "video.generation",
            status: "accepted",
            message: "Video generation baseline route accepted the request.",
            prompt: body.prompt,
            model: body.model,
          },
        ],
      },
      { headers: CORS_HEADERS },
    );
  });
}
