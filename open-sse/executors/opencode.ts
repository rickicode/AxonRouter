import { BaseExecutor } from "./base";
import { PROVIDERS } from "../config/providers";

// Models that use /zen/v1/messages (claude format)
const MESSAGES_MODELS = new Set(["minimax-m2.5-free"]);

export class OpenCodeExecutor extends BaseExecutor {
  constructor() {
    super("opencode", PROVIDERS.opencode);
  }

  buildUrl(model) {
    const base = "https://opencode.ai";
    return MESSAGES_MODELS.has(model)
      ? `${base}/zen/v1/messages`
      : `${base}/zen/v1/chat/completions`;
  }

  buildHeaders() {
    return {
      "Content-Type": "application/json",
      "Authorization": "Bearer public",
      "x-opencode-client": "desktop",
      "Accept": "text/event-stream"
    };
  }
}
