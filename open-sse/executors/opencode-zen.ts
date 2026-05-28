import { BaseExecutor } from "./base";
import { PROVIDERS } from "../config/providers";
import { getModelTargetFormat } from "../config/providerModels";

const BASE = "https://opencode.ai/zen/v1";

export class OpenCodeZenExecutor extends BaseExecutor {
  constructor() {
    super("opencode-zen", PROVIDERS["opencode-zen"]);
  }

  buildUrl(model) {
    const targetFormat = getModelTargetFormat("opencode-zen", model);
    return targetFormat === "claude"
      ? `${BASE}/messages`
      : `${BASE}/chat/completions`;
  }

  buildHeaders(credentials, stream = true, model?: string) {
    const key = credentials?.apiKey || credentials?.accessToken;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    const targetFormat = model ? getModelTargetFormat("opencode-zen", model) : null;
    if (targetFormat === "claude") {
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
