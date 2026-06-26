import { getCurrentProxyPoolById } from "../connectionAccess";
import { getCurrentSettings } from "../settingsAccess";
import { getCurrentProxyGroupById } from "../proxyGroupAccess";
import { isRelayType } from "@/lib/relayTypes";

function normalizeString(value: any) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

// In-memory round-robin cursors: Map<groupId, index>
const roundRobinCursors = new Map<string, number>();

// In-memory sticky tracking: Map<groupId, { poolId, count }>
const stickyState = new Map<string, { poolId: string; count: number }>();

async function resolveProxyPoolConfig(proxyPoolId: string, source: string) {
  const proxyPool = await getCurrentProxyPoolById(proxyPoolId);
  const proxyUrl = normalizeString(proxyPool?.proxyUrl);
  const noProxy = normalizeString(proxyPool?.noProxy);

  if (!proxyPool || proxyPool.isActive !== true || !proxyUrl) {
    return null;
  }

  // Relay: rewrite base URL instead of using HTTP_PROXY
  if (isRelayType(proxyPool.type)) {
    return {
      source,
      proxyPoolId,
      proxyPool,
      connectionProxyEnabled: false,
      connectionProxyUrl: "",
      connectionNoProxy: noProxy,
      strictProxy: proxyPool.strictProxy === true,
      relayUrl: proxyUrl,
      relayAuth: normalizeString(proxyPool?.relayAuth),
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
    relayAuth: "",
  };
}

export async function resolveProxyFromGroup(groupId: string, source: string) {
  const group = await getCurrentProxyGroupById(groupId);
  if (!group || group.isActive !== true) {
    return null;
  }

  const poolIds: string[] = Array.isArray(group.proxyPoolIds) ? group.proxyPoolIds : [];
  if (poolIds.length === 0) {
    return null;
  }

  // Filter to active pools (must load each to check), skip error pools
  const activePools: { id: string; proxyPool: any }[] = [];
  let hasErrorPools = false;
  for (const pid of poolIds) {
    const pool = await getCurrentProxyPoolById(pid);
    if (pool && pool.isActive === true && normalizeString(pool.proxyUrl)) {
      if (pool.testStatus === "error") {
        hasErrorPools = true;
      } else {
        activePools.push({ id: pid, proxyPool: pool });
      }
    }
  }

  if (activePools.length === 0) {
    // If we have error pools (all healthy ones are down), use direct fallback logic
    if (hasErrorPools) {
      if (group.strictProxy === true) {
        return null;
      }
      return {
        source,
        proxyPoolId: null,
        proxyPool: null,
        connectionProxyEnabled: false,
        connectionProxyUrl: "",
        connectionNoProxy: "",
        strictProxy: false,
        relayUrl: "",
      };
    }
    // No pools at all (all inactive/empty) - return null to fall through
    return null;
  }

  let selectedPoolId: string;

  if (group.mode === "sticky") {
    const stickyLimit = typeof group.stickyLimit === "number" && group.stickyLimit >= 1 ? group.stickyLimit : 1;
    const current = stickyState.get(groupId);

    if (current && current.count < stickyLimit) {
      // Check if the sticky pool is still active
      const stillActive = activePools.find((p) => p.id === current.poolId);
      if (stillActive) {
        stickyState.set(groupId, { poolId: current.poolId, count: current.count + 1 });
        selectedPoolId = current.poolId;
      } else {
        // Sticky pool became inactive, pick next
        selectedPoolId = activePools[0].id;
        stickyState.set(groupId, { poolId: selectedPoolId, count: 1 });
      }
    } else {
      // Limit reached or no sticky state, rotate to next
      let nextIndex = 0;
      if (current) {
        const currentIndex = activePools.findIndex((p) => p.id === current.poolId);
        nextIndex = currentIndex >= 0 ? (currentIndex + 1) % activePools.length : 0;
      }
      selectedPoolId = activePools[nextIndex].id;
      stickyState.set(groupId, { poolId: selectedPoolId, count: 1 });
    }
  } else {
    // Round-robin mode
    const cursor = roundRobinCursors.get(groupId) || 0;
    const index = cursor % activePools.length;
    selectedPoolId = activePools[index].id;
    roundRobinCursors.set(groupId, cursor + 1);
  }

  const config = await resolveProxyPoolConfig(selectedPoolId, source);
  if (config) {
    // Override strictProxy with group-level setting
    config.strictProxy = group.strictProxy === true;
  }
  return config;
}

export async function resolveConnectionProxyConfig(providerSpecificData: any = {}, providerId: string | null = null) {
  // 1. Check connection-level proxyGroupId
  const connectionGroupIdRaw = normalizeString(providerSpecificData?.proxyGroupId);
  const connectionGroupId = connectionGroupIdRaw === "__none__" ? "" : connectionGroupIdRaw;

  if (connectionGroupId) {
    const groupConfig = await resolveProxyFromGroup(connectionGroupId, "connection-group");
    if (groupConfig) {
      return groupConfig;
    }
    // Group is inactive/empty - fall through
  }

  // 2. Check connection-level proxyPoolId
  const connectionProxyPoolIdRaw = normalizeString(providerSpecificData?.proxyPoolId);
  const connectionProxyPoolId = connectionProxyPoolIdRaw === "__none__" ? "" : connectionProxyPoolIdRaw;

  if (connectionProxyPoolId) {
    const connectionLevelConfig = await resolveProxyPoolConfig(connectionProxyPoolId, "connection-pool");
    if (connectionLevelConfig) {
      return connectionLevelConfig;
    }
    // Connection-level pool is inactive/missing - fall through to provider default
  }

  const normalizedProviderId = normalizeString(providerId);
  if (normalizedProviderId) {
    const settings = await getCurrentSettings();
    const providerProxyDefaults = settings?.providerProxyDefaults || {};
    const providerConfig = providerProxyDefaults?.[normalizedProviderId];

    // 3. Check provider-default proxyGroupId
    const providerGroupIdRaw = normalizeString(providerConfig?.proxyGroupId);
    const providerGroupId = providerGroupIdRaw === "__none__" ? "" : providerGroupIdRaw;

    if (providerGroupId) {
      const groupConfig = await resolveProxyFromGroup(providerGroupId, "provider-default-group");
      if (groupConfig) {
        return groupConfig;
      }
    }

    // 4. Check provider-default proxyPoolId
    const providerProxyPoolIdRaw = normalizeString(providerConfig?.proxyPoolId);
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
