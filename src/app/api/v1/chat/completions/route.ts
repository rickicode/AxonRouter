/**
 * POST /v1/chat/completions - OpenAI chat completions format
 */
import { createV1RouteHandler } from "@/app/api/v1/_sharedRouteHandler";
import { maybeDispatchMorphV1Request } from "@/app/api/v1/_morphRoute";

const { POST, OPTIONS } = createV1RouteHandler({
  morphDispatcher: (request) =>
    maybeDispatchMorphV1Request({
      req: request,
      capability: "apply",
      requestLabel: "morph:v1-chat-completions",
    }),
  label: "chat-completions",
});

export { POST, OPTIONS };
