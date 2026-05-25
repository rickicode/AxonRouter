import { instrumentV1Request } from "@/lib/observability/otel";
import { handleEmbeddings } from "@/sse/handlers/embeddings";

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/**
 * POST /v1/embeddings - OpenAI-compatible embeddings endpoint
 *
 * Note: Morph embeddings have been removed in favor of WarpGrep, which
 * handles retrieval, ranking, and file reading in a single call.
 */
export async function POST(request) {
  return instrumentV1Request(request, "embeddings", async () => {
    return await handleEmbeddings(request);
  });
}
