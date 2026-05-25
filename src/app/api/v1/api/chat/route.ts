import { instrumentV1Request } from "@/lib/observability/otel";
import { transformToOllama } from "../../../../../../open-sse/utils/ollamaTransform";

let translatorInitPromise: Promise<void> | null = null;
let chatHandlerPromise: Promise<typeof import("@/sse/handlers/chat")> | null =
  null;

async function ensureInitialized() {
  if (!translatorInitPromise) {
    translatorInitPromise =
      import("../../../../../../open-sse/translator/index").then(
        async ({ initTranslators }) => {
          await initTranslators();
          console.log("[SSE] Translators initialized");
        },
      );
  }

  await translatorInitPromise;
}

async function getChatHandler() {
  chatHandlerPromise ??= import("@/sse/handlers/chat");
  return (await chatHandlerPromise).handleChat;
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

export async function POST(request) {
  return instrumentV1Request(request, "api-chat", async () => {
    await ensureInitialized();

    const clonedReq = request.clone();
    let modelName = "llama3.2";
    try {
      const body = await clonedReq.json();
      modelName = body.model || "llama3.2";
    } catch {}

    const handleChat = await getChatHandler();
    const response = await handleChat(request);
    return transformToOllama(response, modelName);
  });
}
