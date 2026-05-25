import { instrumentV1Request } from "@/lib/observability/otel";
import { handleStt } from "@/sse/handlers/stt";

export const maxDuration = 300;

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export async function POST(request) {
  return instrumentV1Request(request, "audio-transcriptions", async () => {
    return await handleStt(request);
  });
}
