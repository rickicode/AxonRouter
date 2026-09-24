// Public API barrel — all DB functions
import { getAdapter } from "./driver.js";
import { parseJson } from "./helpers/jsonCol.js";

// Settings
export {
  getSettings, updateSettings, exportSettings,
} from "./repos/settingsRepo.js";

// Provider connections
export {
  getProviderConnections, countProviderConnections, getProviderConnectionById, getProviderSummaryStats,
  setProviderConnectionsActive, setConnectionsActiveByIds,
  getProxyPoolBoundCounts, countProxyPoolBoundConnections,
  countProxyGroupBoundConnections,
  getUnavailableOrLockedConnections,
  getClientUsageConnections, getClientUsageMeta,
  getAvailableAccountsForRouting, touchAccountLastUsed,
  setModelCooldown, clearModelCooldown,
  lockAccountToModel, unlockAccountModel,
  createProviderConnection, updateProviderConnection,
  deleteProviderConnection, deleteProviderConnectionsByIds, deleteProviderConnectionsByProvider,
  reorderProviderConnections, cleanupProviderConnections,
  bulkResetProviderConnectionsStatus, autoRecoverExpiredExhaustedConnections, bulkUpdateProviderProxy,
} from "./repos/connectionsRepo.js";

// Provider nodes
export {
  getProviderNodes, getProviderNodeById,
  createProviderNode, updateProviderNode, deleteProviderNode,
} from "./repos/nodesRepo.js";

// Proxy pools
export {
  getProxyPools, getProxyPoolById,
  createProxyPool, updateProxyPool, deleteProxyPool, deleteDisabledProxyPools,
  invalidateProxyPoolCache,
} from "./repos/proxyPoolsRepo.js";

// Proxy groups
export {
  getProxyGroups, getProxyGroupById, getProxyGroupByName,
  createProxyGroup, updateProxyGroup, deleteProxyGroup,
  invalidateProxyGroupCache,
  lockProxyPoolForScope,
} from "./repos/proxyGroupsRepo.js";

// API keys
export {
  getApiKeys, getApiKeyById, createApiKey, updateApiKey, deleteApiKey, validateApiKey,
} from "./repos/apiKeysRepo.js";

// Combos
export {
  getCombos, getComboById, getComboByName,
  createCombo, updateCombo, deleteCombo,
} from "./repos/combosRepo.js";

// Aliases (model + custom + mitm)
export {
  getModelAliases, setModelAlias, deleteModelAlias,
  getCustomModels, addCustomModel, deleteCustomModel,
} from "./repos/aliasRepo.js";

// Pricing
export {
  getPricing, getPricingForModel, updatePricing, resetPricing, resetAllPricing,
} from "./repos/pricingRepo.js";

// Disabled models
export {
  getDisabledModels, getDisabledByProvider, disableModels, enableModels,
} from "./repos/disabledModelsRepo.js";

// Usage
export {
  statsEmitter, trackPendingRequest, getActiveRequests,
  saveRequestUsage, saveFailedRequest, getUsageHistory, getUsageStats, getChartData, getLast10Minutes,
  appendRequestLog, getRecentLogs, flushUsageQueue,
} from "./repos/usageRepo.js";

// Usage snapshots
export {
  upsertUsageSnapshot, getUsageSnapshotByConnectionId,
  getUsageSnapshotsByProvider, getBatchProviderQuotas,
} from "./repos/usageSnapshotsRepo.js";

// Request details
export {
  saveRequestDetail, getRequestDetails, getRequestDetailById, getDistinctProviders, getFailureAnalytics, getComboAnalytics,
} from "./repos/requestDetailsRepo.js";

// Export/import full DB
export async function exportDb() {
  const db = await getAdapter();
  const { exportSettings } = await import("./repos/settingsRepo.js");

  const [
    settings,
    rawConnections,
    rawNodes,
    rawPools,
    rawGroups,
    rawKeys,
    rawCombos,
    rawKv,
  ] = await Promise.all([
    exportSettings(),
    db.all(`SELECT * FROM provider_connections`),
    db.all(`SELECT * FROM provider_nodes`),
    db.all(`SELECT * FROM proxy_pools`),
    db.all(`SELECT * FROM proxy_groups`),
    db.all(`SELECT * FROM api_keys`),
    db.all(`SELECT * FROM combos`),
    db.all(`SELECT scope, key, value FROM kv WHERE scope IN ('modelAliases', 'customModels', 'pricing')`),
  ]);

  const out = {
    settings: settings || {},
    providerConnections: rawConnections.map((r) => {
      const extra = parseJson(r.data, {});
      return {
        ...extra,
        id: r.id,
        provider: r.provider,
        authType: r.auth_type,
        name: r.name,
        email: r.email,
        priority: r.priority,
        isActive: r.is_active === true || r.is_active === 1,
        testStatus: r.test_status,
        lockedAllUntil: r.locked_all_until ? new Date(r.locked_all_until).toISOString() : null,
        rateLimitedUntil: r.rate_limited_until ? new Date(r.rate_limited_until).toISOString() : null,
        tokenExpiresAt: r.token_expires_at ? new Date(r.token_expires_at).toISOString() : null,
        lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
        modelLocks: parseJson(r.model_locks, {}),
        lastError: r.last_error,
        errorCode: r.error_code,
        lastErrorAt: r.last_error_at ? new Date(r.last_error_at).toISOString() : null,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
      };
    }),
    providerNodes: rawNodes.map((r) => ({
      ...parseJson(r.data, {}),
      id: r.id,
      type: r.type,
      name: r.name,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
    })),
    proxyPools: rawPools.map((r) => {
      const extra = parseJson(r.data, {});
      return {
        ...extra,
        id: r.id,
        name: r.name,
        proxyUrl: r.proxy_url,
        noProxy: r.no_proxy,
        type: r.type,
        group: r.group,
        isActive: r.is_active === true || r.is_active === 1,
        strictProxy: r.strict_proxy === true || r.strict_proxy === 1,
        testStatus: r.test_status,
        lastTestedAt: r.last_tested_at ? new Date(r.last_tested_at).toISOString() : null,
        lastError: r.last_error,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
      };
    }),
    proxyGroups: (rawGroups || []).map((r) => {
      const extra = parseJson(r.data, {});
      return {
        ...extra,
        id: r.id,
        name: r.name,
        description: r.description || "",
        isSticky: r.is_sticky === true || r.is_sticky === 1,
        stickyLimit: r.sticky_limit || 3,
        poolIds: parseJson(r.pool_ids, []),
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
      };
    }),
    apiKeys: rawKeys.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      machineId: r.machine_id,
      isActive: r.is_active === true || r.is_active === 1,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    })),
    combos: rawCombos.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      models: parseJson(r.models, []),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
    })),
    modelAliases: {},
    customModels: [],
    pricing: {},
  };

  for (const r of rawKv) {
    const val = parseJson(r.value, null);
    if (r.scope === "modelAliases") out.modelAliases[r.key] = val;
    else if (r.scope === "customModels") out.customModels.push(val);
    else if (r.scope === "pricing") out.pricing[r.key] = val;
  }

  return out;
}

export async function importDb(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid database payload");
  }
  const db = await getAdapter();
  const sql = db.raw;

  await db.transaction(async (tx) => {
    // Wipe all active config tables (keep audit / partitions)
    await tx.exec(`
      TRUNCATE TABLE
        provider_connections,
        provider_nodes,
        proxy_pools,
        proxy_groups,
        api_keys,
        combos,
        settings,
        kv
      CASCADE
    `);

    // 1. Settings
    if (payload.settings) {
      await tx.raw`
        INSERT INTO settings(id, data, updated_at)
        VALUES(1, ${tx.raw.json(typeof payload.settings === "string" ? parseJson(payload.settings, {}) : (payload.settings || {}))}, NOW())
        ON CONFLICT(id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `;
    }

    // 2. Provider Connections (Batch 500)
    const connections = payload.providerConnections || [];
    const BATCH_SIZE = 500;
    for (let i = 0; i < connections.length; i += BATCH_SIZE) {
      const chunk = connections.slice(i, i + BATCH_SIZE);
      const values = chunk.map((c) => {
        const extraData = { ...c };
        delete extraData.id;
        delete extraData.provider;
        delete extraData.authType;
        delete extraData.name;
        delete extraData.email;
        delete extraData.priority;
        delete extraData.isActive;
        delete extraData.testStatus;
        delete extraData.lockedAllUntil;
        delete extraData.rateLimitedUntil;
        delete extraData.tokenExpiresAt;
        delete extraData.lastUsedAt;
        delete extraData.modelLocks;
        delete extraData.lastError;
        delete extraData.errorCode;
        delete extraData.lastErrorAt;
        delete extraData.createdAt;
        delete extraData.updatedAt;
        if (extraData.data !== undefined) {
          const parsed = typeof extraData.data === "string" ? parseJson(extraData.data, {}) : extraData.data;
          delete extraData.data;
          if (parsed && typeof parsed === "object") Object.assign(extraData, parsed);
        }

        return {
          id: String(c.id),
          provider: String(c.provider),
          auth_type: String(c.authType || "oauth"),
          name: c.name || null,
          email: c.email || null,
          priority: Number(c.priority) || 999,
          is_active: c.isActive === 1 || c.isActive === true || c.isActive === "1",
          test_status: c.testStatus || "active",
          locked_all_until: c.lockedAllUntil ? new Date(c.lockedAllUntil) : null,
          rate_limited_until: c.rateLimitedUntil ? new Date(c.rateLimitedUntil) : null,
          token_expires_at: c.tokenExpiresAt ? new Date(c.tokenExpiresAt) : (c.expiresAt ? new Date(c.expiresAt) : null),
          last_used_at: c.lastUsedAt ? new Date(c.lastUsedAt) : null,
          model_locks: tx.raw.json(typeof c.modelLocks === "string" ? parseJson(c.modelLocks, {}) : (c.modelLocks || {})),
          last_error: c.lastError || null,
          error_code: c.errorCode !== undefined && c.errorCode !== null ? String(c.errorCode) : null,
          last_error_at: c.lastErrorAt ? new Date(c.lastErrorAt) : null,
          data: tx.raw.json(extraData),
          created_at: c.createdAt ? new Date(c.createdAt) : new Date(),
          updated_at: c.updatedAt ? new Date(c.updatedAt) : new Date(),
        };
      });

      await tx.raw`
        INSERT INTO provider_connections ${tx.raw(values)}
        ON CONFLICT (id) DO UPDATE SET
          provider = EXCLUDED.provider,
          auth_type = EXCLUDED.auth_type,
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          priority = EXCLUDED.priority,
          is_active = EXCLUDED.is_active,
          test_status = EXCLUDED.test_status,
          locked_all_until = EXCLUDED.locked_all_until,
          rate_limited_until = EXCLUDED.rate_limited_until,
          token_expires_at = EXCLUDED.token_expires_at,
          last_used_at = EXCLUDED.last_used_at,
          model_locks = EXCLUDED.model_locks,
          last_error = EXCLUDED.last_error,
          error_code = EXCLUDED.error_code,
          last_error_at = EXCLUDED.last_error_at,
          data = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at
      `;
    }

    // 3. Provider Nodes
    const nodes = payload.providerNodes || [];
    if (nodes.length > 0) {
      const nodeValues = nodes.map((n) => {
        const extra = { ...n };
        delete extra.id;
        delete extra.type;
        delete extra.name;
        delete extra.createdAt;
        delete extra.updatedAt;
        return {
          id: String(n.id),
          type: n.type || null,
          name: n.name || null,
          data: tx.raw.json(typeof extra === "string" ? parseJson(extra, {}) : (extra || {})),
          created_at: n.createdAt ? new Date(n.createdAt) : new Date(),
          updated_at: n.updatedAt ? new Date(n.updatedAt) : new Date(),
        };
      });
      await tx.raw`
        INSERT INTO provider_nodes ${tx.raw(nodeValues)}
        ON CONFLICT (id) DO UPDATE SET
          type = EXCLUDED.type,
          name = EXCLUDED.name,
          data = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at
      `;
    }

    // 4. Proxy Pools
    const pools = payload.proxyPools || [];
    if (pools.length > 0) {
      const poolValues = pools.map((p) => {
        const extra = { ...p };
        delete extra.id;
        delete extra.name;
        delete extra.proxyUrl;
        delete extra.noProxy;
        delete extra.type;
        delete extra.group;
        delete extra.isActive;
        delete extra.strictProxy;
        delete extra.testStatus;
        delete extra.lastTestedAt;
        delete extra.lastError;
        delete extra.createdAt;
        delete extra.updatedAt;
        return {
          id: String(p.id),
          name: p.name || "Default Pool",
          proxy_url: p.proxyUrl || p.url || "",
          no_proxy: p.noProxy || "",
          type: p.type || "http",
          group: p.group || "",
          is_active: p.isActive === true || p.isActive === 1,
          strict_proxy: !!p.strictProxy,
          test_status: p.testStatus || "unknown",
          last_tested_at: p.lastTestedAt ? new Date(p.lastTestedAt) : null,
          last_error: p.lastError || null,
          data: tx.raw.json(typeof extra === "string" ? parseJson(extra, {}) : (extra || {})),
          created_at: p.createdAt ? new Date(p.createdAt) : new Date(),
          updated_at: p.updatedAt ? new Date(p.updatedAt) : new Date(),
        };
      });
      await tx.raw`
        INSERT INTO proxy_pools ${tx.raw(poolValues)}
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          proxy_url = EXCLUDED.proxy_url,
          is_active = EXCLUDED.is_active,
          test_status = EXCLUDED.test_status,
          data = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at
      `;
    }

    // 5. Proxy Groups
    const groups = payload.proxyGroups || [];
    if (groups.length > 0) {
      const groupValues = groups.map((g) => ({
        id: String(g.id),
        name: String(g.name),
        description: g.description || "",
        is_sticky: g.isSticky === true || g.is_sticky === true,
        sticky_limit: Number(g.stickyLimit || g.sticky_limit) || 3,
        pool_ids: tx.raw.json(typeof (g.poolIds || g.pool_ids) === "string" ? parseJson(g.poolIds || g.pool_ids, []) : (g.poolIds || g.pool_ids || [])),
        data: tx.raw.json(typeof g.data === "string" ? parseJson(g.data, {}) : (g.data || {})),
        created_at: g.createdAt ? new Date(g.createdAt) : new Date(),
        updated_at: g.updatedAt ? new Date(g.updatedAt) : new Date(),
      }));
      await tx.raw`
        INSERT INTO proxy_groups ${tx.raw(groupValues)}
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          is_sticky = EXCLUDED.is_sticky,
          sticky_limit = EXCLUDED.sticky_limit,
          pool_ids = EXCLUDED.pool_ids,
          data = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at
      `;
    }

    // 6. API Keys
    const keys = payload.apiKeys || [];
    if (keys.length > 0) {
      const keyValues = keys.map((k) => ({
        id: String(k.id),
        key: String(k.key),
        name: k.name || null,
        machine_id: k.machineId || null,
        is_active: k.isActive === true || k.isActive === 1,
        created_at: k.createdAt ? new Date(k.createdAt) : new Date(),
      }));
      await tx.raw`
        INSERT INTO api_keys ${tx.raw(keyValues)}
        ON CONFLICT (id) DO NOTHING
      `;
    }

    // 6. Combos
    const combos = payload.combos || [];
    if (combos.length > 0) {
      const comboValues = combos.map((c) => ({
        id: String(c.id),
        name: String(c.name),
        kind: c.kind || null,
        models: tx.raw.json(typeof c.models === "string" ? parseJson(c.models, []) : (c.models || [])),
        created_at: c.createdAt ? new Date(c.createdAt) : new Date(),
        updated_at: c.updatedAt ? new Date(c.updatedAt) : new Date(),
      }));
      await tx.raw`
        INSERT INTO combos ${tx.raw(comboValues)}
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          models = EXCLUDED.models,
          updated_at = EXCLUDED.updated_at
      `;
    }

    // 7. KV entries (modelAliases, customModels, pricing)
    const kvEntries = [];
    for (const [a, m] of Object.entries(payload.modelAliases || {})) {
      const val = typeof m === "string" ? parseJson(m, m) : (m ?? null);
      kvEntries.push({ scope: "modelAliases", key: a, value: tx.raw.json(val) });
    }
    for (const m of payload.customModels || []) {
      const k = `${m.providerAlias}|${m.id}|${m.type || "llm"}`;
      const val = typeof m === "string" ? parseJson(m, {}) : (m ?? {});
      kvEntries.push({ scope: "customModels", key: k, value: tx.raw.json(val) });
    }
    for (const [provider, models] of Object.entries(payload.pricing || {})) {
      const rawModels = typeof models === "string" ? parseJson(models, {}) : (models || {});
      kvEntries.push({ scope: "pricing", key: provider, value: tx.raw.json(rawModels) });
    }

    if (kvEntries.length > 0) {
      await tx.raw`
        INSERT INTO kv ${tx.raw(kvEntries)}
        ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value
      `;
    }
  });

  return await exportDb();
}

// Eager init helper (optional)
export async function initDb() {
  await getAdapter();
}
