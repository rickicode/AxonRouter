// Classifier (System One / Jev) egress resolution.
//
// open-sse owns the classifier call but must stay agnostic: it never imports
// the proxy layer. This module is the application-layer glue that turns a
// resolved Jev target into the exact `proxyOptions` shape proxyAwareFetch()
// consumes, mirroring what the chat path does in src/sse/handlers/chat.js.
//
// Precedence, highest first:
//   1. the classifier connection's own providerSpecificData (an explicit
//      proxyGroup / proxyPoolIds / legacy proxy on the connection);
//   2. the operator's per-provider strategy for that classifier provider
//      (settings.providerStrategies[provider], same source the noAuth chat
//      path uses — this is where an operator actually configures egress for a
//      keyless provider such as "opencode");
//   3. no proxy (fail-open — a classifier outage must never fail a request).
//
// Keyless classifier providers are per-IP-quota metered, so the resolved
// options carry failClosedProxy: true: if the pool dies, proxyAwareFetch throws
// instead of silently burning the shared server egress.
import { getSettings } from "@/lib/localDb";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy.js";
import { bumpRoutingMetric } from "open-sse/services/routingMetrics.js";

/** Provider-level proxy strategy from settings.providerStrategies (same shape the noAuth chat path reads). */
function strategyForProvider(settings, providerId) {
  const override = settings?.providerStrategies?.[providerId];
  if (!override) return null;
  return {
    proxyGroup: override.proxyGroup || null,
    proxyRotationStrategy: override.rotateStrategy && override.rotateStrategy !== "none"
      ? override.rotateStrategy
      : "smart",
    proxyPoolIds: Array.isArray(override.proxyPoolIds) && override.proxyPoolIds.length
      ? override.proxyPoolIds
      : null,
    proxyPoolId: override.proxyPoolId || null,
  };
}

/**
 * Resolve the runtime proxy options for one classifier target.
 * Never throws: any failure means "no proxy", the caller then fails open to the
 * LLM judge rather than failing the request.
 *
 * @param {{provider:string, connectionId?:string, providerSpecificData?:object}} target
 * @returns {Promise<object|null>} proxyOptions for proxyAwareFetch, or null
 */
export async function resolveJevProxy(target, excludePoolIds = null) {
  if (!target?.provider) return null;

  try {
    const settings = await getSettings();
    const fromStrategy = strategyForProvider(settings, target.provider);
    const fromConnection = target.providerSpecificData || {};
    const hasConnectionProxy = Boolean(
      fromConnection.proxyGroup
      || (Array.isArray(fromConnection.proxyPoolIds) && fromConnection.proxyPoolIds.length)
      || fromConnection.proxyPoolId
      || fromConnection.connectionProxyUrl
    );
    if (!fromStrategy && !hasConnectionProxy) return null;

    const psd = {
      ...fromConnection,
      ...(fromStrategy || {}),
    };
    // Scope pool rotation to the classifier so it does not fight the chat
    // path's own rotation state for the same provider.
    psd.proxyPoolScope = `${target.provider}::jev`;

    // excludePoolIds lets the caller retry the classifier through a DIFFERENT egress
    // after one pool failed, instead of giving up on the provider.
    const resolved = await resolveConnectionProxyConfig(psd, target.connectionId || null, excludePoolIds);
    if (!resolved?.connectionProxyEnabled || !resolved?.connectionProxyUrl) return null;

    return {
      connectionProxyEnabled: true,
      connectionProxyUrl: resolved.connectionProxyUrl,
      connectionNoProxy: resolved.connectionNoProxy || "",
      connectionProxyPoolId: resolved.proxyPoolId || null,
      proxyPoolId: resolved.proxyPoolId || null,
      vercelRelayUrl: resolved.vercelRelayUrl || "",
      strictProxy: resolved.strictProxy === true,
      // Keyless classifier = per-IP quota: a dead pool must not silently
      // degrade to the shared direct egress.
      failClosedProxy: target.keyless === true,
    };
  } catch (e) {
    bumpRoutingMetric("jevProxyResolveFailed");
    return null;
  }
}

export default resolveJevProxy;