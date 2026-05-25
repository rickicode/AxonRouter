/**
 * Shared route handler for /v1/* endpoints
 * Prevents code duplication across multiple route files
 *
 * Usage:
 *   import { createV1RouteHandler } from "@/app/api/v1/_sharedRouteHandler";
 *   import { maybeDispatchMorphV1Request } from "@/app/api/v1/_morphRoute";
 *
 *   const handler = createV1RouteHandler({
 *     morphDispatcher: maybeDispatchMorphV1Request,
 *     label: 'chat-completions'
 *   });
 *
 *   export const POST = handler.POST;
 *   export const OPTIONS = handler.OPTIONS;
 */

import { measureRouting } from "@/lib/routingLatency";
import { instrumentV1Request } from "@/lib/observability/otel";
import { initTranslators } from "../../../../open-sse/translator/index";

type MorphDispatcher = (request: Request) => Promise<Response | null>;
type ChatHandlerModule = typeof import("@/sse/handlers/chat");

type CreateV1RouteHandlerOptions = {
  morphDispatcher?: MorphDispatcher;
  label?: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

let chatHandlerModulePromise: Promise<ChatHandlerModule> | null = null;

async function loadChatHandlerModule(): Promise<ChatHandlerModule> {
  if (!chatHandlerModulePromise) {
    chatHandlerModulePromise = import("@/sse/handlers/chat");
  }
  return chatHandlerModulePromise;
}

// Shared translator initialization guard - prevents race condition on cold start
// Single promise shared across all v1 routes
let translatorInitPromise: Promise<void> | null = null;

/**
 * Initialize translators once with race condition protection
 */
async function ensureInitialized() {
  if (translatorInitPromise) return translatorInitPromise;

  translatorInitPromise = (async () => {
    await initTranslators();
    console.log("[SSE] Translators initialized");
  })();

  return translatorInitPromise;
}

/**
 * Handle CORS preflight
 */
async function handleOptions(): Promise<Response> {
  return new Response(null, {
    headers: CORS_HEADERS,
  });
}

/**
 * Handle POST request with optional Morph dispatcher
 */
async function routePrimaryRequest(
  request: Request,
  morphDispatcher: MorphDispatcher | null,
): Promise<Response> {
  if (morphDispatcher) {
    const morphResponse = await morphDispatcher(request);
    if (morphResponse) return morphResponse;
  }

  await ensureInitialized();
  const { handleChat } = await loadChatHandlerModule();
  return await handleChat(request);
}

async function handlePost(
  request: Request,
  morphDispatcher: MorphDispatcher | null = null,
  label: string | null = null,
): Promise<Response> {
  try {
    return await instrumentV1Request(request, label || "v1", () =>
      measureRouting(() => routePrimaryRequest(request, morphDispatcher), {
        providerId: label || "v1",
      }),
    );
  } catch (error: any) {
    console.error(
      `[v1/${label || "unknown"}] Error:`,
      error?.message || String(error),
    );
    return Response.json(
      {
        error: error?.message || "Request failed",
        code: error?.code || null,
      },
      {
        status: error?.status || 500,
        headers: CORS_HEADERS,
      },
    );
  }
}

/**
 * Create route handler with optional Morph dispatcher
 */
export function createV1RouteHandler(
  options: CreateV1RouteHandlerOptions = {},
) {
  const { morphDispatcher = null, label = "unknown" } = options;

  return {
    async OPTIONS() {
      return handleOptions();
    },

    async POST(request: Request) {
      return handlePost(request, morphDispatcher, label);
    },
  };
}

// Export handlers directly for simple use cases
export const BASE_OPTIONS = handleOptions;
export async function BASE_POST(request: Request): Promise<Response> {
  try {
    return await measureRouting(
      async () => {
        await ensureInitialized();
        const { handleChat } = await loadChatHandlerModule();
        return await handleChat(request);
      },
      { providerId: "v1" },
    );
  } catch (error: any) {
    console.error("[v1/base] Error:", error?.message || String(error));
    return Response.json(
      {
        error: error?.message || "Request failed",
        code: error?.code || null,
      },
      {
        status: error?.status || 500,
        headers: CORS_HEADERS,
      },
    );
  }
}
