// OpenAI-compatible adapter (used by openai, minimax, openrouter, recraft)
import { PROVIDER_MEDIA } from "../../providers/index.js";

const imageCfg = (id) => PROVIDER_MEDIA[id]?.imageConfig || {};
const imageUrl = (id) => imageCfg(id).baseUrl;

export default function createOpenAIAdapter(providerId) {
  const cfg = imageCfg(providerId);
  return {
    buildUrl: () => imageUrl(providerId),
    buildHeaders: (creds) => {
      const headers = { "Content-Type": "application/json", ...(cfg.headers || {}) };
      const key = creds?.apiKey || creds?.accessToken;
      if (key) headers["Authorization"] = `Bearer ${key}`;
      return headers;
    },
    buildBody: (model, body) => {
      const isUnikey = providerId === "unikey";
      const isUnikeyGemini = isUnikey && /^google\/gemini-/i.test(model);
      const isAuto = (v) => typeof v === "string" && v.toLowerCase() === "auto";
      const { prompt, n = 1, size: rawSize = "1024x1024", quality, style, response_format, aspect_ratio } = body;
      const size = isUnikey && isAuto(rawSize) ? "1024x1024" : rawSize;
      const full = { model, prompt, n, size };
      if (aspect_ratio && !isAuto(aspect_ratio) && !isUnikeyGemini) full.aspect_ratio = aspect_ratio;
      if (quality && !(isUnikey && isAuto(quality))) full.quality = quality;
      if (style && !(isUnikey && isAuto(style))) full.style = style;
      if (body.background && !(isUnikey && isAuto(body.background))) full.background = body.background;
      if (response_format) full.response_format = response_format;
      // bodyFields whitelist (e.g. xAI accepts only model/prompt/n/response_format)
      if (Array.isArray(cfg.bodyFields)) {
        const req = {};
        for (const f of cfg.bodyFields) if (full[f] !== undefined) req[f] = full[f];
        return req;
      }
      return full;
    },
    normalize: (responseBody) => responseBody,
  };
}
