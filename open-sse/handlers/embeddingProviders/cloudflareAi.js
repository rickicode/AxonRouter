import { bearerAuth } from "./_base.js";

const BASE = "https://api.cloudflare.com/client/v4/accounts";

export default {
  buildUrl: (_model, creds) => {
    const customBase = creds?.providerSpecificData?.baseUrl;
    if (customBase) return String(customBase).trim().replace(/\/$/, "");
    const accountId = creds?.providerSpecificData?.accountId || creds?.accountId;
    if (!accountId) throw new Error("cloudflare-ai requires accountId in providerSpecificData");
    return `${BASE}/${accountId}/ai/v1/embeddings`;
  },
  buildHeaders: (creds) => ({ "Content-Type": "application/json", ...bearerAuth(creds) }),
  buildBody: (model, { input, encoding_format, dimensions }) => {
    const body = { model, input };
    if (encoding_format) body.encoding_format = encoding_format;
    if (dimensions != null && dimensions !== "") {
      const dim = Number(dimensions);
      if (Number.isFinite(dim) && dim > 0) body.dimensions = dim;
    }
    return body;
  },
  normalize: (responseBody, model, { input } = {}) => {
    if (!responseBody || typeof responseBody !== "object") return responseBody;

    let items = [];
    const isStandard = responseBody.object === "list" && Array.isArray(responseBody.data);

    if (isStandard) {
      items = responseBody.data;
    } else {
      const raw = responseBody.result || responseBody;
      const rawData = raw.data ?? raw.embeddings;

      if (Array.isArray(rawData)) {
        if (rawData.length > 0 && Array.isArray(rawData[0])) {
          items = rawData.map((vec, idx) => ({
            object: "embedding",
            index: idx,
            embedding: vec,
          }));
        } else if (rawData.length > 0 && typeof rawData[0] === "number") {
          items = [{
            object: "embedding",
            index: 0,
            embedding: rawData,
          }];
        } else if (rawData.length > 0 && typeof rawData[0] === "object") {
          items = rawData.map((item, idx) => ({
            object: "embedding",
            index: item.index ?? idx,
            embedding: item.embedding || item.values || item,
          }));
        }
      }
    }

    let usage = responseBody.usage;
    const promptTokens = usage?.prompt_tokens ?? usage?.input_tokens;
    if (!Number.isSafeInteger(promptTokens) || promptTokens <= 0) {
      const parts = Array.isArray(input) ? input : [input];
      const chars = parts.reduce((n, t) => {
        if (typeof t === "string") return n + t.length;
        if (Array.isArray(t)) return n + t.length;
        return n + JSON.stringify(t ?? "").length;
      }, 0);
      const estTokens = Math.max(1, Math.ceil(chars / 4));
      usage = {
        prompt_tokens: estTokens,
        total_tokens: estTokens,
        estimated: true,
      };
    }

    return {
      object: "list",
      data: items,
      model: responseBody.model || model,
      usage,
    };
  },
};
