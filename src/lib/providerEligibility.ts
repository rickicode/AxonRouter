import {
	getConnectionCooldownUntil,
	getConnectionStatusDetails,
} from "./connectionStatus";
import { loadProviderHotStateSnapshot } from "./sqliteHelpers";

function getConnectionRetryAt(state: Record<string, unknown> = {}) {
	return getConnectionCooldownUntil(state as Record<string, any>);
}

function isConnectionEligible(state: Record<string, unknown> = {}) {
	return (
		getConnectionStatusDetails(state as Record<string, any>).status ===
		"eligible"
	);
}

export type ProviderEligibilitySnapshot = {
	eligibleConnectionIds: Set<string>;
	retryAt: string | null;
	updatedAt: string | null;
	sqliteVersion: number;
};

export function loadProviderEligibilitySnapshot(
	providerId: string,
): ProviderEligibilitySnapshot | null {
	if (!providerId) return null;

	const { states: sqliteStates, metadata: sqliteMetadata } =
		loadProviderHotStateSnapshot(providerId);

	const eligibleConnectionIds = new Set<string>();
	const retryCandidates: string[] = [];

	for (const [connectionId, connectionState] of Object.entries(
		sqliteStates || {},
	)) {
		if (!connectionState || typeof connectionState !== "object") continue;
		if (isConnectionEligible(connectionState as Record<string, unknown>)) {
			eligibleConnectionIds.add(connectionId);
			continue;
		}
		const retryAt = getConnectionRetryAt(
			connectionState as Record<string, unknown>,
		);
		if (retryAt) retryCandidates.push(retryAt);
	}

	if (
		eligibleConnectionIds.size === 0 &&
		retryCandidates.length === 0 &&
		!sqliteMetadata
	) {
		return null;
	}

	const updatedAt =
		typeof sqliteMetadata?.updatedAt === "string" &&
		sqliteMetadata.updatedAt.length > 0
			? sqliteMetadata.updatedAt
			: null;

	return {
		eligibleConnectionIds,
		retryAt: retryCandidates.length > 0 ? retryCandidates.sort()[0] : null,
		updatedAt,
		sqliteVersion: Math.max(0, Number(sqliteMetadata?.version) || 0),
	};
}

function filterEligibleConnectionsFromSnapshot<
	T extends { id?: string | null },
>(
	snapshot: ProviderEligibilitySnapshot | null,
	connections: T[] = [],
): T[] | null {
	if (!snapshot) return null;
	return connections.filter(
		(connection) =>
			connection?.id && snapshot.eligibleConnectionIds.has(connection.id),
	);
}

export function getEligibleConnectionIdsFromSnapshot(
	snapshot: ProviderEligibilitySnapshot | null,
): string[] | null {
	if (!snapshot?.eligibleConnectionIds) return null;
	return [...snapshot.eligibleConnectionIds];
}

export function getEligibleConnectionsFromSnapshot<
	T extends { id?: string | null },
>(
	snapshot: ProviderEligibilitySnapshot | null,
	connections: T[] = [],
): T[] | null {
	if (!snapshot) return null;
	return filterEligibleConnectionsFromSnapshot(snapshot, connections);
}

export function getEligibleConnectionsFromSqliteSnapshot<
	T extends { id?: string | null },
>(providerId: string, connections: T[] = []): T[] | null {
	const snapshot = loadProviderEligibilitySnapshot(providerId);
	return getEligibleConnectionsFromSnapshot(snapshot, connections);
}

export function getEligibleConnectionIdsFromSqliteSnapshot(
	providerId: string,
): string[] | null {
	const snapshot = loadProviderEligibilitySnapshot(providerId);
	return getEligibleConnectionIdsFromSnapshot(snapshot);
}
