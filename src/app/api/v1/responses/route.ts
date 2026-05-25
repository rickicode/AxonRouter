import { instrumentV1Request } from "@/lib/observability/otel";
import { maybeDispatchMorphResponsesRequest } from "@/app/api/v1/_morphResponses";
import { initTranslators } from "../../../../../open-sse/translator/index";

// Shared translator initialization guard - prevents race condition on cold start
let translatorInitPromise = null;

async function ensureInitialized() {
  if (translatorInitPromise) return translatorInitPromise;

  translatorInitPromise = (async () => {
    await initTranslators();
    console.log("[SSE] Translators initialized for /v1/responses");
  })();

  return translatorInitPromise;
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
 * POST /v1/responses - OpenAI Responses API format
 * Now handled by translator pattern (openai-responses format auto-detected)
 */
export async function POST(request) {
  return instrumentV1Request(request, "responses", async () => {
    try {
      const morphResponse = await maybeDispatchMorphResponsesRequest(request);
      if (morphResponse) {
        return morphResponse;
      }

      await ensureInitialized();
      const { handleChat } = await import("@/sse/handlers/chat");
      return await handleChat(request);
    } catch (error) {
      return Response.json(
        {
          error: error?.message || "Morph responses bridge failed",
          code: error?.code || null,
        },
        { status: error?.status || 500 },
      );
    }
  });
}
