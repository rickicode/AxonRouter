import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import {
  normalizeOpenCodePreferences,
  validateOpenCodePreferences,
} from "../opencodeSync/schema";
import { clearAllHotState, mergeConnectionsWithHotState } from "../providerHotState";
import { markProviderHotStateInvalidated, rebuildHotStateFromConnections } from "../localDbStorage";
import {
  isPlainObject,
  isCloud,
  mergeSettingsWithDefaults,
  normalizeSyncedAvailableModelsMap,
  cloneDefaultData,
  validateDbImportPayload,
  migrateDbImportPayload,
  DB_BACKUP_FORMAT,
  DB_BACKUP_SCHEMA_VERSION,
} from "./normalize";
import {
  getDb,
  withLocalDbMutex,
  safeRead,
  persistDbWrite,
  persistSingletonWrite,
  peekDbCacheObject,
  ensureDbShape,
  stripHotStateFromConnection,
  cloneDbData,
  invalidateDbCache,
} from "./core";

// --- Provider Nodes ---

export async function getProviderNodes(filter: any = {}) {
  const db = await getDb();
  let nodes: any[] = db.data.providerNodes || [];
  if (filter.type) nodes = nodes.filter((node) => node.type === filter.type);
  return nodes;
}

export async function getProviderNodeById(id: any) {
  const db = await getDb();
  return db.data.providerNodes.find((node) => node.id === id) || null;
}

export async function createProviderNode(data: any) {
  const db = await getDb();
  let node;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.providerNodes) db.data.providerNodes = [];

    const now = new Date().toISOString();
    node = {
      id: data.id || uuidv4(),
      type: data.type,
      name: data.name,
      prefix: data.prefix,
      apiType: data.apiType,
      baseUrl: data.baseUrl,
      createdAt: now,
      updatedAt: now,
    };

    db.data.providerNodes.push(node);
    await persistDbWrite(db);
  });
  return node;
}

export async function updateProviderNode(id: any, data: any) {
  const db = await getDb();
  let result = null;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.providerNodes) db.data.providerNodes = [];

    const index = db.data.providerNodes.findIndex((node) => node.id === id);
    if (index === -1) return;

    db.data.providerNodes[index] = {
      ...db.data.providerNodes[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };

    await persistDbWrite(db);
    result = db.data.providerNodes[index];
  });
  return result;
}

export async function deleteProviderNode(id: any) {
  const db = await getDb();
  let removed = null;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.providerNodes) db.data.providerNodes = [];

    const index = db.data.providerNodes.findIndex((node) => node.id === id);
    if (index === -1) return;

    [removed] = db.data.providerNodes.splice(index, 1);
    await persistDbWrite(db);
  });
  return removed;
}

// --- Proxy Pools ---

export async function getProxyPools(filter: any = {}) {
  const db = await getDb();
  let pools: any[] = db.data.proxyPools || [];

  if (filter.isActive !== undefined) pools = pools.filter((pool) => pool.isActive === filter.isActive);
  if (filter.testStatus) pools = pools.filter((pool) => pool.testStatus === filter.testStatus);

  return pools.sort((a: any, b: any) => Number(new Date(b.updatedAt || 0)) - Number(new Date(a.updatedAt || 0)));
}

export async function getProxyPoolById(id) {
  const db = await getDb();
  return (db.data.proxyPools || []).find((pool) => pool.id === id) || null;
}

export async function createProxyPool(data) {
  const db = await getDb();
  let pool;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.proxyPools) db.data.proxyPools = [];

    const now = new Date().toISOString();
    pool = {
      id: data.id || uuidv4(),
      name: data.name,
      proxyUrl: data.proxyUrl,
      noProxy: data.noProxy || "",
      type: data.type || "http",
      isActive: data.isActive !== undefined ? data.isActive : true,
      strictProxy: data.strictProxy === true,
      testStatus: data.testStatus || "unknown",
      lastTestedAt: data.lastTestedAt || null,
      lastError: data.lastError || null,
      createdAt: now,
      updatedAt: now,
    };

    db.data.proxyPools.push(pool);
    await persistDbWrite(db);
  });
  return pool;
}

export async function updateProxyPool(id, data) {
  const db = await getDb();
  let result = null;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.proxyPools) db.data.proxyPools = [];

    const index = db.data.proxyPools.findIndex((pool) => pool.id === id);
    if (index === -1) return;

    db.data.proxyPools[index] = {
      ...db.data.proxyPools[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };

    await persistDbWrite(db);
    result = db.data.proxyPools[index];
  });
  return result;
}

export async function deleteProxyPool(id) {
  const db = await getDb();
  let removed = null;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.proxyPools) db.data.proxyPools = [];

    const index = db.data.proxyPools.findIndex((pool) => pool.id === id);
    if (index === -1) return;

    [removed] = db.data.proxyPools.splice(index, 1);
    await persistDbWrite(db);
  });
  return removed;
}

// --- Model Aliases ---

export async function getModelAliases() {
  const db = await getDb();
  return db.data.modelAliases || {};
}

export async function setModelAlias(alias, model) {
  const db = await getDb();
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.modelAliases) db.data.modelAliases = {};
    db.data.modelAliases[alias] = model;
    await persistDbWrite(db);
  });
}

export async function deleteModelAlias(alias) {
  const db = await getDb();
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.modelAliases) db.data.modelAliases = {};
    delete db.data.modelAliases[alias];
    await persistDbWrite(db);
  });
}

// --- Custom Models & Synced Available Models ---

export async function getCustomModels() {
  const db = await getDb();
  return db.data.customModels || [];
}

export async function getAllSyncedAvailableModels() {
  const db = await getDb();
  return normalizeSyncedAvailableModelsMap(db.data.syncedAvailableModels || {});
}

export async function getSyncedAvailableModelsForConnection(providerId, connectionId) {
  if (!providerId || !connectionId) return [];
  const all = await getAllSyncedAvailableModels();
  return all[providerId]?.[connectionId] || [];
}

export async function replaceSyncedAvailableModelsForConnection(providerId, connectionId, models) {
  if (!providerId || !connectionId) return [];
  const db = await getDb();
  let nextModels = [];
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!isPlainObject(db.data.syncedAvailableModels)) db.data.syncedAvailableModels = {};
    if (!isPlainObject(db.data.syncedAvailableModels[providerId])) db.data.syncedAvailableModels[providerId] = {};

    nextModels = Array.isArray(models) ? models.filter(Boolean) : [];
    if (nextModels.length > 0) {
      db.data.syncedAvailableModels[providerId][connectionId] = nextModels;
    } else if (isPlainObject(db.data.syncedAvailableModels[providerId])) {
      delete db.data.syncedAvailableModels[providerId][connectionId];
      if (Object.keys(db.data.syncedAvailableModels[providerId]).length === 0) {
        delete db.data.syncedAvailableModels[providerId];
      }
    }

    db.data.syncedAvailableModels = normalizeSyncedAvailableModelsMap(db.data.syncedAvailableModels);
    await persistDbWrite(db);
  });
  return nextModels;
}

export async function deleteSyncedAvailableModelsForConnection(providerId, connectionId) {
  return replaceSyncedAvailableModelsForConnection(providerId, connectionId, []);
}

export async function getDisabledModels() {
  const db = await getDb();
  return db.data.disabledModels || {};
}

export async function disableModels(providerAlias, ids) {
  if (!providerAlias || !Array.isArray(ids)) return;
  const db = await getDb();
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.disabledModels || typeof db.data.disabledModels !== "object") db.data.disabledModels = {};
    const current = new Set(db.data.disabledModels[providerAlias] || []);
    ids.forEach((id) => {
      if (typeof id === "string" && id.trim()) current.add(id);
    });
    db.data.disabledModels[providerAlias] = [...current];
    await persistDbWrite(db);
  });
}

export async function enableModels(providerAlias, ids) {
  if (!providerAlias) return;
  const db = await getDb();
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.disabledModels || typeof db.data.disabledModels !== "object") db.data.disabledModels = {};
    const current = db.data.disabledModels[providerAlias] || [];
    if (!Array.isArray(ids) || ids.length === 0) {
      delete db.data.disabledModels[providerAlias];
    } else {
      const removeSet = new Set(ids);
      const next = current.filter((id) => !removeSet.has(id));
      if (next.length === 0) delete db.data.disabledModels[providerAlias];
      else db.data.disabledModels[providerAlias] = next;
    }
    await persistDbWrite(db);
  });
}

export async function addCustomModel({ providerAlias, id, type = "llm", name }) {
  const db = await getDb();
  let added = false;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.customModels) db.data.customModels = [];
    const exists = db.data.customModels.some(
      (m) => m.providerAlias === providerAlias && m.id === id && (m.type || "llm") === type
    );
    if (exists) return;
    db.data.customModels.push({ providerAlias, id, type, name: name || id });
    await persistDbWrite(db);
    added = true;
  });
  return added;
}

export async function deleteCustomModel({ providerAlias, id, type = "llm" }) {
  const db = await getDb();
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.customModels) return;
    db.data.customModels = db.data.customModels.filter(
      (m) => !(m.providerAlias === providerAlias && m.id === id && (m.type || "llm") === type)
    );
    await persistDbWrite(db);
  });
}

// --- Custom Skills ---

export async function getCustomSkills() {
  const db = await getDb();
  return Array.isArray(db.data.customSkills) ? db.data.customSkills : [];
}

export async function createCustomSkill({ name, slug, content, description = "" }) {
  const db = await getDb();
  let created = null;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!Array.isArray(db.data.customSkills)) db.data.customSkills = [];
    const nextSlug = String(slug || "").trim().toLowerCase();
    if (!nextSlug) throw new Error("slug required");
    if (db.data.customSkills.some((skill) => skill.slug === nextSlug)) throw new Error("skill slug already exists");
    created = {
      id: uuidv4(),
      name: String(name || "").trim() || nextSlug,
      slug: nextSlug,
      description: String(description || "").trim(),
      content: String(content || ""),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.data.customSkills.push(created);
    await persistDbWrite(db);
  });
  return created;
}

export async function updateCustomSkill(id: any, data: any = {}) {
  const db = await getDb();
  let updated = null;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!Array.isArray(db.data.customSkills)) db.data.customSkills = [];
    const index = db.data.customSkills.findIndex((skill) => skill.id === id);
    if (index === -1) return;
    const current = db.data.customSkills[index];
    const nextSlug = data.slug !== undefined ? String(data.slug || "").trim().toLowerCase() : current.slug;
    if (!nextSlug) throw new Error("slug required");
    if (db.data.customSkills.some((skill, skillIndex) => skillIndex !== index && skill.slug === nextSlug)) throw new Error("skill slug already exists");
    updated = {
      ...current,
      ...(data.name !== undefined ? { name: String(data.name || "").trim() || nextSlug } : {}),
      ...(data.slug !== undefined ? { slug: nextSlug } : {}),
      ...(data.description !== undefined ? { description: String(data.description || "").trim() } : {}),
      ...(data.content !== undefined ? { content: String(data.content || "") } : {}),
      updatedAt: new Date().toISOString(),
    };
    db.data.customSkills[index] = updated;
    await persistDbWrite(db);
  });
  return updated;
}

export async function deleteCustomSkill(id) {
  const db = await getDb();
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!Array.isArray(db.data.customSkills)) db.data.customSkills = [];
    db.data.customSkills = db.data.customSkills.filter((skill) => skill.id !== id);
    await persistDbWrite(db);
  });
}

export async function duplicateCustomSkill(id) {
  const skills = await getCustomSkills();
  const skill = skills.find((entry) => entry.id === id);
  if (!skill) return null;

  let suffix = 2;
  let nextSlug = `${skill.slug}-copy`;
  const slugSet = new Set(skills.map((entry) => entry.slug));
  while (slugSet.has(nextSlug)) {
    nextSlug = `${skill.slug}-copy-${suffix}`;
    suffix += 1;
  }

  return createCustomSkill({
    name: `${skill.name} Copy`,
    slug: nextSlug,
    description: skill.description || "",
    content: skill.content || "",
  });
}

// --- MITM Alias ---

export async function getMitmAlias(toolName) {
  const db = await getDb();
  const all = db.data.mitmAlias || {};
  if (toolName) return all[toolName] || {};
  return all;
}

export async function setMitmAliasAll(toolName, mappings) {
  const db = await getDb();
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.mitmAlias) db.data.mitmAlias = {};
    db.data.mitmAlias[toolName] = mappings || {};
    await persistSingletonWrite(db, "mitmAlias");
  });
}

export async function setMitmAlias(toolName, mappings) {
  return setMitmAliasAll(toolName, mappings);
}

export async function deleteMitmAlias(toolName) {
  const db = await getDb();
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.mitmAlias) db.data.mitmAlias = {};
    delete db.data.mitmAlias[toolName];
    await persistSingletonWrite(db, "mitmAlias");
  });
}

// --- API Keys ---

export async function getApiKeys() {
  const db = await getDb();
  return db.data.apiKeys || [];
}

export async function createApiKey(name, machineId) {
  if (!machineId) throw new Error("machineId is required");

  const db = await getDb();
  const now = new Date().toISOString();

  const { generateApiKeyWithMachine } = await import("../../shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);

  let apiKey;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.apiKeys) db.data.apiKeys = [];
    apiKey = {
      id: uuidv4(),
      name: name,
      key: result.key,
      machineId: machineId,
      isActive: true,
      createdAt: now,
    };

    db.data.apiKeys.push(apiKey);
    await persistDbWrite(db);
    invalidateApiKeyMap();
  });
  return apiKey;
}

export async function deleteApiKey(id) {
  const db = await getDb();
  let success = false;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.apiKeys) db.data.apiKeys = [];
    const index = db.data.apiKeys.findIndex(k => k.id === id);
    if (index === -1) return;

    db.data.apiKeys.splice(index, 1);
    await persistDbWrite(db);
    invalidateApiKeyMap();
    success = true;
  });
  return success;
}

export async function getApiKeyById(id) {
  const db = await getDb();
  return db.data.apiKeys.find(k => k.id === id) || null;
}

export async function updateApiKey(id, data) {
  const db = await getDb();
  let result = null;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!db.data.apiKeys) db.data.apiKeys = [];
    const index = db.data.apiKeys.findIndex(k => k.id === id);
    if (index === -1) return;
    db.data.apiKeys[index] = { ...db.data.apiKeys[index], ...data };
    await persistDbWrite(db);
    invalidateApiKeyMap();
    result = db.data.apiKeys[index];
  });
  return result;
}

// API key validation cache
let _apiKeyMap: Map<string, boolean> | null = null;
let _apiKeyMapSeq = 0;

function invalidateApiKeyMap() {
  _apiKeyMap = null;
  _apiKeyMapSeq++;
}

async function getApiKeyMap(): Promise<Map<string, boolean>> {
  if (_apiKeyMap) return _apiKeyMap;
  const seqBefore = _apiKeyMapSeq;
  const db = await getDb();
  const map = new Map<string, boolean>();
  for (const k of db.data.apiKeys || []) {
    if (k.key && k.isActive !== false) map.set(k.key, true);
  }
  if (_apiKeyMapSeq === seqBefore) _apiKeyMap = map;
  return map;
}

export async function validateApiKey(key) {
  const map = await getApiKeyMap();
  const keyBuf = Buffer.from(key, 'utf8');
  for (const storedKey of map.keys()) {
    if (storedKey.length === key.length) {
      try {
        if (crypto.timingSafeEqual(Buffer.from(storedKey, 'utf8'), keyBuf)) return true;
      } catch { continue; }
    }
  }
  return false;
}

// --- Settings ---

export async function getSettings() {
  const cachedSettings = peekDbCacheObject("settings");
  if (cachedSettings !== null) {
    return mergeSettingsWithDefaults(cachedSettings);
  }

  const db = await getDb();
  const normalizedSettings = mergeSettingsWithDefaults(db.data.settings || { cloudEnabled: false });

  if (JSON.stringify(normalizedSettings) !== JSON.stringify(db.data.settings || { cloudEnabled: false })) {
    db.data.settings = normalizedSettings;
    await persistDbWrite(db);
  }

  return normalizedSettings;
}

export async function atomicUpdateSettings(mutator) {
  if (typeof mutator !== "function") {
    throw new Error("Settings mutator is required");
  }

  const db = await getDb();
  let result = null;

  await withLocalDbMutex(async () => {
    await safeRead(db);
    const current = mergeSettingsWithDefaults(db.data.settings || { cloudEnabled: false });
    const updated = await mutator(structuredClone(current));

    if (!updated || typeof updated !== "object" || Array.isArray(updated)) {
      throw new Error("Mutator must return settings object");
    }

    const normalizedUpdated = mergeSettingsWithDefaults(updated);
    if (JSON.stringify(normalizedUpdated) === JSON.stringify(current)) {
      result = current;
      return;
    }

    db.data.settings = normalizedUpdated;
    await persistDbWrite(db);
    result = db.data.settings;
  });

  return result;
}

export async function updateSettings(updates) {
  const db = await getDb();
  const nextUpdates = updates && typeof updates === "object" && !Array.isArray(updates)
    ? { ...updates }
    : {};

  let result = null;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    db.data.settings = mergeSettingsWithDefaults({
      ...db.data.settings,
      ...nextUpdates,
      usageWorker: {
        ...(db.data.settings?.usageWorker || {}),
        ...(nextUpdates?.usageWorker || {}),
      },

    });
    await persistDbWrite(db);
    result = db.data.settings;
  });
  return result;
}

// --- Export / Import ---

export async function exportDb() {
  const db = await getDb();
  let snapshot = null;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    const data = db.data || cloneDefaultData();
    const sanitizedConnections = Array.isArray(data.providerConnections)
      ? data.providerConnections.map(stripHotStateFromConnection)
      : [];
    snapshot = {
      format: DB_BACKUP_FORMAT,
      schemaVersion: DB_BACKUP_SCHEMA_VERSION,
      ...data,
      providerConnections: sanitizedConnections,
      syncedAvailableModels: normalizeSyncedAvailableModelsMap(data.syncedAvailableModels || {}),
    };
  });
  return snapshot;
}

export async function importDb(payload) {
  validateDbImportPayload(payload);

  const migratedPayload = migrateDbImportPayload(payload);
  const { format: _format, schemaVersion: _schemaVersion, ...importPayload } = migratedPayload;

  const nextData = {
    ...cloneDefaultData(),
    ...importPayload,
    settings: {
      ...cloneDefaultData().settings,
      ...(importPayload.settings && typeof importPayload.settings === "object" && !Array.isArray(importPayload.settings)
        ? importPayload.settings
        : {}),
    },
  };

  nextData.settings = mergeSettingsWithDefaults(nextData.settings);

  const { data: normalized } = ensureDbShape(nextData);
  const db = await getDb();
  const invalidatedProviders = new Set();
  let connectionsForRebuild = [];
  let resultData = null;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    for (const conn of db.data.providerConnections || []) {
      if (conn?.provider) invalidatedProviders.add(conn.provider);
    }
    for (const connection of normalized.providerConnections || []) {
      if (connection?.provider) invalidatedProviders.add(connection.provider);
    }
    db.data = normalized;
    await persistDbWrite(db);
    connectionsForRebuild = Array.isArray(db.data.providerConnections)
      ? db.data.providerConnections.map((c) => ({ ...c }))
      : [];
    resultData = db.data;
  });
  await clearAllHotState();
  try {
    rebuildHotStateFromConnections(connectionsForRebuild);
  } catch (err) {
    console.error("[importDb] Hot state rebuild failed after import, state may be stale:", (err as Error)?.message || err);
  }
  for (const providerId of invalidatedProviders) {
    markProviderHotStateInvalidated(providerId);
  }

  try {
    const { invalidateInternalProxyTokenCache } = await import("../internalProxyTokens");
    invalidateInternalProxyTokenCache();
  } catch {
    // Non-fatal
  }

  return resultData;
}

export async function isCloudEnabled() {
  const settings = await getSettings();
  return settings.cloudEnabled === true;
}

export async function getCloudUrl() {
  const settings = await getSettings();
  if (typeof settings.cloudUrl === "string" && settings.cloudUrl) {
    return settings.cloudUrl;
  }
  const first = Array.isArray(settings.cloudUrls)
    ? settings.cloudUrls.find((entry) => typeof entry?.url === "string" && entry.url)
    : null;
  return first?.url ? first.url.replace(/\/$/, "") : "";
}

// --- Pricing ---

export async function getPricing() {
  const { PROVIDER_PRICING } = await import("../../shared/constants/pricing");
  return PROVIDER_PRICING;
}

export async function getPricingForModel(provider, model) {
  if (!model) return null;

  const { getPricingForModel: resolve } = await import("../../shared/constants/pricing");
  return resolve(provider, model);
}

export async function updatePricing() {
  throw new Error("Pricing overrides are disabled");
}

export async function resetPricing() {
  throw new Error("Pricing overrides are disabled");
}

export async function resetAllPricing() {
  throw new Error("Pricing overrides are disabled");
}

// --- OpenCode Sync ---

function normalizeOpenCodeSyncDomain(value) {
  const current = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    preferences: normalizeOpenCodePreferences(current.preferences),
    tokens: Array.isArray(current.tokens) ? current.tokens : [],
  };
}

export async function getOpenCodeSync() {
  const db = await getDb();
  db.data.opencodeSync = normalizeOpenCodeSyncDomain(db.data.opencodeSync);
  return db.data.opencodeSync;
}

export async function getOpenCodePreferences() {
  const opencodeSync = await getOpenCodeSync();
  return normalizeOpenCodePreferences(opencodeSync.preferences);
}

export async function updateOpenCodePreferences(updates) {
  const db = await getDb();
  let result = null;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    db.data.opencodeSync = normalizeOpenCodeSyncDomain(db.data.opencodeSync);

    const current = normalizeOpenCodePreferences(db.data.opencodeSync.preferences);
    db.data.opencodeSync.preferences = validateOpenCodePreferences({
      ...current,
      ...(updates && typeof updates === "object" && !Array.isArray(updates) ? updates : {}),
    });

    await persistDbWrite(db);
    result = db.data.opencodeSync.preferences;
  });
  return result;
}

export async function listOpenCodeTokens() {
  const opencodeSync = await getOpenCodeSync();
  return opencodeSync.tokens;
}

export async function replaceOpenCodeTokens(tokens) {
  const db = await getDb();
  let result = null;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    db.data.opencodeSync = normalizeOpenCodeSyncDomain(db.data.opencodeSync);
    db.data.opencodeSync.tokens = Array.isArray(tokens) ? [...tokens] : [];
    await persistDbWrite(db);
    result = db.data.opencodeSync.tokens;
  });
  return result;
}

export async function mutateOpenCodeTokens(mutator) {
  if (typeof mutator !== "function") {
    throw new Error("Token mutator is required");
  }

  const db = await getDb();
  let nextOpenCodeSync = null;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    db.data.opencodeSync = normalizeOpenCodeSyncDomain(db.data.opencodeSync);
    const current = [...(db.data.opencodeSync.tokens || [])];
    const result = mutator(current);

    if (!result || typeof result !== "object" || !Array.isArray(result.tokens)) {
      throw new Error("Invalid token mutation result");
    }

    db.data.opencodeSync.tokens = [...result.tokens];
    await persistDbWrite(db);
    nextOpenCodeSync = normalizeOpenCodeSyncDomain(db.data.opencodeSync);
  });

  db.data.opencodeSync = normalizeOpenCodeSyncDomain(nextOpenCodeSync || db.data.opencodeSync);
  return db.data.opencodeSync.tokens;
}

export async function touchOpenCodeTokenLastUsedAt(tokenId, usedAt = new Date().toISOString()) {
  const normalizedId = typeof tokenId === "string" ? tokenId.trim() : "";
  if (!normalizedId) {
    throw new Error("Token id is required");
  }

  return mutateOpenCodeTokens((tokens) => ({
    tokens: tokens.map((token) =>
      token?.id === normalizedId
        ? {
            ...token,
            lastUsedAt: usedAt,
            updatedAt: usedAt,
          }
        : token
    ),
  }));
}
