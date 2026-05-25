import * as log from "../utils/logger.js";
import { createRuntimeConfigLoader } from "./runtimeConfig.js";

type RequestCacheEntry<T = unknown> = {
	timestamp: number;
	data: T;
};

type D1Database = {
	prepare(query: string): {
		bind(...values: unknown[]): {
			first(): Promise<Record<string, unknown> | null>;
			all(): Promise<{ results?: Record<string, unknown>[] }>;
			run(): Promise<unknown>;
		};
	};
	batch(statements: unknown[]): Promise<unknown>;
};

type D1Env = {
	DB?: D1Database;
};

type RuntimeStateOverlayRecord = {
	routing_status_override?: string | null;
	health_status_override?: string | null;
	quota_state_override?: string | null;
	auth_state_override?: string | null;
	reason_code_override?: string | null;
	reason_detail_override?: string | null;
	next_retry_at?: string | null;
	reset_at?: string | null;
	backoff_level?: number | null;
	last_used_at?: string | null;
	consecutive_use_count?: number | null;
	sticky_until?: string | null;
	sticky_key_hash?: string | null;
	runtime_updated_at?: string | null;
};

type ProviderSyncRecord = {
	id: string;
	routingStatus?: string | null;
	healthStatus?: string | null;
	quotaState?: string | null;
	authState?: string | null;
	reasonCode?: string | null;
	reasonDetail?: string | null;
	nextRetryAt?: string | null;
	resetAt?: string | null;
	backoffLevel?: number | null;
	lastUsedAt?: string | null;
	consecutiveUseCount?: number | null;
} & Record<string, unknown>;

type ProviderSyncRow = Record<string, unknown> & {
	provider_id?: string;
	provider?: string;
	auth_type?: string | null;
	name?: string | null;
	priority?: number | null;
	global_priority?: number | null;
	default_model?: string | null;
	access_token?: string | null;
	refresh_token?: string | null;
	expires_at?: string | null;
	expires_in?: number | null;
	token_type?: string | null;
	scope?: string | null;
	api_key?: string | null;
	provider_specific_data?: string | null;
	is_active?: number | null;
	routing_status?: string | null;
	health_status?: string | null;
	quota_state?: string | null;
	auth_state?: string | null;
	reason_code?: string | null;
	reason_detail?: string | null;
	next_retry_at?: string | null;
	reset_at?: string | null;
	backoff_level?: number | null;
	last_checked_at?: string | null;
	allow_auth_recovery?: number | null;
	usage_snapshot?: string | null;
	version?: number | null;
	created_at?: string | null;
	updated_at?: string | null;
	sync_updated_at?: string | null;
};

type ApiKeyRow = Record<string, unknown> & {
	key_id?: string;
	key_value?: string;
	name?: string | null;
	is_active?: number | null;
	created_at?: string | null;
	updated_at?: string | null;
	sync_updated_at?: string | null;
};

type AliasRow = Record<string, unknown> & {
	alias?: string;
	target?: string;
};

type ComboRow = Record<string, unknown> & {
	combo_id?: string;
	payload_json?: string | null;
};

type SettingsRow = Record<string, unknown> & {
	settings_json?: string | null;
	strategy?: string | null;
	morph_json?: string | null;
	sync_updated_at?: string | null;
};

type RuntimeConfigRecord = {
	generatedAt: string | null;
	strategy: string;
	providers: Record<string, ProviderSyncRecord>;
	modelAliases: Record<string, string>;
	combos: Record<string, unknown>[];
	apiKeys: Array<Record<string, unknown>>;
	settings: Record<string, unknown> & { morph?: Record<string, unknown> };
};

type NormalizedSyncPayload = {
	generatedAt: string;
	strategy: string;
	providers: Record<string, Record<string, unknown>>;
	modelAliases: Record<string, string>;
	combos: Record<string, unknown>[];
	apiKeys: Record<string, unknown>[];
	settings: Record<string, unknown>;
};

type RuntimeConfigView = RuntimeConfigRecord & {
	meta?: Record<string, unknown>;
};

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs = 5000,
	operation = "R2 operation",
) {
	return Promise.race<T>([
		promise,
		new Promise<T>((_, reject) =>
			setTimeout(
				() => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)),
				timeoutMs,
			),
		),
	]);
}

// Request-scoped cache with LRU eviction
const requestCache = new Map<string, RequestCacheEntry>();
const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 5000;
const runtimeConfigLoader = createRuntimeConfigLoader();

const WORKER_RECORD_ID = "shared";

function cleanupCache() {
	if (requestCache.size > MAX_CACHE_SIZE) {
		const entries = Array.from(requestCache.entries());
		const toKeep = entries
			.sort((a, b) => b[1].timestamp - a[1].timestamp)
			.slice(0, MAX_CACHE_SIZE);
		requestCache.clear();
		toKeep.forEach(([key, value]) => requestCache.set(key, value));
	}
}

function hasD1(env: D1Env | null | undefined) {
	return !!env?.DB;
}

function requireD1(
	env: D1Env | null | undefined,
	operation = "runtime storage operation",
) {
	if (!hasD1(env)) {
		throw new Error(`D1 binding is required for ${operation}`);
	}
}

function runtimeCacheKey(runtimeId: string) {
	return `runtime:${runtimeId}`;
}

function d1Bool(value: unknown, fallback = false) {
	if (value === null || value === undefined) return fallback;
	return Number(value) === 1;
}

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
	if (!value) return fallback;
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}

function overlayRuntimeState(
	syncRecord: ProviderSyncRecord,
	runtimeRecord: RuntimeStateOverlayRecord | null = null,
) {
	if (!runtimeRecord) return syncRecord;
	return {
		...syncRecord,
		routingStatus:
			runtimeRecord.routing_status_override || syncRecord.routingStatus,
		healthStatus:
			runtimeRecord.health_status_override || syncRecord.healthStatus,
		quotaState: runtimeRecord.quota_state_override || syncRecord.quotaState,
		authState: runtimeRecord.auth_state_override || syncRecord.authState,
		reasonCode: runtimeRecord.reason_code_override || syncRecord.reasonCode,
		reasonDetail:
			runtimeRecord.reason_detail_override || syncRecord.reasonDetail,
		nextRetryAt: runtimeRecord.next_retry_at || syncRecord.nextRetryAt,
		resetAt: runtimeRecord.reset_at || syncRecord.resetAt,
		backoffLevel: runtimeRecord.backoff_level ?? syncRecord.backoffLevel ?? 0,
		lastUsedAt: runtimeRecord.last_used_at || syncRecord.lastUsedAt || null,
		consecutiveUseCount:
			runtimeRecord.consecutive_use_count ??
			syncRecord.consecutiveUseCount ??
			0,
		stickyUntil: runtimeRecord.sticky_until || null,
		stickyKeyHash: runtimeRecord.sticky_key_hash || null,
		runtimeUpdatedAt: runtimeRecord.runtime_updated_at || null,
	};
}

function mapProviderSyncRow(
	row: Record<string, unknown> | null,
): ProviderSyncRecord | null {
	if (!row) return null;
	return {
		id: row.provider_id as string,
		provider: row.provider,
		authType: row.auth_type,
		name: row.name,
		priority: row.priority,
		globalPriority: row.global_priority,
		defaultModel: row.default_model,
		accessToken: row.access_token,
		refreshToken: row.refresh_token,
		expiresAt: row.expires_at,
		expiresIn: row.expires_in,
		tokenType: row.token_type,
		scope: row.scope,
		apiKey: row.api_key,
		providerSpecificData: safeJsonParse(
			row.provider_specific_data as string,
			{},
		),
		isActive: d1Bool(row.is_active, true),
		routingStatus: (row.routing_status as string) || "eligible",
		healthStatus: (row.health_status as string) || "healthy",
		quotaState: (row.quota_state as string) || "ok",
		authState: (row.auth_state as string) || "ok",
		reasonCode: (row.reason_code as string) || null,
		reasonDetail: (row.reason_detail as string) || null,
		nextRetryAt: (row.next_retry_at as string) || null,
		resetAt: (row.reset_at as string) || null,
		backoffLevel: (row.backoff_level as number) ?? 0,
		lastCheckedAt: row.last_checked_at || null,
		allowAuthRecovery: d1Bool(row.allow_auth_recovery, true),
		usageSnapshot: row.usage_snapshot || null,
		version: row.version || null,
		createdAt: row.created_at || null,
		updatedAt: row.updated_at || null,
		syncUpdatedAt: row.sync_updated_at,
	};
}

async function getD1WorkerRegistry(env: D1Env) {
	const row = await env
		.DB!.prepare(
			`SELECT worker_id, registered_at, rotated_at,
            shared_secret_configured_at, updated_at
       FROM worker_registry
      WHERE worker_id = ?1`,
		)
		.bind(WORKER_RECORD_ID)
		.first();
	return row || null;
}

async function getD1RuntimeConfig(
	runtimeId: string,
	env: D1Env,
): Promise<RuntimeConfigRecord> {
	const providerRows = await env
		.DB!.prepare(
			`SELECT s.*, r.routing_status_override, r.health_status_override, r.quota_state_override,
            r.auth_state_override, r.reason_code_override, r.reason_detail_override,
            r.next_retry_at, r.reset_at, r.backoff_level, r.last_used_at,
            r.consecutive_use_count, r.sticky_until, r.sticky_key_hash, r.runtime_updated_at
       FROM provider_sync s
       LEFT JOIN provider_runtime_state r
         ON r.machine_id = s.machine_id AND r.provider_id = s.provider_id
      WHERE s.machine_id = ?1`,
		)
		.bind(runtimeId)
		.all();

	const apiKeyRows = await env
		.DB!.prepare(
			`SELECT key_id, key_value, name, is_active, created_at, updated_at, sync_updated_at
       FROM runtime_api_keys
      WHERE machine_id = ?1`,
		)
		.bind(runtimeId)
		.all();

	const aliasRows = await env
		.DB!.prepare(
			`SELECT alias, target FROM runtime_model_aliases WHERE machine_id = ?1`,
		)
		.bind(runtimeId)
		.all();

	const comboRows = await env
		.DB!.prepare(
			`SELECT combo_id, payload_json FROM runtime_combos WHERE machine_id = ?1`,
		)
		.bind(runtimeId)
		.all();

	const settingsRow = await env
		.DB!.prepare(
			`SELECT settings_json, strategy, morph_json, sync_updated_at
       FROM runtime_settings
      WHERE machine_id = ?1`,
		)
		.bind(runtimeId)
		.first();

	const providers: Record<string, ProviderSyncRecord> = {};
	for (const row of (providerRows.results || []) as ProviderSyncRow[]) {
		const syncRecord = mapProviderSyncRow(row);
		if (!syncRecord) continue;
		providers[syncRecord.id] = overlayRuntimeState(syncRecord, row);
	}

	const apiKeys = ((apiKeyRows.results || []) as ApiKeyRow[]).map((row) => ({
		id: row.key_id,
		key: row.key_value,
		name: row.name || null,
		isActive: d1Bool(row.is_active, true),
		createdAt: row.created_at || null,
		updatedAt: row.updated_at || null,
		syncUpdatedAt: row.sync_updated_at,
	}));

	const modelAliases = Object.fromEntries(
		((aliasRows.results || []) as AliasRow[]).map((row) => [
			row.alias || "",
			row.target || "",
		]),
	) as Record<string, string>;

	const combos = ((comboRows.results || []) as ComboRow[]).map((row) =>
		safeJsonParse<Record<string, unknown>>(row.payload_json, {
			id: row.combo_id || null,
		}),
	);
	const typedSettingsRow = settingsRow as SettingsRow | null;
	const settings: RuntimeConfigRecord["settings"] = typedSettingsRow
		? safeJsonParse<RuntimeConfigRecord["settings"]>(
				typedSettingsRow.settings_json,
				{},
			)
		: {};
	if (typedSettingsRow?.morph_json) {
		settings.morph = safeJsonParse<Record<string, unknown>>(
			typedSettingsRow.morph_json,
			settings.morph || {},
		);
	}

	const strategy =
		typeof typedSettingsRow?.strategy === "string"
			? typedSettingsRow.strategy
			: typeof settings.strategy === "string"
				? settings.strategy
				: "priority";

	return {
		generatedAt: typedSettingsRow?.sync_updated_at || null,
		strategy,
		providers,
		modelAliases,
		combos,
		apiKeys,
		settings,
	};
}

async function cacheD1RuntimeConfig(runtimeId: string, env: D1Env) {
	const data = await getD1RuntimeConfig(runtimeId, env);
	requestCache.set(runtimeCacheKey(runtimeId), { data, timestamp: Date.now() });
	cleanupCache();
	return data;
}

/**
 * R2 key helpers
 */
function cloneRecord<T>(value: T): T {
	if (value === undefined) return undefined as T;
	return structuredClone(value);
}

function normalizeSyncPayload(
	payload: Record<string, unknown> = {},
): NormalizedSyncPayload {
	const providers =
		payload?.providers &&
		typeof payload.providers === "object" &&
		!Array.isArray(payload.providers)
			? (payload.providers as Record<string, Record<string, unknown>>)
			: {};

	return {
		generatedAt:
			typeof payload?.generatedAt === "string" && payload.generatedAt
				? payload.generatedAt
				: new Date().toISOString(),
		strategy:
			typeof payload?.strategy === "string" && payload.strategy
				? payload.strategy
				: "priority",
		providers,
		modelAliases:
			payload?.modelAliases &&
			typeof payload.modelAliases === "object" &&
			!Array.isArray(payload.modelAliases)
				? (payload.modelAliases as Record<string, string>)
				: {},
		combos: Array.isArray(payload?.combos)
			? (payload.combos as Record<string, unknown>[])
			: [],
		apiKeys: Array.isArray(payload?.apiKeys)
			? (payload.apiKeys as Record<string, unknown>[])
			: [],
		settings:
			payload?.settings &&
			typeof payload.settings === "object" &&
			!Array.isArray(payload.settings)
				? (payload.settings as Record<string, unknown>)
				: {},
	};
}

function mapProviderForSync(
	providerId: string,
	provider: Record<string, unknown> = {},
	syncUpdatedAt: string,
) {
	return {
		providerId,
		provider:
			typeof provider.provider === "string" ? provider.provider : "unknown",
		authType: typeof provider.authType === "string" ? provider.authType : null,
		name: typeof provider.name === "string" ? provider.name : null,
		priority:
			typeof provider.priority === "number" &&
			Number.isFinite(provider.priority)
				? provider.priority
				: null,
		globalPriority:
			typeof provider.globalPriority === "number" &&
			Number.isFinite(provider.globalPriority)
				? provider.globalPriority
				: null,
		defaultModel:
			typeof provider.defaultModel === "string" ? provider.defaultModel : null,
		accessToken:
			typeof provider.accessToken === "string" ? provider.accessToken : null,
		refreshToken:
			typeof provider.refreshToken === "string" ? provider.refreshToken : null,
		expiresAt:
			typeof provider.expiresAt === "string" ? provider.expiresAt : null,
		expiresIn:
			typeof provider.expiresIn === "number" &&
			Number.isFinite(provider.expiresIn)
				? provider.expiresIn
				: null,
		tokenType:
			typeof provider.tokenType === "string" ? provider.tokenType : null,
		scope: typeof provider.scope === "string" ? provider.scope : null,
		apiKey: typeof provider.apiKey === "string" ? provider.apiKey : null,
		providerSpecificData: JSON.stringify(
			provider.providerSpecificData &&
				typeof provider.providerSpecificData === "object"
				? provider.providerSpecificData
				: {},
		),
		isActive: provider.isActive === false ? 0 : 1,
		routingStatus:
			typeof provider.routingStatus === "string"
				? provider.routingStatus
				: "eligible",
		healthStatus:
			typeof provider.healthStatus === "string"
				? provider.healthStatus
				: "healthy",
		quotaState:
			typeof provider.quotaState === "string" ? provider.quotaState : "ok",
		authState:
			typeof provider.authState === "string" ? provider.authState : "ok",
		reasonCode:
			typeof provider.reasonCode === "string" ? provider.reasonCode : null,
		reasonDetail:
			typeof provider.reasonDetail === "string" ? provider.reasonDetail : null,
		nextRetryAt:
			typeof provider.nextRetryAt === "string" ? provider.nextRetryAt : null,
		resetAt: typeof provider.resetAt === "string" ? provider.resetAt : null,
		backoffLevel:
			typeof provider.backoffLevel === "number" &&
			Number.isFinite(provider.backoffLevel)
				? provider.backoffLevel
				: 0,
		lastCheckedAt:
			typeof provider.lastCheckedAt === "string"
				? provider.lastCheckedAt
				: null,
		allowAuthRecovery: provider.allowAuthRecovery === false ? 0 : 1,
		usageSnapshot:
			provider.usageSnapshot && typeof provider.usageSnapshot === "object"
				? JSON.stringify(provider.usageSnapshot)
				: null,
		version:
			typeof provider.version === "number" && Number.isFinite(provider.version)
				? provider.version
				: null,
		createdAt:
			typeof provider.createdAt === "string" ? provider.createdAt : null,
		updatedAt:
			typeof provider.updatedAt === "string" ? provider.updatedAt : null,
		syncUpdatedAt,
	};
}

function buildCredentialUpdatePatch(
	newCredentials: Record<string, unknown> = {},
) {
	const patch: Record<string, unknown> = {};

	if (
		typeof newCredentials.accessToken === "string" &&
		newCredentials.accessToken
	) {
		patch.accessToken = newCredentials.accessToken;
	}
	if (
		typeof newCredentials.refreshToken === "string" &&
		newCredentials.refreshToken
	) {
		patch.refreshToken = newCredentials.refreshToken;
	}
	if (
		typeof newCredentials.tokenType === "string" &&
		newCredentials.tokenType
	) {
		patch.tokenType = newCredentials.tokenType;
	}
	if (typeof newCredentials.scope === "string" && newCredentials.scope) {
		patch.scope = newCredentials.scope;
	}
	if (
		typeof newCredentials.expiresAt === "string" &&
		newCredentials.expiresAt
	) {
		patch.expiresAt = newCredentials.expiresAt;
	}
	if (
		typeof newCredentials.expiresIn === "number" &&
		Number.isFinite(newCredentials.expiresIn)
	) {
		patch.expiresIn = newCredentials.expiresIn;
		if (!patch.expiresAt) {
			patch.expiresAt = new Date(
				Date.now() + newCredentials.expiresIn * 1000,
			).toISOString();
		}
	}

	return patch;
}

async function persistD1ProviderCredentials(
	runtimeId: string,
	connectionId: string,
	patch: Record<string, unknown>,
	env: D1Env,
) {
	const syncUpdatedAt = new Date().toISOString();
	await env
		.DB!.prepare(
			`UPDATE provider_sync
        SET access_token = COALESCE(?3, access_token),
            refresh_token = COALESCE(?4, refresh_token),
            token_type = COALESCE(?5, token_type),
            scope = COALESCE(?6, scope),
            expires_at = COALESCE(?7, expires_at),
            expires_in = COALESCE(?8, expires_in),
            updated_at = ?9,
            sync_updated_at = sync_updated_at
      WHERE machine_id = ?1 AND provider_id = ?2`,
		)
		.bind(
			runtimeId,
			connectionId,
			patch.accessToken || null,
			patch.refreshToken || null,
			patch.tokenType || null,
			patch.scope || null,
			patch.expiresAt || null,
			Number.isFinite(patch.expiresIn) ? patch.expiresIn : null,
			syncUpdatedAt,
		)
		.run();
}

async function deleteD1RuntimeData(
	runtimeId: string,
	env: D1Env,
	{ preserveRegistry = false }: { preserveRegistry?: boolean } = {},
) {
	const db = env.DB!;
	const statements = [
		db
			.prepare(`DELETE FROM provider_runtime_state WHERE machine_id = ?1`)
			.bind(runtimeId),
		db
			.prepare(`DELETE FROM provider_sync WHERE machine_id = ?1`)
			.bind(runtimeId),
		db
			.prepare(`DELETE FROM runtime_api_keys WHERE machine_id = ?1`)
			.bind(runtimeId),
		db
			.prepare(`DELETE FROM runtime_model_aliases WHERE machine_id = ?1`)
			.bind(runtimeId),
		db
			.prepare(`DELETE FROM runtime_combos WHERE machine_id = ?1`)
			.bind(runtimeId),
		db
			.prepare(`DELETE FROM runtime_settings WHERE machine_id = ?1`)
			.bind(runtimeId),
	];

	if (!preserveRegistry && runtimeId === WORKER_RECORD_ID) {
		statements.push(
			db
				.prepare(`DELETE FROM worker_registry WHERE worker_id = ?1`)
				.bind(runtimeId),
		);
	}

	await db.batch(statements);
	requestCache.delete(runtimeId);
	requestCache.delete(runtimeCacheKey(runtimeId));
}

export async function saveRuntimeSyncPayload(
	machineId: string,
	payload: Record<string, unknown>,
	env: D1Env,
) {
	if (!hasD1(env)) {
		throw new Error("D1 binding is required for runtime sync payloads");
	}
	const db = env.DB!;

	const normalized = normalizeSyncPayload(payload);
	const syncUpdatedAt = normalized.generatedAt;
	const providerEntries = Object.entries(normalized.providers || {});
	const providerIds = providerEntries.map(([providerId]) => providerId);
	const aliasEntries = Object.entries(normalized.modelAliases || {});
	const comboEntries = normalized.combos.map(
		(combo, index) =>
			[
				(typeof combo?.id === "string" && combo.id) || `combo-${index}`,
				combo,
			] as const,
	);
	const apiKeyEntries = normalized.apiKeys.map(
		(apiKey, index) =>
			[
				(typeof apiKey?.id === "string" && apiKey.id) || `api-key-${index}`,
				apiKey,
			] as const,
	);

	const statements = [
		db
			.prepare(`DELETE FROM runtime_api_keys WHERE machine_id = ?1`)
			.bind(machineId),
		db
			.prepare(`DELETE FROM runtime_model_aliases WHERE machine_id = ?1`)
			.bind(machineId),
		db
			.prepare(`DELETE FROM runtime_combos WHERE machine_id = ?1`)
			.bind(machineId),
	];

	if (providerIds.length > 0) {
		const placeholders = providerIds
			.map((_, index) => `?${index + 2}`)
			.join(", ");
		statements.push(
			db
				.prepare(
					`DELETE FROM provider_runtime_state WHERE machine_id = ?1 AND provider_id NOT IN (${placeholders})`,
				)
				.bind(machineId, ...providerIds),
			db
				.prepare(
					`DELETE FROM provider_sync WHERE machine_id = ?1 AND provider_id NOT IN (${placeholders})`,
				)
				.bind(machineId, ...providerIds),
		);
	} else {
		statements.push(
			db
				.prepare(`DELETE FROM provider_runtime_state WHERE machine_id = ?1`)
				.bind(machineId),
			db
				.prepare(`DELETE FROM provider_sync WHERE machine_id = ?1`)
				.bind(machineId),
		);
	}

	for (const [providerId, provider] of providerEntries) {
		const row = mapProviderForSync(providerId, provider, syncUpdatedAt);
		statements.push(
			db
				.prepare(
					`INSERT INTO provider_sync (
            machine_id, provider_id, provider, auth_type, name, priority, global_priority,
            default_model, access_token, refresh_token, expires_at, expires_in, token_type,
            scope, api_key, provider_specific_data, is_active, routing_status, health_status,
            quota_state, auth_state, reason_code, reason_detail, next_retry_at, reset_at,
            backoff_level, last_checked_at, allow_auth_recovery, usage_snapshot, version,
            created_at, updated_at, sync_updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33)
         ON CONFLICT(machine_id, provider_id) DO UPDATE SET
            provider = excluded.provider,
            auth_type = excluded.auth_type,
            name = excluded.name,
            priority = excluded.priority,
            global_priority = excluded.global_priority,
            default_model = excluded.default_model,
            access_token = excluded.access_token,
            refresh_token = excluded.refresh_token,
            expires_at = excluded.expires_at,
            expires_in = excluded.expires_in,
            token_type = excluded.token_type,
            scope = excluded.scope,
            api_key = excluded.api_key,
            provider_specific_data = excluded.provider_specific_data,
            is_active = excluded.is_active,
            routing_status = excluded.routing_status,
            health_status = excluded.health_status,
            quota_state = excluded.quota_state,
            auth_state = excluded.auth_state,
            reason_code = excluded.reason_code,
            reason_detail = excluded.reason_detail,
            next_retry_at = excluded.next_retry_at,
            reset_at = excluded.reset_at,
            backoff_level = excluded.backoff_level,
            last_checked_at = excluded.last_checked_at,
            allow_auth_recovery = excluded.allow_auth_recovery,
            usage_snapshot = excluded.usage_snapshot,
            version = excluded.version,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            sync_updated_at = excluded.sync_updated_at`,
				)
				.bind(
					machineId,
					row.providerId,
					row.provider,
					row.authType,
					row.name,
					row.priority,
					row.globalPriority,
					row.defaultModel,
					row.accessToken,
					row.refreshToken,
					row.expiresAt,
					row.expiresIn,
					row.tokenType,
					row.scope,
					row.apiKey,
					row.providerSpecificData,
					row.isActive,
					row.routingStatus,
					row.healthStatus,
					row.quotaState,
					row.authState,
					row.reasonCode,
					row.reasonDetail,
					row.nextRetryAt,
					row.resetAt,
					row.backoffLevel,
					row.lastCheckedAt,
					row.allowAuthRecovery,
					row.usageSnapshot,
					row.version,
					row.createdAt,
					row.updatedAt,
					row.syncUpdatedAt,
				),
		);
	}

	for (const [keyId, apiKey] of apiKeyEntries) {
		statements.push(
			db
				.prepare(
					`INSERT INTO runtime_api_keys (machine_id, key_id, key_value, name, is_active, created_at, updated_at, sync_updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
				)
				.bind(
					machineId,
					keyId,
					typeof apiKey.key === "string" ? apiKey.key : "",
					typeof apiKey.name === "string" ? apiKey.name : null,
					apiKey.isActive === false ? 0 : 1,
					typeof apiKey.createdAt === "string" ? apiKey.createdAt : null,
					typeof apiKey.updatedAt === "string" ? apiKey.updatedAt : null,
					syncUpdatedAt,
				),
		);
	}

	for (const [alias, target] of aliasEntries) {
		statements.push(
			db
				.prepare(
					`INSERT INTO runtime_model_aliases (machine_id, alias, target, sync_updated_at)
         VALUES (?1, ?2, ?3, ?4)`,
				)
				.bind(machineId, alias, target, syncUpdatedAt),
		);
	}

	for (const [comboId, combo] of comboEntries) {
		statements.push(
			db
				.prepare(
					`INSERT INTO runtime_combos (machine_id, combo_id, payload_json, sync_updated_at)
         VALUES (?1, ?2, ?3, ?4)`,
				)
				.bind(machineId, comboId, JSON.stringify(combo || {}), syncUpdatedAt),
		);
	}

	statements.push(
		db
			.prepare(
				`INSERT INTO runtime_settings (machine_id, settings_json, strategy, morph_json, sync_updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(machine_id) DO UPDATE SET
          settings_json = excluded.settings_json,
          strategy = excluded.strategy,
          morph_json = excluded.morph_json,
          sync_updated_at = excluded.sync_updated_at`,
			)
			.bind(
				machineId,
				JSON.stringify(normalized.settings || {}),
				normalized.strategy ||
					(typeof normalized.settings.strategy === "string"
						? normalized.settings.strategy
						: "priority"),
				normalized.settings.morph &&
					typeof normalized.settings.morph === "object"
					? JSON.stringify(normalized.settings.morph)
					: null,
				syncUpdatedAt,
			),
	);

	await db.batch(statements);
	requestCache.delete(machineId);
	requestCache.delete(runtimeCacheKey(machineId));

	return {
		generatedAt: syncUpdatedAt,
		providerCount: providerIds.length,
		modelAliasCount: aliasEntries.length,
		comboCount: comboEntries.length,
		apiKeyCount: apiKeyEntries.length,
	};
}

function mergeProviderMaps(
	runtimeProviders: Record<string, Record<string, unknown>> = {},
	localProviders: Record<string, Record<string, unknown>> = {},
) {
	const merged: Record<string, Record<string, unknown>> = {
		...runtimeProviders,
	};

	for (const [providerId, localProvider] of Object.entries(
		localProviders || {},
	)) {
		merged[providerId] = {
			...(runtimeProviders?.[providerId] || {}),
			...cloneRecord(localProvider),
		};
	}

	return merged;
}

/**
 * Get machine data from R2 (with request-scope caching)
 * @param {string} machineId
 * @param {Object} env
 * @returns {Promise<Object|null>}
 */
export async function getRuntimeData(runtimeId: string, env: D1Env) {
	requireD1(env, "runtime reads");

	if (runtimeId === WORKER_RECORD_ID) {
		const registry = await getD1WorkerRegistry(env);
		if (!registry) {
			log.debug("STORAGE", `Worker registry not found: ${runtimeId}`);
			return null;
		}
		return {
			providers: {},
			modelAliases: {},
			combos: [],
			apiKeys: [],
			settings: {},
			meta: {
				registeredAt: registry.registered_at || null,
				rotatedAt: registry.rotated_at || null,
				sharedSecretConfiguredAt: registry.shared_secret_configured_at || null,
			},
			updatedAt: registry.updated_at,
		};
	}

	const cached = requestCache.get(runtimeCacheKey(runtimeId));
	if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
		return cached.data;
	}

	const data = await cacheD1RuntimeConfig(runtimeId, env);
	log.debug("STORAGE", `Retrieved: ${runtimeId}`);
	return data;
}

/**
 * Get runtime registration metadata for a runtime.
 * @param {string} runtimeId
 * @param {Object} env
 * @returns {Promise<Object|null>}
 */
export async function getRuntimeRegistration(runtimeId: string, env: D1Env) {
	const data = (await getRuntimeData(runtimeId, env)) as {
		meta?: Record<string, unknown>;
	} | null;
	const meta = (data?.meta || {}) as Record<string, unknown>;

	if (typeof meta.runtimeUrl !== "string" || !meta.runtimeUrl) {
		return null;
	}

	const registration: { runtimeUrl: string; cacheTtlMs?: number } = {
		runtimeUrl: meta.runtimeUrl,
	};

	if (
		typeof meta.cacheTtlSeconds === "number" &&
		Number.isFinite(meta.cacheTtlSeconds)
	) {
		registration.cacheTtlMs = meta.cacheTtlSeconds * 1000;
	} else if (
		typeof meta.cacheTtlMs === "number" &&
		Number.isFinite(meta.cacheTtlMs)
	) {
		registration.cacheTtlMs = meta.cacheTtlMs;
	}

	return registration;
}

/**
 * Get remote runtime config for a runtime registration.
 * @param {string} runtimeId
 * @param {Object} env
 * @param {Object} options
 * @returns {Promise<Object|null>}
 */
export async function getRuntimeConfig(
	runtimeId: string,
	env: D1Env,
	options: { forceRefresh?: boolean } = {},
) {
	requireD1(env, "runtime config reads");

	const cached = requestCache.get(runtimeCacheKey(runtimeId));
	if (
		!options.forceRefresh &&
		cached &&
		Date.now() - cached.timestamp < CACHE_TTL_MS
	) {
		return cached.data as RuntimeConfigView;
	}
	return cacheD1RuntimeConfig(runtimeId, env);
}

export async function ensureRuntimeProviderState(
	runtimeId: string,
	connectionId: string,
	env: D1Env,
	options: {
		runtimeConfig?: RuntimeConfigView | null;
		runtimeConfigLoader?: unknown;
	} = {},
) {
	const runtimeConfig =
		options.runtimeConfig ||
		(await getRuntimeConfig(runtimeId, env, {
			forceRefresh: false,
		}));

	if (!runtimeConfig?.providers || !connectionId) {
		return null;
	}

	return runtimeConfig;
}

export async function updateRuntimeProviderState(
	runtimeId: string,
	connectionId: string,
	updater: (
		provider: Record<string, unknown>,
		runtimeConfig: RuntimeConfigView,
	) => void,
	env: D1Env,
	options: {
		runtimeConfig?: RuntimeConfigView | null;
		forceRefresh?: boolean;
	} = {},
) {
	if (!connectionId || typeof updater !== "function") {
		return null;
	}

	const runtimeConfig =
		options.runtimeConfig || (await getRuntimeConfig(runtimeId, env, options));
	const provider = runtimeConfig?.providers?.[connectionId];
	if (!provider) {
		return null;
	}

	updater(provider, runtimeConfig);
	provider.updatedAt = new Date().toISOString();

	if (hasD1(env)) {
		const db = env.DB!;
		const now = new Date().toISOString();
		await db
			.prepare(
				`INSERT INTO provider_runtime_state (
          machine_id, provider_id, routing_status_override, health_status_override,
          quota_state_override, auth_state_override, reason_code_override,
          reason_detail_override, next_retry_at, reset_at, backoff_level,
          last_used_at, consecutive_use_count, sticky_until, sticky_key_hash,
          runtime_updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
       ON CONFLICT(machine_id, provider_id) DO UPDATE SET
          routing_status_override = excluded.routing_status_override,
          health_status_override = excluded.health_status_override,
          quota_state_override = excluded.quota_state_override,
          auth_state_override = excluded.auth_state_override,
          reason_code_override = excluded.reason_code_override,
          reason_detail_override = excluded.reason_detail_override,
          next_retry_at = excluded.next_retry_at,
          reset_at = excluded.reset_at,
          backoff_level = excluded.backoff_level,
          last_used_at = excluded.last_used_at,
          consecutive_use_count = excluded.consecutive_use_count,
          sticky_until = excluded.sticky_until,
          sticky_key_hash = excluded.sticky_key_hash,
          runtime_updated_at = excluded.runtime_updated_at`,
			)
			.bind(
				runtimeId,
				connectionId,
				provider.routingStatus || null,
				provider.healthStatus || null,
				provider.quotaState || null,
				provider.authState || null,
				provider.reasonCode || null,
				provider.reasonDetail || null,
				provider.nextRetryAt || null,
				provider.resetAt || null,
				provider.backoffLevel ?? 0,
				provider.lastUsedAt || null,
				provider.consecutiveUseCount ?? 0,
				provider.stickyUntil || null,
				provider.stickyKeyHash || null,
				now,
			)
			.run();

		requestCache.set(runtimeCacheKey(runtimeId), {
			data: runtimeConfig,
			timestamp: Date.now(),
		});
		cleanupCache();
	}

	return runtimeConfig;
}

export async function updateRuntimeProviderCredentials(
	machineId: string,
	connectionId: string,
	newCredentials: Record<string, unknown>,
	env: D1Env,
	options: {
		runtimeConfig?: RuntimeConfigView | null;
		forceRefresh?: boolean;
	} = {},
) {
	if (!connectionId) {
		return null;
	}

	const runtimeConfig =
		options.runtimeConfig || (await getRuntimeConfig(machineId, env, options));
	const provider = runtimeConfig?.providers?.[connectionId];
	if (!provider) {
		return null;
	}

	const patch = buildCredentialUpdatePatch(newCredentials);
	if (Object.keys(patch).length === 0) {
		return runtimeConfig;
	}

	Object.assign(provider, patch);
	provider.updatedAt = new Date().toISOString();

	if (hasD1(env)) {
		await persistD1ProviderCredentials(machineId, connectionId, patch, env);
		requestCache.set(runtimeCacheKey(machineId), {
			data: runtimeConfig,
			timestamp: Date.now(),
		});
		cleanupCache();
		return runtimeConfig;
	}

	return updateRuntimeProviderState(
		machineId,
		connectionId,
		(conn) => {
			Object.assign(conn, patch);
		},
		env,
		{
			...options,
			runtimeConfig,
		},
	);
}

export async function invalidateRuntimeConfig(
	runtimeId: string,
	env: D1Env,
	_options: Record<string, never> = {},
) {
	requireD1(env, "runtime config invalidation");
	requestCache.delete(runtimeCacheKey(runtimeId));
	return true;
}

/**
 * Save runtime data to D1-backed cloud storage.
 * @param {string} runtimeId
 * @param {Object} data
 * @param {Object} env
 */
export async function saveRuntimeData(
	runtimeId: string,
	data: Record<string, unknown> & {
		meta?: Record<string, unknown>;
		updatedAt?: string;
	},
	env: D1Env,
) {
	requireD1(env, "runtime writes");

	const now = new Date().toISOString();
	data.updatedAt = now;

	if (runtimeId !== WORKER_RECORD_ID) {
		throw new Error(
			"Direct runtime writes are deprecated. Publish runtime state through /sync/shared.",
		);
	}

	const meta = (data.meta || {}) as Record<string, unknown>;
	await env
		.DB!.prepare(
			`INSERT INTO worker_registry (
          worker_id, runtime_url, cache_ttl_seconds, registered_at, rotated_at,
          shared_secret_configured_at, runtime_refresh_requested_at,
          runtime_artifacts_loaded_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT(worker_id) DO UPDATE SET
          runtime_url = excluded.runtime_url,
          cache_ttl_seconds = excluded.cache_ttl_seconds,
          registered_at = excluded.registered_at,
          rotated_at = excluded.rotated_at,
          shared_secret_configured_at = excluded.shared_secret_configured_at,
          runtime_refresh_requested_at = excluded.runtime_refresh_requested_at,
          runtime_artifacts_loaded_at = excluded.runtime_artifacts_loaded_at,
          updated_at = excluded.updated_at`,
		)
		.bind(
			runtimeId,
			null,
			null,
			meta.registeredAt || null,
			meta.rotatedAt || null,
			meta.sharedSecretConfiguredAt || null,
			null,
			null,
			now,
		)
		.run();

	requestCache.set(runtimeId, { data, timestamp: Date.now() });
	cleanupCache();
	log.debug("STORAGE", `Saved worker registry: ${runtimeId}`);
}

/**
 * Delete runtime data from D1-backed cloud storage.
 * @param {string} runtimeId
 * @param {Object} env
 */
export async function deleteRuntimeData(runtimeId: string, env: D1Env) {
	requireD1(env, "runtime deletes");
	await deleteD1RuntimeData(runtimeId, env, { preserveRegistry: false });
	log.debug("STORAGE", `Deleted D1 runtime data: ${runtimeId}`);
}

/**
 * Update specific fields in runtime provider state.
 * @param {string} runtimeId
 * @param {string} connectionId
 * @param {Object} updates
 * @param {Object} env
 */
export async function updateRuntimeProvider(
	runtimeId: string,
	connectionId: string,
	updates: Record<string, unknown>,
	env: D1Env,
) {
	return updateRuntimeProviderState(
		runtimeId,
		connectionId,
		(provider) => {
			Object.assign(provider, updates);
		},
		env,
	);
}
