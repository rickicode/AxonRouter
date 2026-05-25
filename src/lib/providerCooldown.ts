import {
	getConnectionProviderCooldownUntil,
	getConnectionStatusDetails,
} from "./connectionStatus";

const MODEL_LOCK_PREFIX = "modelLock_";

type ConnectionRecord = Record<string, unknown> & {
	routingStatus?: string | null;
	quotaState?: string | null;
};

type StatusLock = {
	key?: string;
	model?: string;
	until?: string;
};

type StatusDetails = {
	status: string;
	activeModelLocks?: StatusLock[];
};

type AvailabilityState = {
	statusDetails: StatusDetails;
	providerStatus: string;
	cooldownUntil: string | null;
	hasModelLocks: boolean;
	hasTimedCooldown: boolean;
	hasRoutingStatusLock: boolean;
	hasQuotaStateLock: boolean;
	hasProviderWideStatusEntry: boolean;
	canClearAll: boolean;
	clearPatch: Record<string, null>;
};

function getFutureTimestamp(value: unknown): string | null {
	const timestamp = new Date(String(value)).getTime();
	if (!value || !Number.isFinite(timestamp) || timestamp <= Date.now())
		return null;
	return new Date(timestamp).toISOString();
}

export function getProviderWideAvailabilityState(
	connection: ConnectionRecord,
): AvailabilityState {
	const statusDetails = getConnectionStatusDetails(connection) as StatusDetails;
	const cooldownUntil = getFutureTimestamp(
		getConnectionProviderCooldownUntil(connection),
	);
	const centralizedProviderStatus = statusDetails.status;
	const hasModelLocks = (statusDetails.activeModelLocks || []).length > 0;
	const hasTimedCooldown = Boolean(cooldownUntil);
	const hasRoutingStatusLock = ["blocked", "exhausted"].includes(
		connection?.routingStatus || "",
	);
	const hasQuotaStateLock = ["blocked", "exhausted"].includes(
		connection?.quotaState || "",
	);
	const hasProviderStatusLock =
		centralizedProviderStatus === "blocked" ||
		centralizedProviderStatus === "exhausted";
	const providerStatus = hasProviderStatusLock
		? centralizedProviderStatus
		: "exhausted";
	const hasProviderWideStatusEntry = hasProviderStatusLock || hasTimedCooldown;
	const canClearAll =
		hasTimedCooldown ||
		hasRoutingStatusLock ||
		hasQuotaStateLock ||
		hasModelLocks;

	return {
		statusDetails,
		providerStatus,
		cooldownUntil,
		hasModelLocks,
		hasTimedCooldown,
		hasRoutingStatusLock,
		hasQuotaStateLock,
		hasProviderWideStatusEntry,
		canClearAll,
		clearPatch: {
			...(hasRoutingStatusLock ? { routingStatus: null } : {}),
			...(hasQuotaStateLock ? { quotaState: null } : {}),
			nextRetryAt: null,
			resetAt: null,
		},
	};
}

export function buildCooldownClearPatch(
	connection: ConnectionRecord,
	model: string,
): Record<string, null> {
	const patch: Record<string, null> = {};

	if (model === "__all") {
		const availability = getProviderWideAvailabilityState(connection);

		for (const key of Object.keys(connection || {})) {
			if (key.startsWith(MODEL_LOCK_PREFIX)) patch[key] = null;
		}

		return {
			...patch,
			...availability.clearPatch,
		};
	}

	patch[`${MODEL_LOCK_PREFIX}${model}`] = null;
	return patch;
}
