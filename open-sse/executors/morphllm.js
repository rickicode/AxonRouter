import { DefaultExecutor } from "./default.js";
import { abortableSleep } from "./base.js";

// Morph Free Tier RPM limit: 5 requests per 60 seconds rolling window per API key
const MORPH_RPM_LIMIT = 5;
const MORPH_WINDOW_MS = 60 * 1000;
const requestWindows = new Map(); // apiKey -> Array<number>

function cleanKeyWindow(key) {
  if (!key) return null;
  let window = requestWindows.get(key);
  if (!window) {
    window = [];
    requestWindows.set(key, window);
  }
  const now = Date.now();
  while (window.length > 0 && now - window[0] > MORPH_WINDOW_MS) {
    window.shift();
  }
  return window;
}

export class MorphExecutor extends DefaultExecutor {
  constructor() {
    super("morphllm");
  }

  async execute(args) {
    const key = args.credentials?.apiKey || args.credentials?.connectionId || "default";
    const window = cleanKeyWindow(key);

    if (window && window.length >= MORPH_RPM_LIMIT) {
      const now = Date.now();
      const oldest = window[0];
      const waitMs = (oldest + MORPH_WINDOW_MS) - now;
      if (waitMs > 0) {
        // If wait time is small (<= 4000ms), smooth the dispatch to avoid tripping 429
        if (waitMs <= 4000) {
          args.log?.info?.("MORPH", `Smoothing request: waiting ${waitMs}ms to respect 5 RPM limit`);
          await abortableSleep(waitMs + 100, args.signal);
        } else {
          // Window congested: fail fast with 429 so combo can fall back to another provider
          args.log?.warn?.("MORPH", `Rate limit guard: 5 req/min window full. Fast failover in ${Math.ceil(waitMs / 1000)}s`);
          const err = new Error(`Morph rate limit: 5 requests/min exceeded. Retry after ${Math.ceil(waitMs / 1000)}s`);
          err.status = 429;
          err.retryAfterMs = Date.now() + waitMs;
          throw err;
        }
      }
    }

    let outcome;
    try {
      outcome = await super.execute(args);
    } catch (e) {
      if (e.status === 429 || /rate limit|slow down/i.test(e.message || "")) {
        // Saturate window on 429 to protect following requests for 15s
        if (window) {
          const now = Date.now();
          while (window.length < MORPH_RPM_LIMIT) {
            window.push(now);
          }
        }
      }
      throw e;
    }

    if (outcome?.response?.ok) {
      if (window) window.push(Date.now());
    } else if (outcome?.response?.status === 429) {
      if (window) {
        const now = Date.now();
        while (window.length < MORPH_RPM_LIMIT) {
          window.push(now);
        }
      }
    }

    return outcome;
  }
}
