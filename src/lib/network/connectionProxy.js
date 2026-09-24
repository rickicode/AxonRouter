import {
  getProxyPoolById,
  getProxyPools,
  getProxyGroupByName,
  getProxyGroupById,
  getSettings,
} from "@/models";
import { ensurePoolFitnessHydrated, fitPoolIds } from "open-sse/services/proxyPoolFitness.js";

// Safely normalize any value into a trimmed string.
function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

/**
 * Match default group name/alias to canonical proxy type.
 * e.g. "cloudflare", "Cloudflare Relay", "cf" → "cloudflare"
 *      "http", "httpp" → "http"
 *      "vercel" → "vercel"
 *      "deno", "dino" → "deno"
 */
export function matchDefaultGroupType(input) {
  if (!input) return null;
  const n = String(input).toLowerCase().trim().replace(/^default-/, "");
  if (n === "cloudflare" || n === "cloudflare relay" || n === "cf") return "cloudflare";
  if (n === "http" || n === "httpp") return "http";
  if (n === "vercel") return "vercel";
  if (n === "deno" || n === "dino") return "deno";
  return null;
}

// ─── Proxy pool rotation state (in-memory, globalThis-backed for Turbopack/Next dev) ───
const rotateState = (globalThis.__axonrouterProxyRotateState__ ??= new Map()); // stateKey → { index, count, currentPoolId }

/**
 * Pick one proxy pool ID from a list based on strategy.
 * round-robin: cycle sequentially (in-memory, resets on restart)
 * random:      uniform random pick
 * smart:       region-aware — skip pools unfit for `scope`, round-robin on the fit subset
 * none/single: return first entry
 * @param {string[]} poolIds
 * @param {string} strategy
 * @param {string} providerId
 * @param {{ scope?: string, excludeIds?: string[] }} [opts]
 */
export function pickProxyPoolId(poolIds, strategy, providerId, opts = {}) {
  if (!poolIds || poolIds.length === 0) return null;
  const {
    scope = null,
    excludeIds = [],
    isSticky = false,
    stickyLimit = 3,
    groupId = null,
  } = opts || {};

  const uniquePoolIds = [...new Set(poolIds)];
  const excludeSet = new Set(excludeIds || []);
  let eligible = uniquePoolIds.filter((id) => !excludeSet.has(id));
  // Region/provider-aware filtering:
  // Always filter out unfit pools for Freebuff, OpenCode free (egress rate-limit /
  // gate), or when strategy is "smart".
  // A pool flagged as anonymous_network, limited, or rate-limited must NOT be reused.
  const isFreebuff = providerId === "freebuff" || scope?.startsWith("freebuff::");
  const isOpenCode = providerId === "opencode" || scope?.startsWith("opencode::");
  const isKilocodeFree = providerId === "kilocode-free" || providerId === "kcf" || scope?.startsWith("kilocode-free::") || scope?.startsWith("kcf::");
  if ((strategy === "smart" || isFreebuff || isOpenCode || isKilocodeFree) && scope) {
    eligible = fitPoolIds(eligible, scope);
  }

  if (eligible.length === 0) {
    // If every pool is marked unfit, Freebuff, OpenCode & Kilocode-Free fail fast so caller
    // can rotate or direct-fallback cleanly rather than hammering bad pools.
    if (isFreebuff || isOpenCode || isKilocodeFree) return null;
    eligible = uniquePoolIds.filter((id) => !excludeSet.has(id));
    if (eligible.length === 0) return null;
  }
  if (eligible.length === 1) return eligible[0];

  const stateKey = providerId
    ? `${providerId}${groupId ? `:${groupId}` : ""}`
    : (groupId ? `group:${groupId}` : "default");

  // ─── Sticky Round-Robin ──────────────────────────────────────────
  if (isSticky) {
    // If stickyLimit is 0 or negative, stick indefinitely until the pool becomes unfit/excluded
    const unlimitedSticky = Number(stickyLimit) <= 0;
    const limit = unlimitedSticky ? Infinity : Math.max(1, Number(stickyLimit) || 3);
    const state = rotateState.get(stateKey) || { index: -1, currentPoolId: null, stickCount: 0 };

    // If current sticky pool is still eligible and count < limit, stick with it
    if (
      state.currentPoolId &&
      eligible.includes(state.currentPoolId) &&
      state.stickCount < limit
    ) {
      state.stickCount += 1;
      rotateState.set(stateKey, state);
      return state.currentPoolId;
    }
    // Otherwise advance to next eligible candidate in round-robin order
    let prevIdx = state.currentPoolId ? eligible.indexOf(state.currentPoolId) : state.index;
    if (prevIdx === -1) prevIdx = state.index;
    const nextIdx = (prevIdx + 1) % eligible.length;

    state.index = nextIdx;
    state.currentPoolId = eligible[nextIdx];
    state.stickCount = 1;
    rotateState.set(stateKey, state);
    return state.currentPoolId;
  }

  if (strategy === "round-robin" || strategy === "smart") {
    const state = rotateState.get(stateKey) || { index: -1 };
    state.index = (state.index + 1) % eligible.length;
    state.currentPoolId = eligible[state.index];
    state.stickCount = 1;
    rotateState.set(stateKey, state);
    return eligible[state.index];
  }
  if (strategy === "random") {
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  return eligible[0]; // "none" or unknown
}

/**
 * Lock a working proxy pool for a scope (e.g. Freebuff) so subsequent
 * requests stay on this proxy until it fails/becomes unfit.
 */
export function lockProxyPoolForScope(providerId, poolId, groupId = null) {
  if (!poolId) return;
  const stateKey = providerId
    ? `${providerId}${groupId ? `:${groupId}` : ""}`
    : (groupId ? `group:${groupId}` : "default");
  const state = rotateState.get(stateKey) || { index: -1, currentPoolId: null, stickCount: 0 };
  state.currentPoolId = poolId;
  state.stickCount = 0; // Fresh lock
  rotateState.set(stateKey, state);
}

/**
 * Normalize legacy proxy configuration.
 */
function normalizeLegacyProxy(providerSpecificData = {}) {
  const connectionProxyEnabled =
    providerSpecificData?.connectionProxyEnabled === true;

  const connectionProxyUrl = normalizeString(
    providerSpecificData?.connectionProxyUrl
  );

  const connectionNoProxy = normalizeString(
    providerSpecificData?.connectionNoProxy
  );

  return {
    connectionProxyEnabled,
    connectionProxyUrl,
    connectionNoProxy,
  };
}

/**
 * Resolve final proxy configuration.
 *
 * Priority:
 * 1. Multi-Proxy Pool (new format with rotation)
 * 2. Single Proxy Pool (legacy)
 * 3. Legacy Proxy
 * 4. No Proxy
 */
export async function resolveConnectionProxyConfig(
  providerSpecificData = {},
  connectionId = null,
  excludePoolIds = null
) {
  try {
    await ensurePoolFitnessHydrated();
    // Handle new multi-proxy format & proxy group
    let proxyPoolIds = providerSpecificData?.proxyPoolIds ? [...providerSpecificData.proxyPoolIds] : [];
    let proxyRotationStrategy = providerSpecificData?.proxyRotationStrategy || "none";
    const proxyGroup = normalizeString(providerSpecificData?.proxyGroup);
    let groupPoolMap = null;
    let isSticky = false;
    let stickyLimit = 3;
    let resolvedGroupId = null;

    if (proxyGroup) {
      // 1. Check if it matches a default automatic group (cloudflare, http, vercel, deno)
      const defaultType = matchDefaultGroupType(proxyGroup);
      if (defaultType) {
        resolvedGroupId = `default-${defaultType}`;
        try {
          if (typeof getSettings === "function") {
            const settings = await getSettings();
            const defCfg = settings?.defaultProxyGroupSettings?.[defaultType];
            if (defCfg?.isSticky) {
              isSticky = true;
              stickyLimit = Number(defCfg.stickyLimit) > 0 ? Number(defCfg.stickyLimit) : 3;
            }
          }
        } catch {}
        const defaultPools = await getProxyPools({ isActive: true, type: defaultType });
        if (defaultPools.length > 0) {
          proxyPoolIds = defaultPools.map((p) => p.id);
          groupPoolMap = new Map(defaultPools.map((p) => [p.id, p]));
          if (proxyRotationStrategy === "none") {
            proxyRotationStrategy = "round-robin";
          }
        }
      } else {
        // 2. Check if it matches a custom group from proxy_groups
        let customGroup = null;
        try {
          if (typeof getProxyGroupByName === "function") {
            customGroup = await getProxyGroupByName(proxyGroup);
            if (!customGroup && typeof getProxyGroupById === "function") {
              customGroup = await getProxyGroupById(proxyGroup);
            }
          }
        } catch { /* fail-open to legacy match */ }

        if (customGroup) {
          resolvedGroupId = customGroup.id;
          isSticky = customGroup.isSticky === true;
          stickyLimit = customGroup.stickyLimit || 3;
          const assignedIds = new Set(customGroup.poolIds || []);

          if (assignedIds.size > 0) {
            const allActive = await getProxyPools({ isActive: true });
            const matchingPools = allActive.filter((p) => assignedIds.has(p.id));
            if (matchingPools.length > 0) {
              proxyPoolIds = matchingPools.map((p) => p.id);
              groupPoolMap = new Map(matchingPools.map((p) => [p.id, p]));
            }
          }
          if (proxyRotationStrategy === "none") {
            proxyRotationStrategy = "round-robin";
          }
        } else {
          // 3. Fallback to legacy string match on proxy_pools."group"
          let groupPools = await getProxyPools({ isActive: true, group: proxyGroup });
          if (groupPools.length === 0) {
            const allPools = await getProxyPools({ isActive: true });
            groupPools = allPools.filter((p) => normalizeString(p.group).toLowerCase() === proxyGroup.toLowerCase());
          }
          if (groupPools.length > 0) {
            proxyPoolIds = groupPools.map((p) => p.id);
            groupPoolMap = new Map(groupPools.map((p) => [p.id, p]));
            if (proxyRotationStrategy === "none") {
              proxyRotationStrategy = "round-robin";
            }
          }
        }
      }
    }
    
    // Handle legacy single-proxy format
    const legacyProxyPoolId = normalizeString(providerSpecificData?.proxyPoolId);
    const proxyPoolIdRaw = legacyProxyPoolId === "__none__" ? "" : legacyProxyPoolId;

    const legacy = normalizeLegacyProxy(providerSpecificData);
    const multiPoolScope = providerSpecificData?.proxyPoolScope || null;
    let selectedPoolId = null;

    /**
     * -----------------------------
     * Multi-Proxy Pool Resolution (NEW)
     * -----------------------------
     */
    if (proxyPoolIds.length > 0) {
      let candidateIds = proxyPoolIds.filter((id) => !(excludePoolIds || []).includes(id));
      while (candidateIds.length > 0) {
        selectedPoolId = pickProxyPoolId(candidateIds, proxyRotationStrategy, connectionId, {
          scope: multiPoolScope,
          excludeIds: excludePoolIds,
          isSticky,
          stickyLimit,
          groupId: resolvedGroupId,
        });
        if (!selectedPoolId) break;

        const proxyPool = groupPoolMap?.get(selectedPoolId) || await getProxyPoolById(selectedPoolId);
        const proxyUrl = normalizeString(proxyPool?.proxyUrl);
        const noProxy = normalizeString(proxyPool?.noProxy);

        const isValidPool = proxyPool && proxyPool.isActive === true && proxyUrl;

        if (isValidPool) {
          /**
           * Vercel/Cloudflare relay proxies use base URL rewriting
           * instead of HTTP_PROXY environment variables.
           */
          if (proxyPool.type === "vercel" || proxyPool.type === "cloudflare" || proxyPool.type === "deno") {
            return {
              source: proxyPool.type,
              proxyPoolId: selectedPoolId,
              proxyPool,
              connectionProxyEnabled: false,
              connectionProxyUrl: "",
              connectionNoProxy: noProxy,
              strictProxy: proxyPool.strictProxy === true,
              vercelRelayUrl: proxyUrl,
              proxyPoolIds: proxyPoolIds.length > 0 ? proxyPoolIds : undefined,
            };
          }

          /**
           * Standard proxy pool
           */
          return {
            source: "pool",
            proxyPoolId: selectedPoolId,
            proxyPool,
            connectionProxyEnabled: true,
            connectionProxyUrl: proxyUrl,
            connectionNoProxy: noProxy,
            strictProxy: proxyPool.strictProxy === true,
            proxyPoolIds: proxyPoolIds.length > 0 ? proxyPoolIds : undefined,
          };
        }

        // Selected pool was invalid/inactive/deleted — remove it and try next candidate
        candidateIds = candidateIds.filter((id) => id !== selectedPoolId);
        selectedPoolId = null;
      }
    }
    if (
      !selectedPoolId &&
      proxyRotationStrategy === "smart" &&
      multiPoolScope?.startsWith("freebuff::")
    ) {
      const isStrict = providerSpecificData?.strictProxy === true;
      return {
        source: "pool",
        proxyPoolId: null,
        proxyPool: null,
        noFitPool: true,
        connectionProxyEnabled: false,
        connectionProxyUrl: "",
        connectionNoProxy: "",
        strictProxy: isStrict,
      };
    }

    /**
     * -----------------------------
     * Single Proxy Pool Resolution (LEGACY)
     * -----------------------------
     */
    if (proxyPoolIdRaw) {
      const proxyPool = await getProxyPoolById(proxyPoolIdRaw);
      const proxyUrl = normalizeString(proxyPool?.proxyUrl);
      const noProxy = normalizeString(proxyPool?.noProxy);
      const isValidPool = proxyPool && proxyPool.isActive === true && proxyUrl;

      if (isValidPool) {
        if (proxyPool.type === "vercel" || proxyPool.type === "cloudflare" || proxyPool.type === "deno") {
          return {
            source: proxyPool.type,
            proxyPoolId: proxyPoolIdRaw,
            proxyPool,
            connectionProxyEnabled: false,
            connectionProxyUrl: "",
            connectionNoProxy: noProxy,
            strictProxy: proxyPool.strictProxy === true,
            vercelRelayUrl: proxyUrl,
          };
        }

        return {
          source: "pool",
          proxyPoolId: proxyPoolIdRaw,
          proxyPool,
          connectionProxyEnabled: true,
          connectionProxyUrl: proxyUrl,
          connectionNoProxy: noProxy,
          strictProxy: proxyPool.strictProxy === true,
        };
      }
    }

    /**
     * -----------------------------
     * Legacy Proxy Fallback
     * -----------------------------
     */
    if (
      legacy.connectionProxyEnabled &&
      legacy.connectionProxyUrl
    ) {
      return {
        source: "legacy",

        proxyPoolId: proxyPoolIdRaw || null,
        proxyPool: null,

        ...legacy,
      };
    }

    /**
     * -----------------------------
     * No Proxy Config
     * -----------------------------
     */
    return {
      source: "none",

      proxyPoolId: proxyPoolIdRaw || null,
      proxyPool: null,

      ...legacy,
    };
  } catch (error) {
    console.error(
      "[resolveConnectionProxyConfig] Failed to resolve proxy config:",
      error
    );

    return {
      source: "error",

      proxyPoolId: null,
      proxyPool: null,

      connectionProxyEnabled: false,
      connectionProxyUrl: "",
      connectionNoProxy: "",

      strictProxy: false,
    };
  }
}
