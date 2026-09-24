import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../providers/index.js";

/**
 * LLM Tech Free executor — preserves the hardcoded trial Authorization header
 * from the registry and only overrides it with a user-supplied key (BYOK).
 *
 * DefaultExecutor.buildHeaders() would call applyAuth() which overwrites the
 * registry trial key with "Bearer public" (the virtual noauth token), causing
 * upstream 401s. This executor skips applyAuth for the default case.
 */
export class LlmTechFreeExecutor extends BaseExecutor {
  constructor() {
    super("llmtech-free", PROVIDERS["llmtech-free"]);
  }

  buildHeaders(credentials, stream = true) {
    const headers = {
      "Content-Type": "application/json",
      ...this.config.headers, // preserves the hardcoded trial Authorization
    };

    // BYOK: only override when the user supplied a real key (not the virtual
    // "public" token from the noAuth credential synthesis path).
    if (credentials?.apiKey && credentials.apiKey !== "public") {
      headers["Authorization"] = `Bearer ${credentials.apiKey}`;
    }

    if (stream) headers["Accept"] = "text/event-stream";
    return headers;
  }

  parseError(response, bodyText) {
    const status = response?.status || 0;
    const text = String(bodyText || "");

    if (status === 401) {
      return {
        status,
        message: "Trial key rejected or expired. Change the key at dashboard → LLM Tech Free → Trial Key.",
      };
    }

    // 429: concurrency limit (2 concurrent for trial)
    if (status === 429) {
      return {
        status,
        message: text.slice(0, 300) || "LLM Tech concurrency limit (trial: 2 concurrent). Retry after the Retry-After header.",
        poolScoped: { reason: "concurrency-limit" },
      };
    }

    return {
      status,
      message: text.slice(0, 300) || `HTTP ${status}`,
    };
  }
}

export default LlmTechFreeExecutor;
