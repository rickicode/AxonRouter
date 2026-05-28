import { BaseExecutor } from "./base";
import { PROVIDERS } from "../config/providers";

// Models that use /zen/provider/v1/messages (Anthropic/Claude format)
const CLAUDE_FORMAT_MODELS = new Set([
  "minimax-m2.5", "qwen3.6-plus",
]);

const BASE = "https://opencode.ai/zen/provider/v1";

export class OpenCodeProviderExecutor extends BaseExecutor {
  constructor() {
    super("opencode-provider", PROVIDERS["opencode-provider"]);
  }

  buildUrl(model) {
    return CLAUDE_FORMAT_MODELS.has(model)
      ? `${BASE}/messages`
      : `${BASE}/chat/completions`;
  }

  buildHeaders(credentials, stream = true, model?: string) {
    const key = credentials?.apiKey || credentials?.accessToken;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (model && CLAUDE_FORMAT_MODELS.has(model)) {
      headers["x-api-key"] = key;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = `Bearer ${key}`;
    }

    headers["x-opencode-client"] = "desktop";
    if (stream) headers["Accept"] = "text/event-stream";
    return headers;
  }
}
