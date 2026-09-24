import { handleVideoGet } from "@/sse/handlers/videoGeneration.js";

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/** GET /v1/videos/{id}/content - fetch binary video content */
export async function GET(request, { params }) {
  const { id } = await params;
  return await handleVideoGet(request, id, { content: true });
}
