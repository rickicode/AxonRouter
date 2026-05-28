import { BaseExecutor } from "./base";
import { PROVIDERS } from "../config/providers";
import { getModelTargetFormat } from "../config/providerModels";

const BASE = "https://opencode.ai/zen/v1";

export class OpenCodeExecutor extends BaseExecutor {
  constructor() {
    super("opencode", PROVIDERS.opencode);
  }

  buildUrl(model) {
    const targetFormat = getModelTargetFormat("oc", model);
    return targetFormat === "claude"
      ? `${BASE}/messages`
      : `${BASE}/chat/completions`;
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
