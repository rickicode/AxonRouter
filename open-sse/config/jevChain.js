// Difficulty-judge classifier chain — the operator's ordered list of classifier
// upstreams, tried left to right until one answers.
//
// Why a chain and not a single (model, provider) pair: a classifier is on the hot
// path of every uncached request, so a single upstream is a single point of
// failure. Free System One endpoints (OpenCode, BeatAPI, TypeSafe) rate-limit,
// park on Retry-After and go down without warning; a keyless one fails per egress
// IP. A chain turns "the classifier is down" into "the second classifier answered",
// and lets the operator put the fastest/most reliable upstream first without
// giving up the ones behind it.
//
// Two entry modes, because "any model, any provider" is the actual requirement:
//
//   { mode: "jev",   provider, model }  a System One (Jev) upstream. provider/model
//                                     must be registry-declared (open-sse/config/
//                                     jevModels.js is the SSOT) so the endpoint and
//                                     key source stay derivable.
//   { mode: "judge", model, provider? } ANY model on ANY provider, called through
//                                     the normal chat path (handleSingleModel).
//                                     `provider` is an optional route hint
//                                     ("openrouter/qwen3.8-27b"); omitted, the
//                                     model is routed as configured elsewhere.
//
// A judge entry is more expensive and slower than a System One round-trip, which
// is why `jev` entries are the ones meant to sit first — but the chain does not
// require it, and nothing here reorders or second-guesses the operator's list.
//
// Backward compatibility: an absent/empty chain means "the legacy single pair", so
// every existing combo and settings row keeps working untouched. That derivation
// lives here (jevChainFromLegacy) rather than at each call site so the settings
// API, the combo path and the dashboard all agree on what an empty chain means.
//
// Pure data + pure functions, no server-only imports — the dashboard chain editor
// imports this to validate and render the same shape the resolver consumes.
import { JEV_ALL_MODELS, jevProviderById, jevModelMeta } from "./jevModels.js";

export const JEV_CHAIN_MODES = ["jev", "judge"];

/** Hard cap: a chain longer than this is a config mistake, not a strategy. */
export const JEV_CHAIN_MAX_ENTRIES = 8;

/** Per-entry cap, so a pasted list can never turn one request into 50 round-trips. */
export const JEV_CHAIN_MAX_ENTRIES_PER_MODE = 6;

/**
 * Normalize one raw chain entry, or return null when it cannot be used.
 *
 * An entry is kept when it names a model AND (for `jev`) a provider that actually
 * serves it. Anything else is dropped rather than passed to the resolver, which
 * would silently widen a hard pin into "any provider" — the exact surprise the
 * resolver's pin semantics exist to prevent.
 */
export function normalizeJevChainEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  let model = typeof raw.model === "string" ? raw.model.trim() : "";
  if (!model) return null;

  // Default mode is "jev" (the historical behaviour). "systemone" is accepted as a
  // synonym so a hand-edited config or an older UI payload still parses.
  let mode = typeof raw.mode === "string" ? raw.mode.trim().toLowerCase() : "jev";
  if (mode === "systemone") mode = "jev";
  if (!JEV_CHAIN_MODES.includes(mode)) return null;

  let provider = typeof raw.provider === "string" ? raw.provider.trim() : "";
  // A provider-qualified model ("beatapi/jev-1.13-free") is the other spelling of
  // the same thing and is what the picker and resolveJevTarget already accept.
  if (!provider && mode === "jev" && model.includes("/")) {
    const slash = model.indexOf("/");
    const maybeProvider = model.slice(0, slash);
    if (jevProviderById(maybeProvider)) {
      provider = maybeProvider;
      model = model.slice(slash + 1);
    }
  }

  if (mode === "jev") {
    if (provider) {
      const matched = jevProviderById(provider);
      if (!matched) return null;
      provider = matched.provider;
      // A pinned provider must serve the pinned model, else the request 404s
      // upstream after a paid round-trip.
      if (!matched.models.some((m) => m.id === model)) {
        const fallbackModel = jevModelMeta(model);
        if (!fallbackModel || fallbackModel.provider !== provider) return null;
      }
    } else if (!JEV_ALL_MODELS.includes(model)) {
      // Unpinned: the model has to be a classifier model the registry knows, or
      // there is nothing to resolve.
      return null;
    }
    return { mode: "jev", provider, model };
  }

  // judge: any model id is legal — that is the whole point of the mode. A
  // provider is optional and is only a routing hint.
  if (provider && provider.includes("/")) provider = provider.slice(0, provider.indexOf("/"));
  return { mode: "judge", provider, model };
}

/**
 * Normalize a whole chain: drop unusable entries, de-duplicate identical entries
 * while preserving first-seen order, and cap the length. Never throws — a bad
 * chain degrades to the entries that are usable, and an empty one to the legacy
 * single pair at the call site.
 */
export function normalizeJevChain(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  const perMode = { jev: 0, judge: 0 };
  for (const item of list) {
    if (out.length >= JEV_CHAIN_MAX_ENTRIES) break;
    const entry = normalizeJevChainEntry(item);
    if (!entry) continue;
    const cap = JEV_CHAIN_MAX_ENTRIES_PER_MODE;
    if (perMode[entry.mode] >= cap) continue;
    // The same upstream twice in a row is a no-op that only burns the entry budget
    // — the fallback would retry the endpoint we just failed against.
    const key = `${entry.mode}|${entry.provider}|${entry.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    perMode[entry.mode] += 1;
    out.push(entry);
  }
  return out;
}

/**
 * Legacy single-pair config -> a one-entry chain. This is the single definition
 * of "the operator never configured a chain", shared by the resolver, the
 * settings API and the dashboard so they cannot drift.
 *
 * An empty/absent jevModel means "let the resolver pick by priority", which is an
 * unpinned entry, and it is only emitted when the operator actually left the model
 * blank (the dashboard sends "" to mean "Auto"). With nothing at all configured we
 * return [] so resolveJevTarget's own priority ordering stays in charge.
 */
export function jevChainFromLegacy(cfg = {}) {
  const model = typeof cfg?.jevModel === "string" ? cfg.jevModel.trim() : "";
  const provider = typeof cfg?.jevProvider === "string" ? cfg.jevProvider.trim() : "";
  if (!model && !provider) return [];
  return normalizeJevChain([{ mode: "jev", provider, model: model || JEV_ALL_MODELS[0] || "" }]);
}

/**
 * The chain to actually run: the configured one when present, else the legacy pair.
 */
export function resolveJevChainConfig(cfg = {}) {
  const configured = normalizeJevChain(cfg?.jevChain);
  if (configured.length) return { chain: configured, source: "chain" };
  const legacy = jevChainFromLegacy(cfg);
  if (legacy.length) return { chain: legacy, source: "legacy" };
  return { chain: [], source: "auto" };
}

/** Stable label for logs and the dashboard: "beatapi/jev-1.13-free" or "gpt-5.6-luna". */
export function jevChainEntryLabel(entry) {
  if (!entry) return "";
  return entry.provider ? `${entry.provider}/${entry.model}` : entry.model;
}
