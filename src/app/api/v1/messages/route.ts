import { instrumentV1Request } from "@/lib/observability/otel";
import { maybeDispatchMorphMessagesRequest } from "@/app/api/v1/_morphMessages";

// Shared translator initialization guard - prevents race condition on cold start
let translatorInitPromise = null;

/**
 * Initialize translators once with race condition protection
 */
async function ensureInitialized() {
  if (translatorInitPromise) return translatorInitPromise;

  translatorInitPromise = (async () => {
    const { initTranslators } =
      await import("../../../../../open-sse/translator/index");
    await initTranslators();
    console.log("[SSE] Translators initialized for /v1/messages");
  })();

  return translatorInitPromise;
}

/**
 * Handle CORS preflight
 */
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
 * POST /v1/messages - Claude format (auto convert via handleChat)
 */
export async function POST(request) {
  return instrumentV1Request(request, "messages", async () => {
    try {
      const morphResponse = await maybeDispatchMorphMessagesRequest(request);
      if (morphResponse) {
        return morphResponse;
      }

      await ensureInitialized();
      const { handleChat } = await import("@/sse/handlers/chat");
      return await handleChat(request);
    } catch (error) {
      return Response.json(
        {
          error: error?.message || "Morph messages bridge failed",
          code: error?.code || null,
        },
        { status: error?.status || 500 },
      );
    }
  });
}
