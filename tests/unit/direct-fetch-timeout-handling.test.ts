import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConnections: any[] = [];
const getCurrentProviderConnections = vi.fn(async () => mockConnections);
const updateCurrentProviderConnection = vi.fn(async (_id: string, data: any) => data);
const syncUsageStatus = vi.fn(async () => null);
const applyLiveQuotaUpdate = vi.fn(async () => null);
const getCodexLiveQuotaSignal = vi.fn(() => null);
const getConnectionAuthBlockedPatch = vi.fn(() => null);
const getConnectionRecoveryPatch = vi.fn(() => null);
const getLiveRequestRecoveryPatch = vi.fn(() => null);
const isConfirmedAuthBlockedError = vi.fn(() => false);
const isTransientUpstreamTimeoutError = vi.fn(() => false);
const isUpstreamProcessingError = vi.fn(() => false);

const checkFallbackError = vi.fn(() => ({
	shouldFallback: true,
	cooldownMs: 30000,
	newBackoffLevel: 1,
}));

const buildModelLockUpdate = vi.fn((model: string, cooldownMs: number) => ({
	[`modelLock_${model || "__all"}`]: new Date(Date.now() + cooldownMs).toISOString(),
}));

const recordFailure = vi.fn();

vi.mock("@/lib/connectionAccess", () => ({
	getCurrentProviderConnections,
}));

vi.mock("@/lib/connectionStateWriteAccess", () => ({
	updateCurrentProviderConnection,
}));

vi.mock("@/lib/settingsAccess", () => ({
	getCurrentSettings: vi.fn(async () => ({})),
}));

vi.mock("@/lib/providerEligibility", () => ({
	getEligibleConnectionsFromSnapshot: vi.fn(async () => []),
	loadProviderEligibilitySnapshot: vi.fn(async () => null),
}));

vi.mock("@/lib/network/connectionProxy", () => ({
	resolveConnectionProxyConfig: vi.fn(async () => ({
		connectionProxyEnabled: false,
		connectionProxyUrl: "",
		connectionNoProxy: false,
		proxyPoolId: null,
		vercelRelayUrl: "",
	})),
}));

vi.mock("@/lib/connectionUsageRank", () => ({
	compareConnectionsByUsageAvailability: vi.fn(() => 0),
}));

vi.mock("@/lib/routing/connectionPolicy", () => ({
	rankConnectionsForRouting: vi.fn((conns: any) => conns),
	resolveRoutingPolicy: vi.fn(() => ({})),
}));

vi.mock("@/lib/governance/policy", () => ({
	evaluateGovernancePolicy: vi.fn(() => ({ allowed: true })),
}));

vi.mock("../../src/lib/usageStatus.ts", async () => {
	const actual = await vi.importActual("../../src/lib/usageStatus.ts");
	return {
		...actual,
		applyLiveQuotaUpdate,
		getCodexLiveQuotaSignal,
		getConnectionAuthBlockedPatch,
		getConnectionRecoveryPatch,
		getLiveRequestRecoveryPatch,
		isConfirmedAuthBlockedError,
		isTransientUpstreamTimeoutError,
		isUpstreamProcessingError,
		syncUsageStatus,
	};
});

vi.mock("open-sse/services/accountFallback.ts", () => ({
	formatRetryAfter: vi.fn((value: any) => value),
	checkFallbackError,
	isModelLockActive: vi.fn(() => false),
	buildModelLockUpdate,
	getEarliestModelLockUntil: vi.fn(() => null),
}));

vi.mock("open-sse/config/errorConfig.ts", () => ({
	MAX_RATE_LIMIT_COOLDOWN_MS: 600000,
}));

vi.mock("@/shared/constants/providers", async () => {
	const actual = await vi.importActual(
		"../../src/shared/constants/providers.ts",
	);
	return actual;
});

vi.mock("@/lib/codexModelAccess", () => ({
	canCodexConnectionUseModel: vi.fn(() => true),
}));

vi.mock("open-sse/executors/codex", () => ({
	getCodexModelScope: vi.fn(() => "codex"),
	parseCodexQuotaHeaders: vi.fn(() => null),
	getCodexDualWindowCooldownMs: vi.fn(() => null),
}));

vi.mock("open-sse/utils/abort", () => ({
	getHighThroughputSelectionEnabled: vi.fn(() => false),
}));

vi.mock("open-sse/services/circuitBreaker", () => ({
	circuitBreakerRegistry: {
		recordFailure,
		canExecute: vi.fn(() => true),
		getStatus: vi.fn(() => ({ state: "CLOSED", failureCount: 0 })),
		resetAll: vi.fn(),
	},
}));

vi.mock("@/lib/apiKeyAccess", () => ({
	validateCurrentApiKey: vi.fn(async () => true),
	getCurrentApiKeys: vi.fn(async () => []),
}));

describe("Direct fetch timeout handling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockConnections.length = 0;
	});

	it("applies only model lock cooldown and keeps connection eligible (no usage snapshot, no block)", async () => {
		mockConnections.push({
			id: "conn-timeout-1",
			provider: "codex",
			isActive: true,
			priority: 1,
			displayName: "Test Codex Account",
			accessToken: "token",
			routingStatus: "eligible",
			authState: "ok",
			backoffLevel: 0,
		});

		const { markAccountUnavailable } = await import(
			"../../src/sse/services/auth.tsx"
		);

		const result = await markAccountUnavailable(
			"conn-timeout-1",
			502,
			"Direct fetch failed: The operation timed out. [phase=direct code=23 host=chatgpt.com",
			"codex",
			"gpt-5.3-codex",
		);

		// Should fallback with cooldown
		expect(result.shouldFallback).toBe(true);
		expect(result.cooldownMs).toBeGreaterThan(0);

		// Should apply only model lock (connectionPatch with lockUpdate + backoffLevel: 0)
		expect(updateCurrentProviderConnection).toHaveBeenCalledTimes(1);
		const patchArg = updateCurrentProviderConnection.mock.calls[0][1];
		expect(patchArg.backoffLevel).toBe(0);
		// Should NOT have routingStatus = "blocked"
		expect(patchArg.routingStatus).toBeUndefined();

		// syncUsageStatus should NOT be called
		expect(syncUsageStatus).not.toHaveBeenCalled();

		// Circuit breaker should NOT record a failure
		expect(recordFailure).not.toHaveBeenCalled();
	});

	it("regular 502 errors still go through the normal path (circuit breaker + usage snapshot)", async () => {
		mockConnections.push({
			id: "conn-normal-502",
			provider: "codex",
			isActive: true,
			priority: 1,
			displayName: "Test Normal 502 Account",
			accessToken: "token",
			routingStatus: "eligible",
			authState: "ok",
			backoffLevel: 0,
		});

		const { markAccountUnavailable } = await import(
			"../../src/sse/services/auth.tsx"
		);

		await markAccountUnavailable(
			"conn-normal-502",
			502,
			"Server error: bad gateway [phase=direct code=502 host=api.openai.com",
			"codex",
			"gpt-5.3-codex",
		);

		// Circuit breaker SHOULD record a failure for normal 502s
		expect(recordFailure).toHaveBeenCalledWith("conn-normal-502");
	});

	it("returns shouldFallback: true with a positive cooldownMs for direct fetch timeout", async () => {
		mockConnections.push({
			id: "conn-timeout-2",
			provider: "codex",
			isActive: true,
			priority: 1,
			displayName: "Test Timeout 2",
			accessToken: "token",
			routingStatus: "eligible",
			authState: "ok",
			backoffLevel: 0,
		});

		const { markAccountUnavailable } = await import(
			"../../src/sse/services/auth.tsx"
		);

		const result = await markAccountUnavailable(
			"conn-timeout-2",
			502,
			"Direct fetch failed: The operation timed out. [phase=direct code=23 host=chatgpt.com",
			"codex",
			"gpt-5.3-codex",
		);

		expect(result).toEqual({
			shouldFallback: true,
			cooldownMs: expect.any(Number),
		});
		expect(result.cooldownMs).toBe(30000);
	});
});
