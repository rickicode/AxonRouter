// Proxy resolution for non-chat (capability) upstream calls: embeddings, image,
// video, STT, TTS, search, fetch.
//
// The chat path resolves proxy inside chatCore from the selected connection's
// providerSpecificData. Capability cores receive no such resolution — every one
// of them called bare fetch() — so this glue module builds the same
// proxyOptions shape for them from, in order:
//   1. the selected connection's providerSpecificData (operator proxy config);
//   2. for noAuth/keyless providers, settings.providerStrategies[provider]
//      (the same source the noAuth chat path uses, since a keyless provider's
//      egress IP is its identity).
// Returns null when nothing is configured — then the core falls back to direct
// egress exactly as before.
import { getSettings } from "@/lib/localDb";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy.js";
import { buildProxyOptions } from "open-sse/utils/proxyFetch.js";

function psdHasProxy(psd) {
  if (!psd || typeof psd !== "object") return false;
  return Boolean(
    psd.proxyGroup
    || (Array.isArray(psd.proxyPoolIds) && psd.proxyPoolIds.length > 0)
    || psd.proxyPoolId
    || psd.connectionProxyUrl
  );
}

/**
 * @param {object} args
 * @param {string} args.provider - registry provider id
 * @param {string|null} [args.model]
 * @param {object|null} [args.credentials] - selected connection (may carry providerSpecificData)
 * @param {boolean} [args.keyless=false] - provider is noAuth/keyless: honour the
 *   per-provider strategy too and fail closed when a pool is resolved.
 * @returns {Promise<object|null>} proxyOptions for proxyAwareFetch, or null
 */
export async function resolveCapabilityProxy({ provider, model = null, credentials = null, keyless = false }) {
  const psd = credentials?.providerSpecificData;
  const scope = `${provider}::${model || "capability"}`;
  try {
    if (psdHasProxy(psd)) {
      return buildProxyOptions({ ...psd, proxyPoolScope: scope });
    }
    if (keyless) {
      const settings = await getSettings();
      const override = settings?.providerStrategies?.[provider];
      const proxyGroup = override?.proxyGroup || null;
      const proxyPoolId = override?.proxyPoolId || null;
      const rotateStrategy = override?.rotateStrategy && override.rotateStrategy !== "none"
        ? override.rotateStrategy
        : "smart";
      if (!proxyGroup && !proxyPoolId) return null;
      const resolved = await resolveConnectionProxyConfig(
        { proxyGroup, proxyPoolId, proxyRotationStrategy: rotateStrategy, proxyPoolScope: scope },
        `noauth-${provider}`
      );
      if (!resolved?.connectionProxyEnabled || !resolved?.connectionProxyUrl) return null;
      return {
        connectionProxyEnabled: true,
        connectionProxyUrl: resolved.connectionProxyUrl,
        connectionNoProxy: resolved.connectionNoProxy || "",
        connectionProxyPoolId: resolved.proxyPoolId || null,
        proxyPoolId: resolved.proxyPoolId || null,
        vercelRelayUrl: resolved.vercelRelayUrl || "",
        strictProxy: resolved.strictProxy === true,
        // Keyless = per-IP quota: a dead pool must not silently burn shared egress.
        failClosedProxy: true,
      };
    }
  } catch {
    // Proxy resolution never fails the capability call.
  }
  return null;
}

export default resolveCapabilityProxy;
