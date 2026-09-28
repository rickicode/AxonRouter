// System One (Jev) classifier — model + endpoint catalog derived from the
// provider registry.
//
// The registry is the single source of truth: a provider that declares
// `serviceKinds: ["jev"]` and a `jevConfig` block is automatically offered by the
// combo classifier picker and resolvable by the upstream resolver
// (open-sse/services/jevUpstream.js). Adding a new Jev upstream is a registry
// edit only — no new constants, no new picker code.
//
// Pure data, no server-only imports: REGISTRY_UI is the client-safe projection of
// the registry, so the dashboard bundle (SmartRoutingSection) reads this too.
import { REGISTRY_UI } from "../providers/registry/ui.js";

const DEFAULT_PRIORITY = 999;

/**
 * Providers answering the System One classifier API, priority-ordered.
 * @type {Array<{provider: string, alias: string, label: string, priority: number,
 *   endpoint: string, keyPool: boolean, models: Array<object>}>}
 */
export const JEV_PROVIDERS = REGISTRY_UI
  .filter((p) => Array.isArray(p.serviceKinds) && p.serviceKinds.includes("jev") && p.jevConfig?.endpoint)
  .map((p) => {
    const alias = p.uiAlias || p.alias || p.id;
    const keyPool = p.jevConfig.keyPool === true;
    return {
      provider: p.id,
      alias,
      label: p.display?.name || p.id,
      priority: p.priority ?? DEFAULT_PRIORITY,
      endpoint: p.jevConfig.endpoint,
      keyPool,
      keyEnv: `${p.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`,
      models: (Array.isArray(p.jevConfig.models) ? p.jevConfig.models : [])
        .filter((m) => m?.id)
        .map((m) => ({
          id: m.id,
          name: m.name || m.id,
          default: m.default === true,
          requiresKey: m.requiresKey === true,
          provider: p.id,
          providerLabel: p.display?.name || p.id,
          endpoint: p.jevConfig.endpoint,
          keyPool,
        })),
    };
  })
  .sort((a, b) => a.priority - b.priority);

/** Classifier provider entry for a provider id, or null. */
export function jevProviderById(providerId) {
  if (!providerId) return null;
  return JEV_PROVIDERS.find((p) => p.provider === providerId || p.alias === providerId) || null;
}

/** Every (provider, model) pair the picker can offer, in provider priority order. */
export const JEV_MODEL_CHOICES = JEV_PROVIDERS.flatMap((p) =>
  p.models.map((m) => ({
    value: m.id,
    label: `${p.label} / ${m.id}${m.requiresKey ? " (key required)" : ""}`,
    default: m.default,
    endpoint: m.endpoint,
    provider: m.provider,
    providerLabel: m.providerLabel,
    keyPool: m.keyPool,
    keyEnv: p.keyEnv,
    requiresKey: m.requiresKey,
  }))
);

/** Unique classifier model ids across all providers (first declaration wins). */
export const JEV_ALL_MODELS = [...new Set(JEV_MODEL_CHOICES.map((c) => c.value))];

/** Provider that declares a model id, first in priority order, or null. */
export function jevModelMeta(model) {
  return JEV_MODEL_CHOICES.find((c) => c.value === model) || null;
}

/** Endpoint serving a model id; null when the id is not a known classifier model. */
export function jevEndpointForModel(model) {
  return jevModelMeta(model)?.endpoint || null;
}

/**
 * Default picker value: the default-flagged model of the highest-priority
 * provider that needs no key (keyless upstream first, key-backed second).
 */
export const DEFAULT_JEV_MODEL =
  (JEV_MODEL_CHOICES.find((c) => c.default && !c.requiresKey)
    || JEV_MODEL_CHOICES.find((c) => c.default)
    || JEV_MODEL_CHOICES[0])?.value || "";

/** True when an endpoint is served by one of the registered classifier providers. */
export function isKnownJevEndpoint(url) {
  return JEV_PROVIDERS.some((p) => p.endpoint === url);
}

// Upstream endpoint anchors kept for the tests and docs that name them. Derived,
// never hand-written: they follow the registry.
export const ZEN_SYSTEMONE_URL = jevEndpointForModel("jev-1.13-free") || "";
export const TYPESAFE_SYSTEMONE_URL = jevEndpointForModel("jev-latest") || "";