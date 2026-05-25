import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the modules that applyPreemptiveCodexCooldown will use internally
const mockUpdateConnection = vi.fn();

vi.mock("@/lib/connectionStateWriteAccess", () => ({
	updateCurrentProviderConnection: (...args: any[]) =>
		mockUpdateConnection(...args),
}));

vi.mock("@/lib/connectionStateAccess", () => ({
	getCurrentProviderConnectionById: vi.fn(async () => ({
		id: "test-conn-1",
		provider: "codex",
		authType: "oauth",
		accessToken: "test-token",
		refreshToken: "test-refresh",
	})),
	getCurrentQuotaExhaustedThresholdPercent: vi.fn(async () => 5),
}));

vi.mock("open-sse/executors/index", () => ({
	getExecutor: vi.fn(() => ({
		needsRefresh: () => false,
		refreshCredentials: async () => null,
		noAuth: false,
	})),
}));

vi.mock("open-sse/services/usage", () => ({
	getUsageForProvider: vi.fn(async () => ({
		quotas: {
			session: { usedPercent: 50, remainingPercent: 50, resetAt: null },
			weekly: { usedPercent: 50, remainingPercent: 50, resetAt: null },
		},
		plan: "pro",
	})),
}));

vi.mock("@/lib/usageStatus", () => ({
	applyCanonicalUsageRefresh: vi.fn(async () => ({})),
	applyLiveQuotaUpdate: vi.fn(async () => null),
	getCodexLiveQuotaSignal: vi.fn(() => null),
	getConnectionAuthBlockedPatch: vi.fn(() => null),
	getLiveRequestRecoveryPatch: vi.fn(() => ({})),
	isConfirmedAuthBlockedError: vi.fn(() => false),
	isAuthExpiredMessage: vi.fn(() => false),
	isTransientUpstreamTimeoutError: vi.fn(() => false),
	syncUsageStatus: vi.fn(async () => {}),
}));

vi.mock("@/lib/observability/otel", () => ({
	instrumentUsageWorker: vi.fn(async (_name: any, _attrs: any, fn: any) =>
		fn(),
	),
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

// Now import the functions we want to test after mocks are set up
import {
	getCodexDualWindowCooldownMs,
	type CodexQuotaSnapshot,
} from "open-sse/executors/codex";
import { buildModelLockUpdate } from "open-sse/services/accountFallback";

describe("Codex preemptive cooldown via usage refresh", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("applies model lock when 5h usage >= 95% with future resetAt", () => {
		const futureReset = new Date(Date.now() + 1800_000).toISOString();
		const quota: CodexQuotaSnapshot = {
			usage5h: 96,
			limit5h: 100,
			resetAt5h: futureReset,
			usage7d: 50,
			limit7d: 100,
			resetAt7d: null,
		};

		const result = getCodexDualWindowCooldownMs(quota);
		expect(result.window).toBe("5h");
		expect(result.cooldownMs).toBeGreaterThan(0);
	});

	it("applies model lock when 7d usage >= 95% with future resetAt", () => {
		const futureReset = new Date(Date.now() + 3600_000).toISOString();
		const quota: CodexQuotaSnapshot = {
			usage5h: 50,
			limit5h: 100,
			resetAt5h: null,
			usage7d: 96,
			limit7d: 100,
			resetAt7d: futureReset,
		};

		const result = getCodexDualWindowCooldownMs(quota);
		expect(result.window).toBe("7d");
		expect(result.cooldownMs).toBeGreaterThan(0);
	});

	it("does not apply cooldown when usage is below threshold", () => {
		const quota: CodexQuotaSnapshot = {
			usage5h: 50,
			limit5h: 100,
			resetAt5h: null,
			usage7d: 70,
			limit7d: 100,
			resetAt7d: null,
		};

		const result = getCodexDualWindowCooldownMs(quota);
		expect(result.cooldownMs).toBe(0);
		expect(result.window).toBe("none");
	});

	it("buildModelLockUpdate creates correct lock structure", () => {
		const lock = buildModelLockUpdate("__scope_codex", 60000);
		expect(lock).toHaveProperty("modelLock___scope_codex");
		const lockDate = new Date(lock["modelLock___scope_codex"]);
		expect(lockDate.getTime()).toBeGreaterThan(Date.now());
		expect(lockDate.getTime()).toBeLessThanOrEqual(Date.now() + 61000);
	});
});
