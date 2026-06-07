import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Module-level mocks ──────────────────────────────────────────────────────

const persistConnectionHotStateSnapshot = vi.fn(async () => null);
const getConnectionHotState = vi.fn(async () => null);
const getCurrentProviderConnectionById = vi.fn(async () => null);
const updateCurrentProviderConnection = vi.fn(async () => null);

vi.mock("@/lib/connectionStateAccess", () => ({
	getCurrentProviderConnectionById,
}));

vi.mock("@/lib/connectionStateWriteAccess", () => ({
	updateCurrentProviderConnection,
}));

vi.mock("@/lib/providerHotState", () => ({
	getConnectionHotState,
}));

vi.mock("@/lib/connectionHotStateStore", () => ({
	persistConnectionHotStateSnapshot,
}));

vi.mock("@/lib/usageStatusSnapshots", () => ({
	buildCodexSyntheticSnapshot: vi.fn((_conn, data) => data),
	ensureUsageSnapshot: vi.fn((_conn, _data) => _data),
}));

// Mock connectionUsageRefresh to avoid import cascade from canonicalUsageWorker
vi.mock("@/lib/connectionUsageRefresh", () => ({
	refreshConnectionUsage: vi.fn(async () => {
		throw Object.assign(new Error("mock refresh error"), {
			status: 500,
			code: "MOCKED",
		});
	}),
}));

// ── Tests ───────────────────────────────────────────────────────────────────

describe("isAuthExpiredMessage", () => {
	it("matches 'token expired' in message", async () => {
		const { isAuthExpiredMessage } = await import("../../src/lib/usageStatus.ts");
		expect(isAuthExpiredMessage({ message: "Your token expired at midnight" })).toBe(true);
	});

	it("matches 'access token expired' in message", async () => {
		const { isAuthExpiredMessage } = await import("../../src/lib/usageStatus.ts");
		expect(isAuthExpiredMessage({ message: "access token expired, re-authenticate" })).toBe(true);
	});

	it("matches 'session expired' in message", async () => {
		const { isAuthExpiredMessage } = await import("../../src/lib/usageStatus.ts");
		expect(isAuthExpiredMessage({ message: "Your session expired" })).toBe(true);
	});

	it("matches 'authentication expired' in message", async () => {
		const { isAuthExpiredMessage } = await import("../../src/lib/usageStatus.ts");
		expect(isAuthExpiredMessage({ message: "authentication expired, please re-authorize" })).toBe(true);
	});

	it("matches 'auth expired' in message", async () => {
		const { isAuthExpiredMessage } = await import("../../src/lib/usageStatus.ts");
		expect(isAuthExpiredMessage({ message: "auth expired, refresh token required" })).toBe(true);
	});

	it("matches 'unauthorized' in message", async () => {
		const { isAuthExpiredMessage } = await import("../../src/lib/usageStatus.ts");
		expect(isAuthExpiredMessage({ message: "401 unauthorized access" })).toBe(true);
	});

	it("matches '401' in message", async () => {
		const { isAuthExpiredMessage } = await import("../../src/lib/usageStatus.ts");
		expect(isAuthExpiredMessage({ message: "Received 401 status code" })).toBe(true);
	});

	it("matches 're-authorize' in message", async () => {
		const { isAuthExpiredMessage } = await import("../../src/lib/usageStatus.ts");
		expect(isAuthExpiredMessage({ message: "Please re-authorize your account" })).toBe(true);
	});

	// Edge cases: should NOT match
	it("does NOT match bare 'expired' without token/session/auth qualifier", async () => {
		const { isAuthExpiredMessage } = await import("../../src/lib/usageStatus.ts");
		expect(isAuthExpiredMessage({ message: "Certificate expired" })).toBe(false);
	});

	it("does NOT match bare 'authentication' without expired qualifier", async () => {
		const { isAuthExpiredMessage } = await import("../../src/lib/usageStatus.ts");
		expect(isAuthExpiredMessage({ message: "Authentication required" })).toBe(false);
	});

	it("does NOT match TLS-related 'expired' messages", async () => {
		const { isAuthExpiredMessage } = await import("../../src/lib/usageStatus.ts");
		expect(isAuthExpiredMessage({ message: "SSL certificate has expired" })).toBe(false);
		expect(isAuthExpiredMessage({ message: "Certificate expired 30 days ago" })).toBe(false);
	});

	it("does NOT match 'cache expired' messages", async () => {
		const { isAuthExpiredMessage } = await import("../../src/lib/usageStatus.ts");
		expect(isAuthExpiredMessage({ message: "Cache entry expired" })).toBe(false);
	});

	it("returns false for null/undefined message", async () => {
		const { isAuthExpiredMessage } = await import("../../src/lib/usageStatus.ts");
		expect(isAuthExpiredMessage(null)).toBe(false);
		expect(isAuthExpiredMessage({})).toBe(false);
	});
});

describe("clearForceBackoff preserves auth state", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does NOT clear routingStatus/authState when connection has auth_invalid", async () => {
		getCurrentProviderConnectionById.mockResolvedValue({
			id: "conn-auth-invalid",
			provider: "antigravity",
			routingStatus: "disabled",
			authState: "invalid",
			reasonCode: "auth_invalid",
			reasonDetail: "Token revoked",
			backoffLevel: 3,
			nextRetryAt: new Date(Date.now() + 3600000).toISOString(),
		});
		getConnectionHotState.mockResolvedValue(null);
		persistConnectionHotStateSnapshot.mockImplementation(
			async (_provider, _id, patch) => null,
		);

		const { runCanonicalUsageWorker } = await import(
			"../../src/lib/canonicalUsageWorker"
		);

		await expect(
			runCanonicalUsageWorker({
				connectionId: "conn-auth-invalid",
				trigger: "manual",
				force: true,
			}),
		).rejects.toThrow("mock refresh error");

		// Find the syncUsageStatus call — clearForceBackoff passes updates
		// with backoffLevel: 0, nextRetryAt: null for auth-invariant preserve.
		// The check: for auth-invalid connections, routingStatus/authState/reasonCode
		// must NOT be in the update (they're preserved by not sending them).
		const authPreservedCall = persistConnectionHotStateSnapshot.mock.calls.find(
			([, , patch]) => patch?.backoffLevel === 0,
		);

		expect(authPreservedCall).toBeDefined();
		const patch = authPreservedCall![2];
		// Auth status fields should be absent — preserve by omission
		expect(patch.routingStatus).toBeUndefined();
		expect(patch.authState).toBeUndefined();
		expect(patch.reasonCode).toBeUndefined();
		expect(patch.reasonDetail).toBeUndefined();
		// Backoff should be cleared
		expect(patch.backoffLevel).toBe(0);
		expect(patch.nextRetryAt).toBeNull();
	});

	it("DOES set routingStatus/authState when connection has no auth block", async () => {
		getCurrentProviderConnectionById.mockResolvedValue({
			id: "conn-transient",
			provider: "antigravity",
			routingStatus: "exhausted",
			authState: "ok",
			reasonCode: "quota_exhausted",
			reasonDetail: "Codex usage quota exhausted",
			backoffLevel: 2,
			nextRetryAt: new Date(Date.now() + 60000).toISOString(),
		});
		getConnectionHotState.mockResolvedValue(null);
		persistConnectionHotStateSnapshot.mockImplementation(
			async (_provider, _id, patch) => null,
		);

		const { runCanonicalUsageWorker } = await import(
			"../../src/lib/canonicalUsageWorker"
		);

		await expect(
			runCanonicalUsageWorker({
				connectionId: "conn-transient",
				trigger: "manual",
				force: true,
			}),
		).rejects.toThrow("mock refresh error");

		const clearedCall = persistConnectionHotStateSnapshot.mock.calls.find(
			([, , patch]) => patch?.routingStatus === "eligible",
		);

		expect(clearedCall).toBeDefined();
		const patch = clearedCall![2];
		// Non-auth connections SHOULD have status cleared to eligible/healthy/ok
		expect(patch.routingStatus).toBe("eligible");
		expect(patch.healthStatus).toBe("healthy");
		expect(patch.quotaState).toBe("ok");
		expect(patch.authState).toBe("ok");
		expect(patch.reasonCode).toBeNull();
		expect(patch.reasonDetail).toBeNull();
		expect(patch.backoffLevel).toBe(0);
		expect(patch.nextRetryAt).toBeNull();
	});
});

describe("getUsageStatusUpdates threshold scoping", () => {
	it("returns eligible base for non-Codex providers without Kiro quotas", async () => {
		const { getUsageStatusUpdates } = await import("../../src/lib/usageStatus.ts");
		const result = getUsageStatusUpdates(
			{ provider: "openai" },
			{ message: "OK", quotas: { monthly: { used: 50, total: 100, remaining: 50 } } },
		);
		expect(result.routingStatus).toBe("eligible");
		expect(result.healthStatus).toBe("healthy");
		expect(result.quotaState).toBe("ok");
	});

	it("returns Codex-specific exhausted state for Codex provider", async () => {
		const { getUsageStatusUpdates } = await import("../../src/lib/usageStatus.ts");
		const result = getUsageStatusUpdates(
			{ provider: "codex" },
			{ message: "OK", quotas: { session: { used: 100, total: 100, remaining: 0 } } },
		);
		expect(result.routingStatus).toBe("exhausted");
		expect(result.reasonCode).toBe("quota_exhausted");
		expect(result.reasonDetail).toContain("session");
	});

	it("Codex exhaustion logic does NOT apply to non-Codex providers", async () => {
		const { getUsageStatusUpdates } = await import("../../src/lib/usageStatus.ts");
		const result = getUsageStatusUpdates(
			{ provider: "openai" },
			{ message: "OK", quotas: { monthly: { used: 100, total: 100, remaining: 0 } } },
		);
		expect(result.routingStatus).toBe("eligible");
	});

	it("handles Kiro exhausted quota correctly", async () => {
		const { getUsageStatusUpdates } = await import("../../src/lib/usageStatus.ts");
		const result = getUsageStatusUpdates(
			{ provider: "kiro" },
			{
				message: "OK",
				quotas: {
					monthly: { used: 100, total: 100, remaining: 0 },
				},
			},
		);
		expect(result.routingStatus).toBe("exhausted");
		expect(result.reasonCode).toBe("quota_exhausted");
		expect(result.reasonDetail).toContain("Kiro");
	});

	it("handles Amazon-Q exhausted quota correctly", async () => {
		const { getUsageStatusUpdates } = await import("../../src/lib/usageStatus.ts");
		const result = getUsageStatusUpdates(
			{ provider: "amazon-q" },
			{
				message: "OK",
				quotas: {
					monthly: { used: 100, total: 100, remaining: 0 },
				},
			},
		);
		expect(result.routingStatus).toBe("exhausted");
		expect(result.reasonCode).toBe("quota_exhausted");
		expect(result.reasonDetail).toContain("Amazon Q");
	});

	it("Kiro threshold logic triggers correctly", async () => {
		const { getUsageStatusUpdates } = await import("../../src/lib/usageStatus.ts");
		const result = getUsageStatusUpdates(
			{
				provider: "kiro",
				providerSpecificData: { minimumRemainingQuotaPercent: 5 },
			},
			{
				message: "OK",
				quotas: {
					monthly: { used: 97, total: 100, remaining: 3 },
				},
			},
			{ globalExhaustedThreshold: 5 },
		);
		expect(result.routingStatus).toBe("exhausted");
		expect(result.reasonCode).toBe("quota_threshold");
		expect(result.reasonDetail).toContain("Kiro");
	});

	it("returns eligible for Kiro when quota is above threshold", async () => {
		const { getUsageStatusUpdates } = await import("../../src/lib/usageStatus.ts");
		const result = getUsageStatusUpdates(
			{
				provider: "kiro",
				providerSpecificData: { minimumRemainingQuotaPercent: 5 },
			},
			{
				message: "OK",
				quotas: {
					monthly: { used: 50, total: 100, remaining: 50 },
				},
			},
			{ globalExhaustedThreshold: 5 },
		);
		expect(result.routingStatus).toBe("eligible");
	});

	describe("syncUsageStatus caps nextRetryAt and resetAt to 7 days", () => {
		it("caps nextRetryAt that is > 7 days in the future", async () => {
			const { syncUsageStatus } = await import("../../src/lib/usageStatus.ts");
			const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year

			getConnectionHotState.mockResolvedValue(null);
			persistConnectionHotStateSnapshot.mockImplementation(
				async (_provider, _id, patch) => {
					const cappedTime = new Date(patch.nextRetryAt).getTime();
					const now = Date.now();
					// Should be capped to ~7 days, not 1 year
					expect(cappedTime).toBeLessThan(now + 10 * 24 * 60 * 60 * 1000);
					expect(cappedTime).toBeGreaterThan(now + 5 * 24 * 60 * 60 * 1000);
					return null;
				},
			);

			await syncUsageStatus(
				{ id: "conn-cap-test", provider: "test", usageSnapshot: null },
				{ nextRetryAt: farFuture, lastCheckedAt: new Date().toISOString() },
			);

			expect(persistConnectionHotStateSnapshot).toHaveBeenCalled();
		});

		it("caps resetAt that is > 7 days in the future", async () => {
			const { syncUsageStatus } = await import("../../src/lib/usageStatus.ts");
			const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

			getConnectionHotState.mockResolvedValue(null);
			persistConnectionHotStateSnapshot.mockImplementation(
				async (_provider, _id, patch) => {
					const cappedTime = new Date(patch.resetAt).getTime();
					const now = Date.now();
					expect(cappedTime).toBeLessThan(now + 10 * 24 * 60 * 60 * 1000);
					expect(cappedTime).toBeGreaterThan(now + 5 * 24 * 60 * 60 * 1000);
					return null;
				},
			);

			await syncUsageStatus(
				{ id: "conn-cap-test", provider: "test", usageSnapshot: null },
				{ resetAt: farFuture, lastCheckedAt: new Date().toISOString() },
			);

			expect(persistConnectionHotStateSnapshot).toHaveBeenCalled();
		});

		it("does not cap nextRetryAt that is within 7 days", async () => {
			const { syncUsageStatus } = await import("../../src/lib/usageStatus.ts");
			const nearFuture = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days

			getConnectionHotState.mockResolvedValue(null);
			persistConnectionHotStateSnapshot.mockImplementation(
				async (_provider, _id, patch) => {
					expect(patch.nextRetryAt).toBe(nearFuture);
					return null;
				},
			);

			await syncUsageStatus(
				{ id: "conn-nocap-test", provider: "test", usageSnapshot: null },
				{ nextRetryAt: nearFuture, lastCheckedAt: new Date().toISOString() },
			);

			expect(persistConnectionHotStateSnapshot).toHaveBeenCalled();
		});
	});
});
