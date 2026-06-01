export type UsageRefreshTrigger =
	| "manual"
	| "scheduled"
	| "dashboard"
	| "api"
	| "self_service"
	| "provider_limits"
	| "preflight";

export type UsageErrorClass =
	| "transient"
	| "auth"
	| "quota"
	| "provider"
	| "timeout"
	| "overload"
	| "unknown";

export type CanonicalUsageWorkerInput = {
	connectionId: string;
	trigger: UsageRefreshTrigger;
	force?: boolean;
	runConnectionTest?: boolean;
	skipTransientConnectivityErrors?: boolean;
	globalExhaustedThreshold?: number;
	timeoutMs?: number;
	metadata?: Record<string, unknown>;
};

export type NormalizedQuotaWindow = {
	key: string;
	label?: string;
	used?: number | null;
	limit?: number | null;
	remaining?: number | null;
	usedPercent?: number | null;
	resetAt?: string | null;
};

export type NormalizedUsageSnapshot = {
	provider: string | null;
	checkedAt: string;
	trigger: UsageRefreshTrigger;
	quotas: Record<string, NormalizedQuotaWindow>;
	plan?: string | null;
	account?: Record<string, unknown> | null;
	raw?: unknown;
	stale?: boolean;
	errorClass?: UsageErrorClass;
	reasonCode?: string | null;
	reasonDetail?: string | null;
	nextRetryAt?: string | null;
};

export type CanonicalUsageWorkerOutput = {
	connection: unknown;
	usage: NormalizedUsageSnapshot;
	testResult?: unknown;
	skipped: boolean;
	skipReason?: string | null;
	errorClass?: UsageErrorClass;
	worker: {
		connectionId: string;
		trigger: UsageRefreshTrigger;
		force: boolean;
		queued: boolean;
		deduped: boolean;
		startedAt: string;
		completedAt: string;
		durationMs: number;
	};
};
