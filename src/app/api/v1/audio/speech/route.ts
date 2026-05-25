import { instrumentV1Request } from "@/lib/observability/otel";

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/** POST /v1/audio/speech - OpenAI-compatible TTS endpoint */
export async function POST(request) {
  return instrumentV1Request(request, "audio-speech", async () => {
    const { handleTts } = await import("@/sse/handlers/tts");
    return await handleTts(request);
  });
}
