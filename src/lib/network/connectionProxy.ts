import { getCurrentProxyPoolById } from "../connectionAccess";
import { getCurrentSettings } from "../settingsAccess";

function normalizeString(value: any) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

async function resolveProxyPoolConfig(proxyPoolId: string, source: string) {
  const proxyPool = await getCurrentProxyPoolById(proxyPoolId);
  const proxyUrl = normalizeString(proxyPool?.proxyUrl);
  const noProxy = normalizeString(proxyPool?.noProxy);

  if (!proxyPool || proxyPool.isActive !== true || !proxyUrl) {
    return null;
  }

  // Relay: rewrite base URL instead of using HTTP_PROXY
  if (proxyPool.type === "relay") {
    return {
      source,
      proxyPoolId,
      proxyPool,
      connectionProxyEnabled: false,
      connectionProxyUrl: "",
      connectionNoProxy: noProxy,
      strictProxy: proxyPool.strictProxy === true,
      relayUrl: proxyUrl,
    };
  }

  return {
    source,
    proxyPoolId,
    proxyPool,
    connectionProxyEnabled: true,
    connectionProxyUrl: proxyUrl,
    connectionNoProxy: noProxy,
    strictProxy: proxyPool.strictProxy === true,
    relayUrl: "",
  };
}

export async function resolveConnectionProxyConfig(providerSpecificData: any = {}, providerId: string | null = null) {
  const connectionProxyPoolIdRaw = normalizeString(providerSpecificData?.proxyPoolId);
  const connectionProxyPoolId = connectionProxyPoolIdRaw === "__none__" ? "" : connectionProxyPoolIdRaw;

  if (connectionProxyPoolId) {
    const connectionLevelConfig = await resolveProxyPoolConfig(connectionProxyPoolId, "connection-pool");
    if (connectionLevelConfig) {
      return connectionLevelConfig;
    }
    // Connection-level pool is inactive/missing — fall through to provider default
  }

  const normalizedProviderId = normalizeString(providerId);
  if (normalizedProviderId) {
    const settings = await getCurrentSettings();
    const providerProxyDefaults = settings?.providerProxyDefaults || {};
    const providerProxyPoolIdRaw = normalizeString(providerProxyDefaults?.[normalizedProviderId]?.proxyPoolId);
    const providerProxyPoolId = providerProxyPoolIdRaw === "__none__" ? "" : providerProxyPoolIdRaw;

    if (providerProxyPoolId) {
      const providerLevelConfig = await resolveProxyPoolConfig(providerProxyPoolId, "provider-default-pool");
      if (providerLevelConfig) {
        return providerLevelConfig;
      }
    }
  }

  return {
    source: "none",
    proxyPoolId: connectionProxyPoolId || null,
    proxyPool: null,
    connectionProxyEnabled: false,
    connectionProxyUrl: "",
    connectionNoProxy: "",
    strictProxy: false,
    relayUrl: "",
  };
}
