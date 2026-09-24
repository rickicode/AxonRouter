import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../providers/index.js";

const IP_LIMIT_PATTERNS = [
  /rate[_\s-]?limit/i,
  /too\s+many\s+requests/i,
  /temporarily\s+rate-limited/i,
  /200\s+requests\s+per\s+hour/i,
  /limit_source/i,
  /upstream_provider_shared_pool/i,
];

function isIpLimit(status, text) {
  if (status === 429) return true;
  return IP_LIMIT_PATTERNS.some((re) => re.test(text));
}

export class KiloCodeFreeExecutor extends BaseExecutor {
  constructor() {
    super("kilocode-free", PROVIDERS["kilocode-free"]);
  }

  buildUrl(_model, _stream, urlIndex = 0) {
    const baseUrls = this.getBaseUrls();
    return baseUrls[urlIndex] || baseUrls[0] || "https://api.kilo.ai/api/gateway/chat/completions";
  }

  buildHeaders(credentials, stream = true) {
    const headers = {
      "Content-Type": "application/json",
      "Accept": stream ? "text/event-stream" : "application/json",
      ...this.config.headers,
    };

    // noAuth free tier rejects any Authorization header, including the
    // virtual "public" token. A real user key is opt-in only.
    if (credentials?.apiKey && credentials.apiKey !== "public") {
      headers["Authorization"] = `Bearer ${credentials.apiKey}`;
    }

    return headers;
  }

  transformRequest(model, body, stream) {
    const out = { ...body };
    // Include usage in the final stream chunk if streaming
    if (stream && !out.stream_options) {
      out.stream_options = { include_usage: true };
    }
    return out;
  }

  parseError(response, bodyText) {
    const status = response?.status || 0;
    const text = String(bodyText || "");

    // 401 on paid model access: provide friendly guidance
    if (status === 401 && (text.includes("PAID_MODEL_AUTH_REQUIRED") || text.includes("sign in to use this model"))) {
      return {
        status,
        message: "This model requires authentication on Kilo Gateway. Kilo Code Free only supports free models (kilo-auto/free, :free models).",
      };
    }

    // Rate limits (429 or IP limit messages):
    // Kilo Gateway free tier is unauthenticated and rate-limited per IP (200 req/hr).
    // Mark poolScoped so chatCore rotates proxy pools without penalizing the account.
    if (isIpLimit(status, text)) {
      return {
        status,
        message: text.slice(0, 300) || `Kilo Gateway free IP rate limit (${status})`,
        poolScoped: { reason: "ip-limit" },
      };
    }

    return {
      status,
      message: text.slice(0, 300) || `HTTP ${status}`,
    };
  }
}

export default KiloCodeFreeExecutor;
