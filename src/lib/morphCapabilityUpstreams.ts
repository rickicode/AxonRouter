export const MORPH_CAPABILITY_UPSTREAMS = Object.freeze({
  // Morph is a raw transport proxy only. These mappings document the exact
  // upstream target each local capability route must hit without translation.
  // Note: embeddings and rerank were removed in favor of WarpGrep, which
  // handles retrieval, ranking, and file reading in a single call.
  apply: { method: "POST", path: "/v1/chat/completions" },
  warpgrep: { method: "POST", path: "/v1/chat/completions" },
  compact: { method: "POST", path: "/v1/compact" },
});
