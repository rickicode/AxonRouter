import { AI_PROVIDERS } from "@/shared/constants/providers";

/**
 * Detect whether a model is free to use (no billing/quota required).
 *
 * Signals considered:
 * - Provider-level: noAuth (OpenCode Free), category "free" / "freeTier", hasFree
 * - Model-level: model.isFree === true (set by static catalog or fetcher)
 * - Name-level: "free" anywhere in id/name/value (contributor-free, :free, etc.)
 *
 * @param {object|string} model - Model object { id, name, value, isFree } or string
 * @param {string} [providerId] - Optional provider ID to check provider-level free
 * @returns {boolean}
 */
export function isFreeModel(model, providerId) {
  if (!model) return false;

  // String path: extract provider + model id
  if (typeof model === "string") {
    const slash = model.indexOf("/");
    const pId = providerId || (slash > 0 ? model.slice(0, slash) : null);
    const mId = slash > 0 ? model.slice(slash + 1) : model;
    return checkFree({ id: mId }, pId);
  }

  return checkFree(model, providerId || model.providerId || null);
}

function checkFree(model, providerId) {
  // 1. Model-level: explicit flag
  if (model.isFree === true) return true;

  // 2. Provider-level: noAuth = always free
  if (providerId) {
    const provider = AI_PROVIDERS[providerId];
    if (provider?.noAuth) return true;
    if (provider?.hasFree) return true;
  }

  // 3. Name-level: "free" in id/name/value
  const text = `${model.id || ""} ${model.name || ""} ${model.value || ""}`.toLowerCase();
  if (/\bfree\b/.test(text)) return true;

  return false;
}

/**
 * Sort model list: free models first, then paid. Added models float to top.
 * @param {object[]} models
 * @param {string[]} addedModelValues - Already-selected model values
 * @param {string} [providerId] - Optional provider ID context
 * @returns {object[]}
 */
export function sortModelsByFree(models, addedModelValues = [], providerId) {
  const added = models
    .filter((m) => addedModelValues.includes(m.value))
    .sort((a, b) => a.name.localeCompare(b.name));
  const rest = models.filter((m) => !addedModelValues.includes(m.value));
  const free = rest
    .filter((m) => isFreeModel(m, providerId))
    .sort((a, b) => a.name.localeCompare(b.name));
  const paid = rest
    .filter((m) => !isFreeModel(m, providerId))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...added, ...free, ...paid];
}
