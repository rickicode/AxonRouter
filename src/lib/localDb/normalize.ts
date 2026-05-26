import { DEFAULT_MODEL_SYNC_SETTINGS, normalizeModelSyncSettings } from "../providerModels/syncSettings";
import { normalizeCodexProviderSpecificData } from "../oauth/codexAccount";
import { normalizeRoutingStrategy as normalizeComboStrategyValue } from "../../shared/constants/routingStrategies";
import { sanitizeConnectionStatusRecord } from "../providerHotState";
import { DEFAULT_AXONROUTER_BASE_URL } from "../../shared/constants/runtimeDefaults";
import { DEFAULT_CAVEMAN_SETTINGS, normalizeCavemanSettings } from "../../../open-sse/config/caveman";
export const DB_BACKUP_FORMAT = "axonrouter-db-v1";
export const DB_BACKUP_SCHEMA_VERSION = 2;
const DEFAULT_MORPH_SETTINGS = Object.freeze({
  baseUrl: "https://api.morphllm.com",
  apiKeys: [],
  roundRobinEnabled: false,
  fastApplyModel: "morph-v3-fast",
});
const DEFAULT_MORPH_INSTRUCTIONS_SETTINGS = Object.freeze({
  enabled: true,
  mode: "default",
});
const DEFAULT_CHAT_RUNTIME_SETTINGS = Object.freeze({
  upstreamTimeoutMs: null,
  compactUpstreamTimeoutMs: null,
  codexNonCompactTimeoutMs: 75_000,
  codexAgenticTimeoutMs: 45_000,
  streamIdleTimeoutMs: 120_000,
  maxInflight: 2000,
  providerMaxInflight: 600,
  accountMaxInflight: 80,
  observabilityMode: "full",
  observabilitySampleRate: 0.1,
  highThroughputSelection: true,
  sseHeartbeatIntervalMs: 15000,
  streamReadinessTimeoutMs: 80000,
  useUpstreamRetryHints: true,
  circuitBreaker: Object.freeze({
    enabled: true,
    failureThreshold: 5,
    resetTimeoutMs: 60000,
  }),
  providerProfiles: Object.freeze({}),
});

export function isPlainObject(value: any): value is Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizeMorphApiKeyEntry(value, index = 0) {
  if (typeof value === "string") {
    const normalizedKey = value.trim();
    if (!normalizedKey) return null;
    return {
      email: `key${index + 1}@local`,
      key: normalizedKey,
      status: "unknown",
      isExhausted: false,
      lastCheckedAt: null,
      lastError: "",
    };
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const key = typeof value.key === "string" ? value.key.trim() : "";
  if (!email || !key) return null;

  return {
    email,
    key,
    status: ["active", "inactive", "cooldown", "exhausted", "unknown"].includes(value.status)
      ? value.status
      : "unknown",
    isExhausted: value.isExhausted === true,
    lastCheckedAt: typeof value.lastCheckedAt === "string" ? value.lastCheckedAt : null,
    lastError: typeof value.lastError === "string" ? value.lastError : "",
    nextRetryAt: typeof value.nextRetryAt === "string" ? value.nextRetryAt : null,
  };
}

function normalizeMorphApiKeys(apiKeys = []) {
  if (!Array.isArray(apiKeys)) return [];

  const byEmail = new Map();
  for (const [index, value] of apiKeys.entries()) {
    const normalized = normalizeMorphApiKeyEntry(value, index);
    if (!normalized) continue;
    byEmail.set(normalized.email, normalized);
  }

  return Array.from(byEmail.values());
}

const LEGACY_MIRROR_STATUS_FIELDS = new Set([
  "testStatus",
  "lastError",
  "lastErrorType",
  "lastErrorAt",
  "rateLimitedUntil",
  "errorCode",
  "lastTested",
]);

export function stripLegacyMirrorStatusPatch(record = {}) {
  return Object.fromEntries(
    Object.entries(sanitizeConnectionStatusRecord(record || {})).filter(([key]) => !LEGACY_MIRROR_STATUS_FIELDS.has(key))
  );
}

export function stripLegacyMirrorStatusFields(record = {}) {
  return Object.fromEntries(
    Object.entries(sanitizeConnectionStatusRecord(record || {})).filter(([key]) => !LEGACY_MIRROR_STATUS_FIELDS.has(key))
  );
}

export function normalizeStoredProviderSpecificData(provider, providerSpecificData) {
  if (!providerSpecificData || typeof providerSpecificData !== "object" || Array.isArray(providerSpecificData)) {
    return undefined;
  }

  if (provider === "codex") {
    return normalizeCodexProviderSpecificData(providerSpecificData);
  }

  const compacted = Object.fromEntries(
    Object.entries(providerSpecificData).filter(([, value]) => value !== undefined && value !== null)
  );

  return Object.keys(compacted).length > 0 ? compacted : undefined;
}

export const isCloud = typeof caches !== 'undefined' && typeof caches === 'object';

const DEFAULT_SETTINGS = {
  tunnelEnabled: false,
  tunnelUrl: "",
  tunnelProvider: "cloudflare",
  tailscaleEnabled: false,
  tailscaleUrl: "",
  routing: {
    strategy: "fill-first",
    stickyLimit: 3,
    sticky: {
      enabled: false,
      durationSeconds: 300,
    },
    providerStrategies: {},
    comboStrategy: "priority",
    comboStrategies: {},
  },
  stickyRoundRobinLimit: 3,
  providerStrategies: {},
  comboStrategy: "priority",
  comboStrategies: {},
  roundRobin: false,
  sticky: false,
  stickyDuration: 300,
  tunnelDashboardAccess: true,
  observabilityEnabled: true,
  observabilityMaxRecords: 1000,
  observabilityBatchSize: 20,
  observabilityFlushIntervalMs: 5000,
  observabilityMaxJsonSize: 1024,
  outboundProxyEnabled: false,
  outboundProxyUrl: "",
  outboundNoProxy: "",
  mitmRouterBaseUrl: DEFAULT_AXONROUTER_BASE_URL,
  modelSync: DEFAULT_MODEL_SYNC_SETTINGS,
  quotaExhaustedThresholdPercent: 10,
  governance: {
    enabled: false,
    allowedProviders: [],
    monthlyBudgetCapUsd: 0,
    apiKeyPolicies: {},
  },
  enterprise: {
    regionPolicy: "global",
    complianceMode: "standard",
    tenantSegregation: false,
  },
  optimizerRuns: {
    latest: null,
    history: [],
  },
  ipWhitelist: ["127.0.0.1", "::1", "172.17.0.0/16", "192.168.0.0/16"],
  trustedProxyEnabled: false,
  auditLogEnabled: true,
  auditLogMaxSize: 10485760,
  enableObservability: true,
  enableRequestLogs: false,

  morph: DEFAULT_MORPH_SETTINGS,
  morphInstructions: DEFAULT_MORPH_INSTRUCTIONS_SETTINGS,
  caveman: DEFAULT_CAVEMAN_SETTINGS,
  chatRuntime: DEFAULT_CHAT_RUNTIME_SETTINGS,
  rateLimitPerKey: 600,  // requests per minute per API key (0 = unlimited)

  observability: {
    otel: {
      enabled: false,
      jaegerOtlpHttpEndpoint: "",
    },
  },
};

const LEGACY_REMOVED_SETTINGS_KEYS = [
  "requireLogin",
  String.fromCharCode(114, 116, 107, 69, 110, 97, 98, 108, 101, 100),
];

const CANONICAL_STATUS_KEYS = ["routingStatus", "healthStatus", "quotaState", "authState"];

function hasCanonicalStatus(connection: any = {}) {
  return CANONICAL_STATUS_KEYS.some((key) => connection?.[key] !== undefined && connection?.[key] !== null);
}

export function buildEligibilityRecoveryPatch() {
  const now = new Date().toISOString();
  return {
    routingStatus: "eligible",
    healthStatus: "healthy",
    quotaState: "ok",
    authState: "ok",
    reasonCode: "inactive",
    reasonDetail: null,
    nextRetryAt: null,
    resetAt: null,
    testStatus: "active",
    lastError: null,
    lastErrorType: null,
    lastErrorAt: null,
    rateLimitedUntil: null,
    errorCode: null,
    backoffLevel: 0,
    lastCheckedAt: now,
    lastTested: now,
  };
}

export function shouldSeedEligibility(connection: any = {}) {
  return connection?.isActive !== false && !hasCanonicalStatus(connection);
}

function normalizeQuotaExhaustedThresholdPercent(value) {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.quotaExhaustedThresholdPercent;
  return Math.min(100, Math.max(0, value));
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}

function normalizeOptionalPositiveInteger(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}

function normalizeUnitInterval(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : fallback;
}

function normalizeNonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : fallback;
}

function normalizeProviderProfiles(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const profile: any = {};
    const src = entry as any;
    if (src.baseCooldownMs !== undefined) {
      const parsed = Number(src.baseCooldownMs);
      if (Number.isFinite(parsed) && parsed > 0) {
        profile.baseCooldownMs = Math.trunc(parsed);
      }
    }
    if (src.maxBackoffSteps !== undefined) {
      const parsed = Number(src.maxBackoffSteps);
      if (Number.isFinite(parsed) && parsed > 0) {
        profile.maxBackoffSteps = Math.trunc(parsed);
      }
    }
    if (src.useUpstreamRetryHints !== undefined) {
      profile.useUpstreamRetryHints = src.useUpstreamRetryHints === true;
    }
    result[key] = profile;
  }
  return result;
}

export function normalizeChatRuntimeSettings(settings: any = {}) {
  const source: any = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const sourceCircuitBreaker = source.circuitBreaker && typeof source.circuitBreaker === "object" && !Array.isArray(source.circuitBreaker)
    ? source.circuitBreaker
    : {};
  return {
    upstreamTimeoutMs: normalizeOptionalPositiveInteger(source.upstreamTimeoutMs, DEFAULT_CHAT_RUNTIME_SETTINGS.upstreamTimeoutMs),
    compactUpstreamTimeoutMs: normalizeOptionalPositiveInteger(source.compactUpstreamTimeoutMs, DEFAULT_CHAT_RUNTIME_SETTINGS.compactUpstreamTimeoutMs),
    codexNonCompactTimeoutMs: normalizePositiveInteger(source.codexNonCompactTimeoutMs, DEFAULT_CHAT_RUNTIME_SETTINGS.codexNonCompactTimeoutMs),
    codexAgenticTimeoutMs: normalizePositiveInteger(source.codexAgenticTimeoutMs, DEFAULT_CHAT_RUNTIME_SETTINGS.codexAgenticTimeoutMs),
    streamIdleTimeoutMs: normalizePositiveInteger(source.streamIdleTimeoutMs, DEFAULT_CHAT_RUNTIME_SETTINGS.streamIdleTimeoutMs),
    maxInflight: normalizePositiveInteger(source.maxInflight, DEFAULT_CHAT_RUNTIME_SETTINGS.maxInflight),
    providerMaxInflight: normalizePositiveInteger(source.providerMaxInflight, DEFAULT_CHAT_RUNTIME_SETTINGS.providerMaxInflight),
    accountMaxInflight: normalizePositiveInteger(source.accountMaxInflight, DEFAULT_CHAT_RUNTIME_SETTINGS.accountMaxInflight),
    observabilityMode: ["full", "sampled", "minimal", "off"].includes(source.observabilityMode)
      ? source.observabilityMode
      : DEFAULT_CHAT_RUNTIME_SETTINGS.observabilityMode,
    observabilitySampleRate: normalizeUnitInterval(source.observabilitySampleRate, DEFAULT_CHAT_RUNTIME_SETTINGS.observabilitySampleRate),
    highThroughputSelection: source.highThroughputSelection !== false,
    sseHeartbeatIntervalMs: (() => {
      const raw = normalizeNonNegativeInteger(source.sseHeartbeatIntervalMs, DEFAULT_CHAT_RUNTIME_SETTINGS.sseHeartbeatIntervalMs);
      return raw === 0 ? 0 : Math.max(5000, raw);
    })(),
    streamReadinessTimeoutMs: normalizePositiveInteger(source.streamReadinessTimeoutMs, DEFAULT_CHAT_RUNTIME_SETTINGS.streamReadinessTimeoutMs),
    useUpstreamRetryHints: source.useUpstreamRetryHints !== false,
    circuitBreaker: {
      enabled: sourceCircuitBreaker.enabled !== false,
      failureThreshold: normalizePositiveInteger(sourceCircuitBreaker.failureThreshold, DEFAULT_CHAT_RUNTIME_SETTINGS.circuitBreaker.failureThreshold),
      resetTimeoutMs: normalizePositiveInteger(sourceCircuitBreaker.resetTimeoutMs, DEFAULT_CHAT_RUNTIME_SETTINGS.circuitBreaker.resetTimeoutMs),
    },
    providerProfiles: normalizeProviderProfiles(source.providerProfiles),
  };
}

export function getDefaultChatRuntimeSettings() {
  return { ...DEFAULT_CHAT_RUNTIME_SETTINGS };
}


function normalizeRoutingStrategy(value, fallback = "fill-first") {
  return value === "round-robin" ? "round-robin" : fallback;
}

function normalizeStickyLimit(value, fallback = 3) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(10, Math.trunc(value)));
}

function normalizeStickyDurationSeconds(value, fallback = 300) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(60, Math.min(3600, Math.trunc(value)));
}

function normalizeProviderRoutingStrategies(value: any = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const normalized = {};
  for (const [providerId, configValue] of Object.entries(value)) {
    const config: any = configValue;
    if (!config || typeof config !== "object" || Array.isArray(config)) continue;
    const strategy = normalizeRoutingStrategy(config.strategy || config.fallbackStrategy, "");
    if (!strategy) continue;

    normalized[providerId] = { strategy };

    if (strategy === "round-robin") {
      normalized[providerId].stickyLimit = normalizeStickyLimit(
        config.stickyLimit ?? config.stickyRoundRobinLimit,
        DEFAULT_SETTINGS.routing.stickyLimit
      );
    }
  }

  return normalized;
}

function normalizeComboRoutingStrategies(value: any = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const normalized = {};
  for (const [comboName, configValue] of Object.entries(value)) {
    const config: any = configValue;
    if (!config || typeof config !== "object" || Array.isArray(config)) continue;
    const rawStrategy = config.strategy || config.fallbackStrategy || "";
    const strategy = normalizeComboStrategyValue(rawStrategy);
    if (!strategy || strategy === "priority") continue;
    normalized[comboName] = { strategy };

    if (strategy === "round-robin") {
      normalized[comboName].stickyLimit = normalizeStickyLimit(
        config.stickyLimit ?? config.stickyRoundRobinLimit,
        DEFAULT_SETTINGS.routing.stickyLimit
      );
    }
  }

  return normalized;
}

function normalizeRoutingSettings(settings: any = {}) {
  const sourceRouting: any = settings?.routing && typeof settings.routing === "object" && !Array.isArray(settings.routing)
    ? settings.routing
    : {};

  const strategy = normalizeRoutingStrategy(
    sourceRouting.strategy ?? settings?.fallbackStrategy,
    DEFAULT_SETTINGS.routing.strategy
  );
  const stickyLimit = normalizeStickyLimit(
    sourceRouting.stickyLimit ?? settings?.stickyRoundRobinLimit,
    DEFAULT_SETTINGS.routing.stickyLimit
  );
  const stickyEnabled = sourceRouting?.sticky?.enabled ?? settings?.sticky;
  const stickyDurationSeconds = normalizeStickyDurationSeconds(
    sourceRouting?.sticky?.durationSeconds ?? settings?.stickyDuration,
    DEFAULT_SETTINGS.routing.sticky.durationSeconds
  );

  const profile = ["economy", "balanced", "premium"].includes(sourceRouting.profile)
    ? sourceRouting.profile
    : "balanced";

  return {
    profile,
    strategy,
    stickyLimit,
    sticky: {
      enabled: stickyEnabled === true,
      durationSeconds: stickyDurationSeconds,
    },
    providerStrategies: normalizeProviderRoutingStrategies(
      sourceRouting.providerStrategies ?? settings?.providerStrategies
    ),
    comboStrategy: normalizeComboStrategyValue(
      sourceRouting.comboStrategy ?? settings?.comboStrategy ?? DEFAULT_SETTINGS.routing.comboStrategy
    ),
    comboStrategies: normalizeComboRoutingStrategies(
      sourceRouting.comboStrategies ?? settings?.comboStrategies
    ),
  };
}

function applyLegacyRoutingAliases(merged) {
  const routing = merged.routing || DEFAULT_SETTINGS.routing;
  merged.fallbackStrategy = routing.strategy;
  merged.routingProfile = routing.profile;
  merged.stickyRoundRobinLimit = routing.stickyLimit;
  merged.providerStrategies = Object.fromEntries(
    Object.entries(routing.providerStrategies || {}).map(([providerId, configValue]) => {
      const config: any = configValue;
      return [
        providerId,
        {
          fallbackStrategy: config.strategy,
          ...(config.strategy === "round-robin" ? { stickyRoundRobinLimit: config.stickyLimit } : {}),
        },
      ];
    })
  );
  merged.comboStrategy = routing.comboStrategy;
  merged.comboStrategies = Object.fromEntries(
    Object.entries(routing.comboStrategies || {}).map(([comboName, configValue]) => {
      const config: any = configValue;
      return [
        comboName,
        {
          fallbackStrategy: config.strategy,
          ...(config.strategy === "round-robin" ? { stickyRoundRobinLimit: config.stickyLimit } : {}),
        },
      ];
    })
  );
  merged.roundRobin = routing.strategy === "round-robin";
  merged.sticky = routing.sticky?.enabled === true;
  merged.stickyDuration = routing.sticky?.durationSeconds || DEFAULT_SETTINGS.routing.sticky.durationSeconds;
}

function isValidAbsoluteUrl(value) {
  if (typeof value !== "string") return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeMorphSettings(morph: any = {}) {
  const sourceMorph = isPlainObject(morph) ? morph : {};
  const candidateBaseUrl =
    typeof sourceMorph.baseUrl === "string"
      ? sourceMorph.baseUrl.trim()
      : DEFAULT_MORPH_SETTINGS.baseUrl;

  if (!isValidAbsoluteUrl(candidateBaseUrl)) {
    throw new Error("Morph base URL must be a valid absolute http(s) URL");
  }

  const apiKeys = Array.isArray(sourceMorph.apiKeys)
    ? normalizeMorphApiKeys(sourceMorph.apiKeys)
    : DEFAULT_MORPH_SETTINGS.apiKeys;

  const fastApplyModel = typeof sourceMorph.fastApplyModel === "string" && sourceMorph.fastApplyModel.trim()
    ? sourceMorph.fastApplyModel.trim()
    : DEFAULT_MORPH_SETTINGS.fastApplyModel;

  return {
    baseUrl: candidateBaseUrl,
    apiKeys,
    roundRobinEnabled: sourceMorph.roundRobinEnabled === true,
    fastApplyModel,
  };
}

export function mergeSettingsWithDefaults(settings: any = {}) {
  const sourceSettings: any = settings && typeof settings === "object" && !Array.isArray(settings)
    ? { ...settings }
    : {};

  for (const legacyKey of LEGACY_REMOVED_SETTINGS_KEYS) {
    delete sourceSettings[legacyKey];
  }

  const merged = {
    ...DEFAULT_SETTINGS,
    ...sourceSettings,
  };

  merged.quotaExhaustedThresholdPercent = normalizeQuotaExhaustedThresholdPercent(
    sourceSettings?.quotaExhaustedThresholdPercent
  );

  merged.modelSync = normalizeModelSyncSettings(
    sourceSettings?.modelSync && typeof sourceSettings.modelSync === "object" && !Array.isArray(sourceSettings.modelSync)
      ? sourceSettings.modelSync
      : {}
  );

  merged.morph = normalizeMorphSettings(sourceSettings?.morph);
  merged.morphInstructions = {
    ...DEFAULT_MORPH_INSTRUCTIONS_SETTINGS,
    ...(sourceSettings?.morphInstructions && typeof sourceSettings.morphInstructions === "object" && !Array.isArray(sourceSettings.morphInstructions)
      ? {
          enabled: sourceSettings.morphInstructions.enabled !== false,
          mode: sourceSettings.morphInstructions.mode === "custom" ? "custom" : "default",
        }
      : {}),
  };
  merged.caveman = normalizeCavemanSettings(sourceSettings?.caveman);
  merged.chatRuntime = normalizeChatRuntimeSettings(sourceSettings?.chatRuntime);
  merged.routing = normalizeRoutingSettings(sourceSettings);
  applyLegacyRoutingAliases(merged);

  merged.rateLimitPerKey = Number.isFinite(Number(sourceSettings?.rateLimitPerKey)) && Number(sourceSettings?.rateLimitPerKey) >= 0
    ? Math.floor(Number(sourceSettings.rateLimitPerKey))
    : DEFAULT_SETTINGS.rateLimitPerKey;

  const sourceOtel = sourceSettings?.observability?.otel;
  merged.observability = {
    otel: {
      enabled: sourceOtel?.enabled === true,
      jaegerOtlpHttpEndpoint:
        typeof sourceOtel?.jaegerOtlpHttpEndpoint === "string"
          ? sourceOtel.jaegerOtlpHttpEndpoint
          : "",
    },
  };

  return merged;
}

function normalizeSyncedAvailableModel(model: any) {
  if (!isPlainObject(model)) return null;
  const id = typeof model.id === "string" ? model.id.trim() : "";
  if (!id) return null;

  const normalized: any = {
    id,
    name: typeof model.name === "string" && model.name.trim() ? model.name.trim() : id,
    source: typeof model.source === "string" && model.source.trim() ? model.source.trim() : "imported",
  };

  if (typeof model.apiFormat === "string" && model.apiFormat.trim()) {
    normalized.apiFormat = model.apiFormat.trim();
  }
  if (Array.isArray(model.supportedEndpoints) && model.supportedEndpoints.length > 0) {
    normalized.supportedEndpoints = Array.from(
      new Set(
        model.supportedEndpoints
          .filter((endpoint) => typeof endpoint === "string" && endpoint.trim())
          .map((endpoint) => endpoint.trim())
      )
    ).sort();
  }
  if (typeof model.inputTokenLimit === "number" && Number.isFinite(model.inputTokenLimit)) {
    normalized.inputTokenLimit = model.inputTokenLimit;
  }
  if (typeof model.outputTokenLimit === "number" && Number.isFinite(model.outputTokenLimit)) {
    normalized.outputTokenLimit = model.outputTokenLimit;
  }
  if (typeof model.description === "string" && model.description.trim()) {
    normalized.description = model.description.trim();
  }
  if (model.supportsThinking === true) {
    normalized.supportsThinking = true;
  }

  return normalized;
}

export function normalizeSyncedAvailableModelsMap(input) {
  if (!isPlainObject(input)) return {};

  const normalized = {};
  for (const [providerId, connectionsMap] of Object.entries(input)) {
    if (!isPlainObject(connectionsMap)) continue;

    const normalizedConnections = {};
    for (const [connectionId, models] of Object.entries(connectionsMap)) {
      if (typeof connectionId !== "string" || !connectionId.trim() || !Array.isArray(models)) continue;
      const normalizedModels = models.map(normalizeSyncedAvailableModel).filter(Boolean);
      if (normalizedModels.length > 0) {
        normalizedConnections[connectionId.trim()] = normalizedModels;
      }
    }

    if (Object.keys(normalizedConnections).length > 0) {
      normalized[providerId] = normalizedConnections;
    }
  }

  return normalized;
}

export function cloneDefaultData() {
  return {
    providerConnections: [],
    providerNodes: [],
    proxyPools: [],
    modelAliases: {},
    customModels: [],
    syncedAvailableModels: {},
    disabledModels: {},
    customSkills: [],
    mitmAlias: {},
    combos: [],
    modelComboMappings: [],
    apiKeys: [],
    settings: mergeSettingsWithDefaults({}),
  };
}

export function validateDbImportPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new Error("Invalid database payload: expected an object");
  }

  if (payload.format !== DB_BACKUP_FORMAT) {
    throw new Error(`Invalid database payload format: expected ${DB_BACKUP_FORMAT}`);
  }

  const schemaVersion = Number(payload.schemaVersion || 1);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1 || schemaVersion > DB_BACKUP_SCHEMA_VERSION) {
    throw new Error(`Invalid database payload schemaVersion: ${payload.schemaVersion}`);
  }

  const defaults = cloneDefaultData();
  const allowedKeys = new Set([
    "format",
    "schemaVersion",
    ...Object.keys(defaults),
    "opencodeSync",
    "runtimeConfig",
    "tunnelState",
    "pricing",
  ]);

  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Invalid database payload: unknown top-level key ${key}`);
    }
  }

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (payload[key] === undefined) continue;

    if (Array.isArray(defaultValue) && !Array.isArray(payload[key])) {
      throw new Error(`Invalid database payload: ${key} must be an array`);
    }

    if (isPlainObject(defaultValue) && !isPlainObject(payload[key])) {
      throw new Error(`Invalid database payload: ${key} must be an object`);
    }
  }
}

export function migrateDbImportPayload(payload) {
  const schemaVersion = Number(payload?.schemaVersion || 1);
  if (schemaVersion >= DB_BACKUP_SCHEMA_VERSION) {
    return payload;
  }

  const migrated = { ...payload };

  if (schemaVersion < 2) {
    delete migrated.pricing;

    if (!Array.isArray(migrated.modelComboMappings)) {
      migrated.modelComboMappings = [];
    }

    if (Array.isArray(migrated.providerConnections)) {
      migrated.providerConnections = migrated.providerConnections.map((connection) => {
        if (!connection || typeof connection !== "object" || Array.isArray(connection)) return connection;
        const nextConnection = { ...connection };
        const normalizedProviderSpecificData = normalizeStoredProviderSpecificData(
          nextConnection.provider,
          nextConnection.providerSpecificData,
        );

        if (normalizedProviderSpecificData) {
          nextConnection.providerSpecificData = normalizedProviderSpecificData;
        } else {
          delete nextConnection.providerSpecificData;
        }

        return nextConnection;
      });
    }
  }

  migrated.schemaVersion = DB_BACKUP_SCHEMA_VERSION;
  return migrated;
}

export function logSafeError(message, error) {
  console.warn(message, {
    name: error?.name,
    code: error?.code,
    message: error?.message,
  });
}
