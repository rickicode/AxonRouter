import { BaseExecutor } from "./base";
import { PROVIDERS } from "../config/providers";

// Models that use /zen/v1/messages (Anthropic/Claude format)
const CLAUDE_FORMAT_MODELS = new Set([
  "minimax-m2.7", "minimax-m2.5", "minimax-m2.5-free",
  "qwen3.6-plus", "qwen3.5-plus", "qwen3.6-plus-free",
]);

const BASE = "https://opencode.ai/zen/v1";

export class OpenCodeZenExecutor extends BaseExecutor {
  _lastModel: string | null;

  constructor() {
    super("opencode-zen", PROVIDERS["opencode-zen"]);
    this._lastModel = null;
  }

  buildUrl(model) {
    this._lastModel = model;
    return CLAUDE_FORMAT_MODELS.has(model)
      ? `${BASE}/messages`
      : `${BASE}/chat/completions`;
  }

  buildHeaders(credentials, stream = true) {
    const key = credentials?.apiKey || credentials?.accessToken;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (CLAUDE_FORMAT_MODELS.has(this._lastModel!)) {
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
