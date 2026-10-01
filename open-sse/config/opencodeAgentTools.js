// OpenCode free-tier gate markers.
//
// The upstream gate validates tool CONTENT: the lowercase file-search quartet
// (bash/glob/grep/read) must be declared with canonical names, and a capitalized
// duplicate ("Bash" beside "bash") is rejected outright. Declarations are built
// by open-sse/utils/opencodeFingerprint.js, which canonicalises case variants,
// drops duplicates and appends only genuinely missing members — a thin
// placeholder set is not enough, and the full 12KB genuine schemas cost ~3K
// tokens per request for no gate benefit. Only free-tier models are gated
// upstream, so paid-key traffic keeps its exact client payload.

// Model ids served behind the keyless free-tier gate (suffix or family match;
// zen thinking suffix "model(level)" is stripped before matching). union-alpha was
// matched here too and no longer is — it is gone upstream (2026-10-01), not gated.
const FREE_TIER_MODEL_RES = [/-free$/i, /muse-spark/i];

export function isFreeTierGateModel(model) {
  const id = String(model || "").replace(/\([^()]+\)\s*$/, "").trim();
  if (!id) return false;
  return FREE_TIER_MODEL_RES.some((re) => re.test(id));
}
