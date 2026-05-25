import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConnections: any[] = [];
const getCurrentProviderConnections = vi.fn(async () => mockConnections);
const updateCurrentProviderConnection = vi.fn(async (_id: string, data: any) => data);
const syncUsageStatus = vi.fn(async () => null);
const applyLiveQuotaUpdate = vi.fn(async () => null);
const getCodexLiveQuotaSignal = vi.fn(() => null);
const getConnectionRecoveryPatch = vi.fn(() => null);
const getLiveRequestRecoveryPatch = vi.fn(() => null);
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

vi.mock("@/lib/routing/profilePolicy", () => ({
	rankConnectionsForPolicy: vi.fn((conns: any) => conns),
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
		getConnectionRecoveryPatch,
		getLiveRequestRecoveryPatch,
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
		recordSuccess: vi.fn(),
		canExecute: vi.fn(() => true),
		getStatus: vi.fn(() => ({ state: "CLOSED", failureCount: 0 })),
		resetAll: vi.fn(),
	},
}));

vi.mock("@/lib/apiKeyAccess", () => ({
	validateCurrentApiKey: vi.fn(async () => true),
	getCurrentApiKeys: vi.fn(async () => []),
}));

describe("getConnectionAuthBlockedPatch always returns disabled for auth errors", () => {
	it("returns routingStatus 'disabled' for 'token invalid' error", () => {
		const { getConnectionAuthBlockedPatch } = require("../../src/lib/usageStatusPatches.ts");
		const result = getConnectionAuthBlockedPatch("token invalid", { statusCode: 401 });
		expect(result).not.toBeNull();
		expect(result.routingStatus).toBe("disabled");
		expect(result.reasonCode).toBe("auth_invalid");
		expect(result.authState).toBe("invalid");
	});

	it("returns routingStatus 'disabled' for 'unauthorized' error", () => {
		const { getConnectionAuthBlockedPatch } = require("../../src/lib/usageStatusPatches.ts");
		const result = getConnectionAuthBlockedPatch("unauthorized", { statusCode: 401 });
		expect(result).not.toBeNull();
		expect(result.routingStatus).toBe("disabled");
		expect(result.reasonCode).toBe("auth_invalid");
	});

	it("returns routingStatus 'disabled' for 're-authorize' error (previously disabled, stays disabled)", () => {
		const { getConnectionAuthBlockedPatch } = require("../../src/lib/usageStatusPatches.ts");
		const result = getConnectionAuthBlockedPatch("Please re-authorize your account", { statusCode: 401 });
		expect(result).not.toBeNull();
		expect(result.routingStatus).toBe("disabled");
		expect(result.reasonCode).toBe("auth_invalid");
	});

	it("returns routingStatus 'disabled' for 'revoked' error", () => {
		const { getConnectionAuthBlockedPatch } = require("../../src/lib/usageStatusPatches.ts");
		const result = getConnectionAuthBlockedPatch("Token has been revoked", { statusCode: 401 });
		expect(result).not.toBeNull();
		expect(result.routingStatus).toBe("disabled");
		expect(result.reasonCode).toBe("auth_invalid");
	});

	it("returns routingStatus 'disabled' for 'invalid grant' error", () => {
		const { getConnectionAuthBlockedPatch } = require("../../src/lib/usageStatusPatches.ts");
		const result = getConnectionAuthBlockedPatch("invalid grant", { statusCode: 401 });
		expect(result).not.toBeNull();
		expect(result.routingStatus).toBe("disabled");
		expect(result.reasonCode).toBe("auth_invalid");
	});

	it("returns routingStatus 'disabled' for 'token expired' error", () => {
		const { getConnectionAuthBlockedPatch } = require("../../src/lib/usageStatusPatches.ts");
		const result = getConnectionAuthBlockedPatch("Your token expired", { statusCode: 401 });
		expect(result).not.toBeNull();
		expect(result.routingStatus).toBe("disabled");
		expect(result.reasonCode).toBe("auth_invalid");
	});

	it("returns routingStatus 'disabled' for 'unauthenticated' error", () => {
		const { getConnectionAuthBlockedPatch } = require("../../src/lib/usageStatusPatches.ts");
		const result = getConnectionAuthBlockedPatch("Request is unauthenticated", { statusCode: 403 });
		expect(result).not.toBeNull();
		expect(result.routingStatus).toBe("disabled");
		expect(result.reasonCode).toBe("auth_invalid");
	});

	it("returns null for non-auth errors", () => {
		const { getConnectionAuthBlockedPatch } = require("../../src/lib/usageStatusPatches.ts");
		const result = getConnectionAuthBlockedPatch("Server error: something went wrong", { statusCode: 500 });
		expect(result).toBeNull();
	});
});

describe("markAccountUnavailable does not produce 'blocked' for transient status codes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockConnections.length = 0;
	});

	it("status 429 does not produce routingStatus 'blocked' in the fallback path", async () => {
		mockConnections.push({
			id: "conn-429-test",
			provider: "openai",
			isActive: true,
			priority: 1,
			displayName: "Test OpenAI Account",
			accessToken: "token",
			routingStatus: "eligible",
			authState: "ok",
			backoffLevel: 0,
		});

		const { markAccountUnavailable } = await import(
			"../../src/sse/services/auth.tsx"
		);

		await markAccountUnavailable(
			"conn-429-test",
			429,
			"Rate limit exceeded",
			"openai",
			"gpt-4",
		);

		expect(updateCurrentProviderConnection).toHaveBeenCalledTimes(1);
		const patchArg = updateCurrentProviderConnection.mock.calls[0][1];
		expect(patchArg.routingStatus).not.toBe("blocked");
	});

	it("status 502 does not produce routingStatus 'blocked' in the fallback path", async () => {
		mockConnections.push({
			id: "conn-502-test",
			provider: "openai",
			isActive: true,
			priority: 1,
			displayName: "Test OpenAI 502",
			accessToken: "token",
			routingStatus: "eligible",
			authState: "ok",
			backoffLevel: 0,
		});

		const { markAccountUnavailable } = await import(
			"../../src/sse/services/auth.tsx"
		);

		await markAccountUnavailable(
			"conn-502-test",
			502,
			"Bad gateway error from upstream",
			"openai",
			"gpt-4",
		);

		expect(updateCurrentProviderConnection).toHaveBeenCalledTimes(1);
		const patchArg = updateCurrentProviderConnection.mock.calls[0][1];
		expect(patchArg.routingStatus).not.toBe("blocked");
		expect(patchArg.routingStatus).toBe("eligible");
	});

	it("status 504 does not produce routingStatus 'blocked' in the fallback path", async () => {
		mockConnections.push({
			id: "conn-504-test",
			provider: "openai",
			isActive: true,
			priority: 1,
			displayName: "Test OpenAI 504",
			accessToken: "token",
			routingStatus: "eligible",
			authState: "ok",
			backoffLevel: 0,
		});

		const { markAccountUnavailable } = await import(
			"../../src/sse/services/auth.tsx"
		);

		await markAccountUnavailable(
			"conn-504-test",
			504,
			"Gateway timeout",
			"openai",
			"gpt-4",
		);

		expect(updateCurrentProviderConnection).toHaveBeenCalledTimes(1);
		const patchArg = updateCurrentProviderConnection.mock.calls[0][1];
		expect(patchArg.routingStatus).not.toBe("blocked");
		expect(patchArg.routingStatus).toBe("eligible");
	});

	it("non-transient status (e.g. 500 from non-kiro/codex provider) still produces 'blocked'", async () => {
		mockConnections.push({
			id: "conn-500-test",
			provider: "openai",
			isActive: true,
			priority: 1,
			displayName: "Test OpenAI 500",
			accessToken: "token",
			routingStatus: "eligible",
			authState: "ok",
			backoffLevel: 0,
		});

		isUpstreamProcessingError.mockReturnValue(false);

		const { markAccountUnavailable } = await import(
			"../../src/sse/services/auth.tsx"
		);

		await markAccountUnavailable(
			"conn-500-test",
			500,
			"Internal server error",
			"openai",
			"gpt-4",
		);

		expect(updateCurrentProviderConnection).toHaveBeenCalledTimes(1);
		const patchArg = updateCurrentProviderConnection.mock.calls[0][1];
		expect(patchArg.routingStatus).toBe("blocked");
		expect(patchArg.reasonCode).toBe("usage_request_failed");
	});
});

describe("markAccountUnavailable enforces clean eligible invariant for transient errors", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockConnections.length = 0;
	});

	it.each([429, 502, 504])("status %i does NOT set healthStatus:'degraded' or reasonCode when keeping eligible", async (statusCode) => {
		mockConnections.push({
			id: `conn-${statusCode}-clean`,
			provider: "openai",
			isActive: true,
			priority: 1,
			displayName: `Test Clean Eligible ${statusCode}`,
			accessToken: "token",
			routingStatus: "eligible",
			authState: "ok",
			backoffLevel: 0,
		});

		const { markAccountUnavailable } = await import(
			"../../src/sse/services/auth.tsx"
		);

		await markAccountUnavailable(
			`conn-${statusCode}-clean`,
			statusCode,
			"Transient error from upstream",
			"openai",
			"gpt-4",
		);

		expect(updateCurrentProviderConnection).toHaveBeenCalledTimes(1);
		const patchArg = updateCurrentProviderConnection.mock.calls[0][1];

		// Clean eligible invariant: no degraded health, no reasonCode, no reasonDetail
		expect(patchArg.healthStatus).not.toBe("degraded");
		expect(patchArg.reasonCode).toBeUndefined();
		expect(patchArg.reasonDetail).toBeUndefined();
		// routingStatus should be either "eligible" (502/504) or not set (429 uses transient rate limit path)
		if (patchArg.routingStatus !== undefined) {
			expect(patchArg.routingStatus).toBe("eligible");
		}
	});
});
