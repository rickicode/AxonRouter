import { getConfiguredMorphSettings } from "@/app/api/morph/_shared";
import { MORPH_MANAGED_PROVIDER, MORPH_MANAGED_PROVIDER_ID } from "@/shared/constants/providers";

function countEligibleKeys(apiKeys = []) {
  return apiKeys.filter((entry) => entry?.key && entry.status !== "inactive" && entry.isExhausted !== true).length;
}

function countExhaustedKeys(apiKeys = []) {
  return apiKeys.filter((entry) => entry?.isExhausted === true).length;
}

function countInactiveKeys(apiKeys = []) {
  return apiKeys.filter((entry) => entry?.status === "inactive").length;
}

export async function buildMorphManagedConnection() {
  const morphSettings = await getConfiguredMorphSettings();
  const apiKeys = Array.isArray(morphSettings?.apiKeys) ? morphSettings.apiKeys : [];
  const eligibleKeys = countEligibleKeys(apiKeys);
  const exhaustedKeys = countExhaustedKeys(apiKeys);
  const inactiveKeys = countInactiveKeys(apiKeys);
  const totalKeys = apiKeys.length;
  const configured = !!morphSettings;

  return {
    id: MORPH_MANAGED_PROVIDER_ID,
    provider: MORPH_MANAGED_PROVIDER_ID,
    authType: "apikey",
    name: MORPH_MANAGED_PROVIDER.name,
    isActive: configured,
    systemManaged: true,
    readOnly: true,
    managedBy: "morph",
    providerSpecificData: {
      prefix: "morph",
      nodeName: MORPH_MANAGED_PROVIDER.name,
      baseUrl: morphSettings?.baseUrl || "https://api.morphllm.com",
      managedIn: "/dashboard/morph",
      providerSurface: MORPH_MANAGED_PROVIDER.providerSurface,
      roundRobinEnabled: (morphSettings as any)?.roundRobinEnabled === true,
      totalKeys,
      eligibleKeys,
      exhaustedKeys,
      inactiveKeys,
    },
    routingStatus: configured && eligibleKeys > 0 ? "eligible" : "disabled",
    quotaState: configured && eligibleKeys > 0 ? "ok" : exhaustedKeys > 0 && eligibleKeys === 0 ? "exhausted" : "unknown",
    authState: configured ? "ok" : "missing",
    healthStatus: configured && eligibleKeys > 0 ? "healthy" : "unknown",
    reasonCode: configured ? null : "morph_not_configured",
    reasonDetail: configured ? null : "Managed in Morph settings",
    lastCheckedAt: apiKeys.reduce((latest, entry) => {
      const value = entry?.lastCheckedAt;
      if (!value) return latest;
      if (!latest) return value;
      return new Date(value) > new Date(latest) ? value : latest;
    }, null),
  };
}

export function injectMorphManagedProvider(connections = []) {
  const withoutMorphManaged = (connections || []).filter((connection) => connection?.provider !== MORPH_MANAGED_PROVIDER_ID && connection?.id !== MORPH_MANAGED_PROVIDER_ID);
  return withoutMorphManaged;
}

export async function getMorphManagedConnectionById(id) {
  if (id !== MORPH_MANAGED_PROVIDER_ID) {
    return null;
  }
  return buildMorphManagedConnection();
}
