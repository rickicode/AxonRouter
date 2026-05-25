// SQLite WAL is the single source of truth for provider hot state.
import {
	deleteHotState,
	loadHotStates,
	loadProviderHotState,
	loadProviderHotStateMetadata,
	markProviderHotStateInvalidated,
	upsertHotState,
} from "./sqliteHelpers";
import { sqliteWriteGate } from "./sqliteWriteGate";
import { HOT_STATE_KEYS } from "./hotStateKeys";
import {
	getConnectionCooldownUntil,
	getConnectionStatusDetails,
} from "./connectionStatus";

const providerStateCache = new Map();
const sqliteHotStateCache = new Map();
const MAX_CACHE_ENTRIES = 50;

function evictCacheIfNeeded() {
	if (providerStateCache.size > MAX_CACHE_ENTRIES) {
		const oldest = providerStateCache.keys().next().value;
		providerStateCache.delete(oldest);
		sqliteHotStateCache.delete(oldest);
	}
	if (sqliteHotStateCache.size > MAX_CACHE_ENTRIES) {
		const oldest = sqliteHotStateCache.keys().next().value;
		sqliteHotStateCache.delete(oldest);
	}
}

const LEGACY_MIRROR_FIELDS = new Set([
	"testStatus",
	"lastError",
	"lastErrorType",
	"lastErrorAt",
	"rateLimitedUntil",
	"errorCode",
	"lastTested",
]);

const SECRET_STATE_FIELDS = new Set([
	"apiKey",
	"accessToken",
	"refreshToken",
	"idToken",
	"token",
	"password",
	"clientSecret",
]);

const CANONICAL_ROUTING_STATUSES = new Set([
	"eligible",
	"exhausted",
	"blocked",
	"unknown",
	"disabled",
]);

export function sanitizeConnectionStatusRecord(state = null) {
	if (!state || typeof state !== "object") return state;
	const sanitized = { ...state };
	for (const key of LEGACY_MIRROR_FIELDS) delete sanitized[key];
	if (
		"routingStatus" in sanitized &&
		!CANONICAL_ROUTING_STATUSES.has(sanitized.routingStatus)
	) {
		delete sanitized.routingStatus;
	}
	return sanitized;
}

function stripLegacyMirrorFields(state = null) {
	return sanitizeConnectionStatusRecord(state);
}

function sanitizeHotStateInput(state = null) {
	const sanitized = extractHotState(stripLegacyMirrorFields(state || {}));
	for (const key of SECRET_STATE_FIELDS) delete sanitized[key];
	return sanitized;
}

function mergeHotState(base, updates) {
	return {
		...sanitizeHotStateInput(base || {}),
		...sanitizeHotStateInput(updates || {}),
	};
}

function normalizeConnectionRef(entry) {
	if (!entry) return null;
	if (typeof entry === "string")
		return { connectionId: entry, providerId: null, connection: null };
	if (typeof entry === "object") {
		const connectionId = entry.connectionId || entry.id || null;
		const providerId = entry.providerId || entry.provider || null;
		if (!connectionId || !providerId) return null;
		return { connectionId, providerId, connection: entry };
	}
	return null;
}

function getProviderScopedConnectionKey(providerId, connectionId) {
	if (!providerId || !connectionId) return null;
	return `${providerId}:${connectionId}`;
}

function createEmptyProviderState() {
	return {
		connections: new Map(),
		eligibleConnectionIds: null,
		retryAt: null,
		updatedAt: null,
		sqliteVersion: 0,
	};
}

function getConnectionRetryAt(state: any = {}) {
	return getConnectionCooldownUntil(state);
}

function isConnectionEligible(state: any = {}) {
	return getConnectionStatusDetails(state).status === "eligible";
}

function recalculateProviderIndexes(providerState) {
	const eligibleConnectionIds = new Set();
	const retryCandidates = [];
	for (const [
		connectionId,
		connectionState,
	] of providerState.connections.entries()) {
		if (isConnectionEligible(connectionState)) {
			eligibleConnectionIds.add(connectionId);
		} else {
			const retryAt = getConnectionRetryAt(connectionState);
			if (retryAt) retryCandidates.push(retryAt);
		}
	}
	providerState.eligibleConnectionIds = eligibleConnectionIds;
	providerState.retryAt =
		retryCandidates.length > 0 ? retryCandidates.sort()[0] : null;
	providerState.updatedAt = new Date().toISOString();
	return providerState;
}

function loadScopedHotStateFromSqlite(providerId, connectionIds = []) {
	try {
		return loadHotStates(providerId, connectionIds);
	} catch {
		return {};
	}
}

function loadProviderStateFromSqlite(providerId) {
	try {
		const sqliteStates = loadProviderHotState(providerId);
		const sqliteMetadata = loadProviderHotStateMetadata(providerId);
		if (!sqliteStates || Object.keys(sqliteStates).length === 0) {
			sqliteHotStateCache.delete(providerId);
			if (!sqliteMetadata) return null;
			const providerState = createEmptyProviderState();
			providerState.updatedAt = sqliteMetadata.updatedAt || null;
			providerState.sqliteVersion = Math.max(
				0,
				Number(sqliteMetadata.version) || 0,
			);
			providerStateCache.set(providerId, providerState);
			return providerState;
		}
		sqliteHotStateCache.set(providerId, { ...sqliteStates });
		const providerState = createEmptyProviderState();
		for (const [connectionId, connectionState] of Object.entries(
			sqliteStates,
		)) {
			providerState.connections.set(
				connectionId,
				mergeHotState({}, connectionState),
			);
		}
		recalculateProviderIndexes(providerState);
		providerState.updatedAt =
			sqliteMetadata?.updatedAt || providerState.updatedAt;
		providerState.sqliteVersion = Math.max(
			0,
			Number(sqliteMetadata?.version) || 0,
		);
		providerStateCache.set(providerId, providerState);
		return providerState;
	} catch {
		return null;
	}
}

// --- Public API ---

export function isHotStateKey(key) {
	return HOT_STATE_KEYS.has(key) || key.startsWith("modelLock_");
}

export function extractHotState(updates = {}) {
	const hotState = {};
	for (const [key, value] of Object.entries(updates || {})) {
		if (isHotStateKey(key)) hotState[key] = value;
	}
	return hotState;
}

export function isHotOnlyUpdate(updates = {}) {
	const keys = Object.keys(updates || {});
	if (keys.length === 0) return false;
	return keys.every((key) => isHotStateKey(key));
}

export async function getProviderHotState(providerId) {
	if (!providerId) return null;
	if (providerStateCache.has(providerId))
		return providerStateCache.get(providerId);
	return loadProviderStateFromSqlite(providerId) || null;
}

export function projectProviderHotState(
	connection: any = {},
	providerState = null,
) {
	if (!connection || typeof connection !== "object") return connection;
	if (!providerState) return connection;
	const connectionHotState =
		providerState.connections.get(connection.id) || null;
	if (!connectionHotState) return { ...connection };
	return { ...connection, ...stripLegacyMirrorFields(connectionHotState) };
}

export async function getConnectionHotState(connectionId, providerId) {
	if (!connectionId || !providerId) return null;
	const providerState = await getProviderHotState(providerId);
	if (!providerState) {
		const fallbackStates = await getConnectionHotStates([
			{ id: connectionId, provider: providerId },
		]);
		return (
			fallbackStates.get(
				getProviderScopedConnectionKey(providerId, connectionId),
			) ||
			fallbackStates.get(connectionId) ||
			null
		);
	}
	return projectProviderHotState({ id: connectionId }, providerState);
}

export async function getConnectionHotStates(connectionRefs = []) {
	const refs = [
		...new Map(
			(connectionRefs || [])
				.map(normalizeConnectionRef)
				.filter(Boolean)
				.map((ref) => [`${ref.providerId}:${ref.connectionId}`, ref]),
		).values(),
	];
	const result = new Map();
	if (refs.length === 0) return result;

	const connectionIdProviderCounts = new Map();
	const refsByProvider = new Map();
	for (const ref of refs) {
		connectionIdProviderCounts.set(
			ref.connectionId,
			(connectionIdProviderCounts.get(ref.connectionId) || 0) + 1,
		);
		if (!refsByProvider.has(ref.providerId))
			refsByProvider.set(ref.providerId, []);
		refsByProvider.get(ref.providerId).push(ref);
	}

	for (const [providerId, providerRefs] of refsByProvider.entries()) {
		const providerState = await getProviderHotState(providerId);
		let sqliteStates = {};

		if (!providerState) {
			const cachedSqliteState = sqliteHotStateCache.get(providerId) || null;
			const requestedConnectionIds = providerRefs.map(
				(ref) => ref.connectionId,
			);
			if (cachedSqliteState) {
				sqliteStates = Object.fromEntries(
					requestedConnectionIds
						.filter((id) => cachedSqliteState[id])
						.map((id) => [id, cachedSqliteState[id]]),
				);
				const missing = requestedConnectionIds.filter(
					(id) => !sqliteStates[id],
				);
				if (missing.length > 0) {
					const loaded = loadScopedHotStateFromSqlite(providerId, missing);
					sqliteStates = { ...sqliteStates, ...loaded };
					if (Object.keys(loaded).length > 0) {
						sqliteHotStateCache.set(providerId, {
							...cachedSqliteState,
							...loaded,
						});
					}
				}
			} else {
				sqliteStates = loadScopedHotStateFromSqlite(
					providerId,
					requestedConnectionIds,
				);
			}
		}

		for (const ref of providerRefs) {
			const baseConnection = ref.connection || {
				id: ref.connectionId,
				provider: ref.providerId,
			};
			const sqliteState = sqliteStates?.[ref.connectionId] || null;
			const canonicalFallback = extractHotState(baseConnection);
			const projected = providerState
				? projectProviderHotState(baseConnection, providerState)
				: sqliteState || Object.keys(canonicalFallback).length > 0
					? {
							...baseConnection,
							...stripLegacyMirrorFields(canonicalFallback),
							...sanitizeHotStateInput(sqliteState || {}),
						}
					: { ...baseConnection };
			const scopedKey = getProviderScopedConnectionKey(
				ref.providerId,
				ref.connectionId,
			);
			result.set(scopedKey, projected);
			if (
				connectionIdProviderCounts.get(ref.connectionId) === 1 &&
				!result.has(ref.connectionId)
			) {
				result.set(ref.connectionId, projected);
			}
		}
	}

	return result;
}

export async function setConnectionHotState(
	connectionId,
	providerId,
	updates = {},
) {
	if (!connectionId || !providerId || !updates || typeof updates !== "object") {
		return { state: null };
	}

	const sanitizedUpdates = sanitizeHotStateInput(updates);
	const cachedProviderState =
		(await getProviderHotState(providerId)) || createEmptyProviderState();
	const providerState = {
		...cachedProviderState,
		connections: new Map(cachedProviderState.connections),
	};
	const current = providerState.connections.get(connectionId) || {};
	const next = mergeHotState(current, sanitizedUpdates);

	providerState.connections.set(connectionId, next);
	recalculateProviderIndexes(providerState);

	const storedInSqlite = Boolean(
		sqliteWriteGate(() => {
			const result = upsertHotState(providerId, connectionId, next);
			if (result) markProviderHotStateInvalidated(providerId);
			return result;
		}),
	);
	if (storedInSqlite) {
		const cached = { ...(sqliteHotStateCache.get(providerId) || {}) };
		cached[connectionId] = extractHotState(next);
		sqliteHotStateCache.set(providerId, cached);
		providerStateCache.set(providerId, providerState);
		evictCacheIfNeeded();
	}

	return {
		storedInSqlite,
		state: stripLegacyMirrorFields(next),
		providerState: {
			eligibleConnectionIds: providerState.eligibleConnectionIds
				? [...providerState.eligibleConnectionIds]
				: null,
			retryAt: providerState.retryAt,
			updatedAt: providerState.updatedAt,
		},
	};
}

export async function deleteConnectionHotState(connectionId, providerId) {
	if (!connectionId || !providerId) return;

	sqliteWriteGate(() => {
		deleteHotState(providerId, connectionId);
		markProviderHotStateInvalidated(providerId);
	});

	const cached = sqliteHotStateCache.get(providerId);
	if (cached) {
		delete cached[connectionId];
		if (Object.keys(cached).length === 0)
			sqliteHotStateCache.delete(providerId);
		else sqliteHotStateCache.set(providerId, cached);
	}

	const providerState = providerStateCache.get(providerId);
	if (!providerState) return;
	providerState.connections.delete(connectionId);
	if (providerState.connections.size === 0)
		providerStateCache.delete(providerId);
	else {
		recalculateProviderIndexes(providerState);
		providerStateCache.set(providerId, providerState);
	}
}

export async function clearProviderHotState(providerId) {
	if (!providerId) return false;
	providerStateCache.delete(providerId);
	sqliteHotStateCache.delete(providerId);
	return true;
}

export async function clearAllHotState() {
	providerStateCache.clear();
	sqliteHotStateCache.clear();
	return true;
}

export async function mergeConnectionsWithHotState(connections = []) {
	if (!Array.isArray(connections) || connections.length === 0)
		return connections;
	const hotStates = await getConnectionHotStates(
		connections.map((c) => ({ id: c.id, provider: c.provider, ...c })),
	);
	return connections.map((c) => {
		const key = getProviderScopedConnectionKey(c.provider, c.id);
		return hotStates.get(key) || hotStates.get(c.id) || c;
	});
}

// Test helpers
export function __resetProviderHotStateForTests() {
	providerStateCache.clear();
	sqliteHotStateCache.clear();
}

export function __setRedisClientForTests(_client) {
	// No-op — kept for test compatibility.
}

export function __getProviderHotStateSnapshotForTests(providerId) {
	const providerState = providerStateCache.get(providerId);
	if (!providerState) return null;
	return {
		connections: Object.fromEntries(providerState.connections.entries()),
		eligibleConnectionIds: providerState.eligibleConnectionIds
			? [...providerState.eligibleConnectionIds].sort()
			: null,
		retryAt: providerState.retryAt,
		updatedAt: providerState.updatedAt,
	};
}

export function __hydrateProviderHotStateForTests(providerId, rawState = {}) {
	// Simplified: treat rawState as { connectionId: stateObj }
	const providerState = createEmptyProviderState();
	for (const [connectionId, state] of Object.entries(rawState || {})) {
		if (connectionId.startsWith("__")) continue;
		const parsed =
			typeof state === "string"
				? (() => {
						try {
							return JSON.parse(state);
						} catch {
							return null;
						}
					})()
				: state;
		if (parsed && typeof parsed === "object") {
			providerState.connections.set(connectionId, mergeHotState({}, parsed));
		}
	}
	recalculateProviderIndexes(providerState);
	providerStateCache.set(providerId, providerState);
	return providerState;
}
