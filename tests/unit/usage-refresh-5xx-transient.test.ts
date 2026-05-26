import { beforeEach, describe, expect, it, vi } from "vitest";

// Spies to capture what gets written
const syncUsageStatus = vi.fn(async () => null);
const getUsageForProvider = vi.fn();
const getCurrentProviderConnectionById = vi.fn();

vi.mock("@/lib/observability/otel", () => ({
	instrumentUsageWorker: vi.fn(async (_name: any, _attrs: any, fn: any) =>
		fn(),
	),
}));

vi.mock("@/lib/connectionStateAccess", () => ({
	getCurrentProviderConnectionById: (...args: any[]) =>
		getCurrentProviderConnectionById(...args),
	getCurrentQuotaExhaustedThresholdPercent: vi.fn(async () => 5),
}));

vi.mock("@/lib/connectionStateWriteAccess", () => ({
	updateCurrentProviderConnection: vi.fn(async (_id: string, data: any) => data),
}));

vi.mock("open-sse/services/usage", () => ({
	getUsageForProvider: (...args: any[]) => getUsageForProvider(...args),
}));

vi.mock("@/lib/usageStatus", () => ({
	applyCanonicalUsageRefresh: vi.fn(async () => ({})),
	applyLiveQuotaUpdate: vi.fn(async () => null),
	getCodexLiveQuotaSignal: vi.fn(() => null),
	getConnectionAuthBlockedPatch: vi.fn(() => null),
	getConnectionRecoveryPatch: vi.fn(() => null),
	getLiveRequestRecoveryPatch: vi.fn(() => null),
	isAuthExpiredMessage: vi.fn(() => false),
	isConfirmedAuthBlockedError: vi.fn(() => false),
	isTransientUpstreamTimeoutError: vi.fn(() => false),
	syncUsageStatus,
}));

vi.mock("@/lib/usageRefresh/providerStrategy", () => ({
	getProviderStrategy: vi.fn(() => ({
		requiresQuota: false,
		timeoutMs: 10000,
		credentialRefreshOnTransientFailure: false,
		skipOnQuotaUnavailable: false,
	})),
}));

vi.mock("@/lib/oauth/codexAccount", () => ({
	mergeCodexUsageProviderSpecificData: vi.fn(() => null),
}));

vi.mock("@/app/api/providers/[id]/test/testUtils", () => ({
	testSingleConnection: vi.fn(async () => ({ valid: true })),
	validateConnectionCredentials: vi.fn(async () => ({ refreshed: false })),
}));

vi.mock("open-sse/executors/index", () => ({
	getExecutor: vi.fn(() => ({
		needsRefresh: () => false,
		refreshCredentials: async () => null,
		noAuth: false,
	})),
}));

vi.mock("open-sse/executors/codex", () => ({
	getCodexModelScope: vi.fn(() => "codex"),
	parseCodexQuotaHeaders: vi.fn(() => null),
	getCodexDualWindowCooldownMs: vi.fn(() => null),
}));

vi.mock("open-sse/services/accountFallback", () => ({
	formatRetryAfter: vi.fn((value: any) => value),
	checkFallbackError: vi.fn(() => ({
		shouldFallback: false,
		cooldownMs: 0,
		newBackoffLevel: 0,
	})),
	isModelLockActive: vi.fn(() => false),
	buildModelLockUpdate: vi.fn(() => ({})),
	getEarliestModelLockUntil: vi.fn(() => null),
}));

vi.mock("open-sse/config/errorConfig", () => ({
	MAX_RATE_LIMIT_COOLDOWN_MS: 600000,
}));

function makeUsageError(status: number, message = "Usage API error") {
	return Object.assign(new Error(message), { status });
}

describe("Usage refresh 5xx transient handling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("status 500 from usage API keeps eligible connection clean", async () => {
		const connection = {
			id: "conn-500-eligible",
			provider: "openai",
			authType: "oauth",
			isActive: true,
			routingStatus: "eligible",
			authState: "ok",
			accessToken: "test-token",
		};

		getCurrentProviderConnectionById.mockResolvedValue(connection);
		getUsageForProvider.mockRejectedValue(makeUsageError(500, "Internal Server Error"));

		const { refreshConnectionUsage } = await import(
			"../../src/lib/connectionUsageRefresh.ts"
		);

		await expect(
			refreshConnectionUsage("conn-500-eligible"),
		).rejects.toThrow();

		expect(syncUsageStatus).toHaveBeenCalled();
		const patch = syncUsageStatus.mock.calls[0][1];

		expect(patch.routingStatus).toBe("eligible");
		expect(patch.lastCheckedAt).toBeDefined();
		// Clean eligible invariant: no dirty fields
		expect(patch.healthStatus).toBeUndefined();
		expect(patch.reasonCode).toBeUndefined();
		expect(patch.nextRetryAt).toBeUndefined();
		expect(patch.resetAt).toBeUndefined();
	});

	it("status 503 from usage API keeps eligible connection clean", async () => {
		const connection = {
			id: "conn-503-eligible",
			provider: "openai",
			authType: "oauth",
			isActive: true,
			routingStatus: "eligible",
			authState: "ok",
			accessToken: "test-token",
		};

		getCurrentProviderConnectionById.mockResolvedValue(connection);
		getUsageForProvider.mockRejectedValue(makeUsageError(503, "Service Unavailable"));

		const { refreshConnectionUsage } = await import(
			"../../src/lib/connectionUsageRefresh.ts"
		);

		await expect(
			refreshConnectionUsage("conn-503-eligible"),
		).rejects.toThrow();

		expect(syncUsageStatus).toHaveBeenCalled();
		const patch = syncUsageStatus.mock.calls[0][1];

		expect(patch.routingStatus).toBe("eligible");
		expect(patch.lastCheckedAt).toBeDefined();
		// Clean eligible invariant: no dirty fields
		expect(patch.healthStatus).toBeUndefined();
		expect(patch.reasonCode).toBeUndefined();
		expect(patch.nextRetryAt).toBeUndefined();
		expect(patch.resetAt).toBeUndefined();
	});

	it("status 429 from usage API keeps eligible connection clean without nextRetryAt", async () => {
		const connection = {
			id: "conn-429-eligible",
			provider: "openai",
			authType: "oauth",
			isActive: true,
			routingStatus: "eligible",
			authState: "ok",
			accessToken: "test-token",
		};

		getCurrentProviderConnectionById.mockResolvedValue(connection);
		getUsageForProvider.mockRejectedValue(makeUsageError(429, "Rate limit exceeded"));

		const { refreshConnectionUsage } = await import(
			"../../src/lib/connectionUsageRefresh.ts"
		);

		await expect(
			refreshConnectionUsage("conn-429-eligible"),
		).rejects.toThrow();

		expect(syncUsageStatus).toHaveBeenCalled();
		const patch = syncUsageStatus.mock.calls[0][1];

		expect(patch.routingStatus).toBe("eligible");
		expect(patch.lastCheckedAt).toBeDefined();
		// Clean eligible invariant: no dirty fields
		expect(patch.healthStatus).toBeUndefined();
		expect(patch.reasonCode).toBeUndefined();
		expect(patch.nextRetryAt).toBeUndefined();
		expect(patch.resetAt).toBeUndefined();
	});

	it("status 500 on non-eligible connection writes degraded with transient_upstream_error", async () => {
		const connection = {
			id: "conn-500-blocked",
			provider: "openai",
			authType: "oauth",
			isActive: true,
			routingStatus: "blocked",
			authState: "ok",
			quotaState: "ok",
			accessToken: "test-token",
		};

		getCurrentProviderConnectionById.mockResolvedValue(connection);
		getUsageForProvider.mockRejectedValue(makeUsageError(500, "Internal Server Error"));

		const { refreshConnectionUsage } = await import(
			"../../src/lib/connectionUsageRefresh.ts"
		);

		await expect(
			refreshConnectionUsage("conn-500-blocked"),
		).rejects.toThrow();

		expect(syncUsageStatus).toHaveBeenCalled();
		const patch = syncUsageStatus.mock.calls[0][1];

		// Non-eligible: preserves status, adds degraded info
		expect(patch.routingStatus).toBe("blocked");
		expect(patch.healthStatus).toBe("degraded");
		expect(patch.reasonCode).toBe("transient_upstream_error");
		expect(patch.reasonDetail).toBe("Usage check temporarily unavailable");
		expect(patch.nextRetryAt).toBeDefined();
	});

	it("non-5xx non-auth error (e.g. status 400) correctly blocks the connection", async () => {
		const connection = {
			id: "conn-400-eligible",
			provider: "openai",
			authType: "oauth",
			isActive: true,
			routingStatus: "eligible",
			authState: "ok",
			accessToken: "test-token",
		};

		getCurrentProviderConnectionById.mockResolvedValue(connection);
		getUsageForProvider.mockRejectedValue(makeUsageError(400, "Bad Request"));

		const { refreshConnectionUsage } = await import(
			"../../src/lib/connectionUsageRefresh.ts"
		);

		await expect(
			refreshConnectionUsage("conn-400-eligible"),
		).rejects.toThrow();

		expect(syncUsageStatus).toHaveBeenCalled();
		const patch = syncUsageStatus.mock.calls[0][1];

		expect(patch.routingStatus).toBe("blocked");
		expect(patch.healthStatus).toBe("degraded");
		expect(patch.reasonCode).toBe("usage_request_failed");
		expect(patch.reasonDetail).toBe("Usage check failed");
	});
});
