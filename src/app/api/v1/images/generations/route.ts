import { instrumentV1Request } from "@/lib/observability/otel";
import { handleImageGeneration } from "@/sse/handlers/imageGeneration";

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/** POST /v1/images/generations - OpenAI-compatible image generation endpoint */
export async function POST(request) {
  return instrumentV1Request(request, "images-generations", async () => {
    return await handleImageGeneration(request);
  });
}
