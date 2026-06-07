import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Module-level mocks ──────────────────────────────────────────────────────

vi.mock("@/lib/connectionStateAccess", () => ({
	getCurrentProviderConnectionById: vi.fn(async () => null),
}));

vi.mock("@/lib/connectionStateWriteAccess", () => ({
	updateCurrentProviderConnection: vi.fn(async () => null),
}));

vi.mock("@/lib/providerHotState", () => ({
	getConnectionHotState: vi.fn(async () => null),
}));

vi.mock("@/lib/connectionHotStateStore", () => ({
	persistConnectionHotStateSnapshot: vi.fn(async () => null),
}));

vi.mock("@/lib/usageStatusSnapshots", () => ({
	ensureUsageSnapshot: vi.fn((_conn, _data) => _data),
}));

vi.mock("@/lib/connectionUsageRefresh", () => ({
	refreshConnectionUsage: vi.fn(async () => {
		throw Object.assign(new Error("mock"), { status: 500, code: "MOCKED" });
	}),
}));

// ── Tests ───────────────────────────────────────────────────────────────────

describe("getAntigravityModelFamily", () => {
	it("maps claude-opus-4-6-thinking to Claude", async () => {
		const { getAntigravityModelFamily } = await import("../../src/app/(dashboard)/app/usage/components/ProviderLimits/utils");
		expect(getAntigravityModelFamily("claude-opus-4-6-thinking")).toBe("Claude");
	});

	it("maps claude-sonnet-4-6 to Claude", async () => {
		const { getAntigravityModelFamily } = await import("../../src/app/(dashboard)/app/usage/components/ProviderLimits/utils");
		expect(getAntigravityModelFamily("claude-sonnet-4-6")).toBe("Claude");
	});

	it("maps gemini-3.1-pro-high to Gemini", async () => {
		const { getAntigravityModelFamily } = await import("../../src/app/(dashboard)/app/usage/components/ProviderLimits/utils");
		expect(getAntigravityModelFamily("gemini-3.1-pro-high")).toBe("Gemini");
	});

	it("maps gemini-3.1-pro-low to Gemini", async () => {
		const { getAntigravityModelFamily } = await import("../../src/app/(dashboard)/app/usage/components/ProviderLimits/utils");
		expect(getAntigravityModelFamily("gemini-3.1-pro-low")).toBe("Gemini");
	});

	it("maps gemini-3-flash to Gemini", async () => {
		const { getAntigravityModelFamily } = await import("../../src/app/(dashboard)/app/usage/components/ProviderLimits/utils");
		expect(getAntigravityModelFamily("gemini-3-flash")).toBe("Gemini");
	});

	it("maps gpt-oss-120b-medium to Other", async () => {
		const { getAntigravityModelFamily } = await import("../../src/app/(dashboard)/app/usage/components/ProviderLimits/utils");
		expect(getAntigravityModelFamily("gpt-oss-120b-medium")).toBe("Other");
	});

	it("maps unknown claude-* model to Claude via prefix", async () => {
		const { getAntigravityModelFamily } = await import("../../src/app/(dashboard)/app/usage/components/ProviderLimits/utils");
		expect(getAntigravityModelFamily("claude-sonnet-5-0")).toBe("Claude");
	});

	it("maps unknown gemini-* model to Gemini via prefix", async () => {
		const { getAntigravityModelFamily } = await import("../../src/app/(dashboard)/app/usage/components/ProviderLimits/utils");
		expect(getAntigravityModelFamily("gemini-5-pro")).toBe("Gemini");
	});

	it("maps unknown model to Other as default", async () => {
		const { getAntigravityModelFamily } = await import("../../src/app/(dashboard)/app/usage/components/ProviderLimits/utils");
		expect(getAntigravityModelFamily("custom-vendor-model-xyz")).toBe("Other");
	});
});

describe("getAntigravityFamilyQuotaState", () => {
	it("returns all healthy when no models are exhausted", async () => {
		const { getAntigravityFamilyQuotaState } = await import("../../src/lib/usageStatus");
		const result = getAntigravityFamilyQuotaState({
			quotas: {
				"claude-opus-4-6-thinking": { remainingPercentage: 50, total: 1000, used: 500 },
				"claude-sonnet-4-6": { remainingPercentage: 30, total: 1000, used: 700 },
				"gemini-3.1-pro-high": { remainingPercentage: 85, total: 1000, used: 150 },
				"gemini-3-flash": { remainingPercentage: 95, total: 1000, used: 50 },
			},
		});

		expect(result.allFamiliesExhausted).toBe(false);
		expect(result.someFamilyExhausted).toBe(false);
		expect(result.families).toHaveLength(2);

		const claudeFamily = result.families.find((f) => f.name === "Claude");
		expect(claudeFamily).toBeDefined();
		expect(claudeFamily!.exhausted).toBe(0);
		expect(claudeFamily!.models).toBe(2);

		const geminiFamily = result.families.find((f) => f.name === "Gemini");
		expect(geminiFamily).toBeDefined();
		expect(geminiFamily!.exhausted).toBe(0);
		expect(geminiFamily!.models).toBe(2);
	});

	it("detects one family exhausted while other is healthy", async () => {
		const { getAntigravityFamilyQuotaState } = await import("../../src/lib/usageStatus");
		const result = getAntigravityFamilyQuotaState({
			quotas: {
				"claude-opus-4-6-thinking": { remainingPercentage: 0, total: 1000, used: 1000 },
				"claude-sonnet-4-6": { remainingPercentage: 0, total: 1000, used: 1000 },
				"gemini-3.1-pro-high": { remainingPercentage: 85, total: 1000, used: 150 },
				"gemini-3-flash": { remainingPercentage: 95, total: 1000, used: 50 },
			},
		});

		expect(result.allFamiliesExhausted).toBe(false);
		expect(result.someFamilyExhausted).toBe(true);
		expect(result.families).toHaveLength(2);

		const claudeFamily = result.families.find((f) => f.name === "Claude");
		expect(claudeFamily).toBeDefined();
		expect(claudeFamily!.exhausted).toBe(2);
		expect(claudeFamily!.models).toBe(2);
		expect(claudeFamily!.remainingPercentage).toBe(0);

		const geminiFamily = result.families.find((f) => f.name === "Gemini");
		expect(geminiFamily).toBeDefined();
		expect(geminiFamily!.exhausted).toBe(0);
		expect(geminiFamily!.models).toBe(2);
		expect(geminiFamily!.remainingPercentage).toBeGreaterThan(0);
	});

	it("detects all families exhausted", async () => {
		const { getAntigravityFamilyQuotaState } = await import("../../src/lib/usageStatus");
		const result = getAntigravityFamilyQuotaState({
			quotas: {
				"claude-opus-4-6-thinking": { remainingPercentage: 0, total: 1000, used: 1000 },
				"claude-sonnet-4-6": { remainingPercentage: 0, total: 1000, used: 1000 },
				"gemini-3.1-pro-high": { remainingPercentage: 0, total: 1000, used: 1000 },
			},
		});

		expect(result.allFamiliesExhausted).toBe(true);
		expect(result.someFamilyExhausted).toBe(true);
	});

	it("returns allFamiliesExhausted=false when no quota data exists", async () => {
		const { getAntigravityFamilyQuotaState } = await import("../../src/lib/usageStatus");
		const result = getAntigravityFamilyQuotaState(null);
		expect(result.allFamiliesExhausted).toBe(false);
		expect(result.someFamilyExhausted).toBe(false);
		expect(result.families).toHaveLength(0);
	});

	it("returns allFamiliesExhausted=false when quotas is empty", async () => {
		const { getAntigravityFamilyQuotaState } = await import("../../src/lib/usageStatus");
		const result = getAntigravityFamilyQuotaState({ quotas: {} });
		expect(result.allFamiliesExhausted).toBe(false);
		expect(result.someFamilyExhausted).toBe(false);
		expect(result.families).toHaveLength(0);
	});

	it("handles mixed-case where only some models in a family are exhausted", async () => {
		const { getAntigravityFamilyQuotaState } = await import("../../src/lib/usageStatus");
		// Claude family: one exhausted, one healthy → family NOT exhausted
		const result = getAntigravityFamilyQuotaState({
			quotas: {
				"claude-opus-4-6-thinking": { remainingPercentage: 0, total: 1000, used: 1000 },
				"claude-sonnet-4-6": { remainingPercentage: 15, total: 1000, used: 850 },
				"gemini-3.1-pro-high": { remainingPercentage: 85, total: 1000, used: 150 },
			},
		});

		expect(result.allFamiliesExhausted).toBe(false);
		expect(result.someFamilyExhausted).toBe(false); // No family is fully exhausted

		const claudeFamily = result.families.find((f) => f.name === "Claude");
		expect(claudeFamily).toBeDefined();
		expect(claudeFamily!.exhausted).toBe(1);
		expect(claudeFamily!.models).toBe(2);
		// 15% is the best remaining, family is NOT exhausted
	});
});

describe("getUsageStatusUpdates for Antigravity", () => {
	it("returns eligible when all families healthy", async () => {
		const { getUsageStatusUpdates } = await import("../../src/lib/usageStatus");
		const result = getUsageStatusUpdates(
			{ provider: "antigravity" },
			{
				quotas: {
					"claude-sonnet-4-6": { remainingPercentage: 50, total: 1000, used: 500 },
					"gemini-3.1-pro-high": { remainingPercentage: 85, total: 1000, used: 150 },
				},
			},
		);
		expect(result.routingStatus).toBe("eligible");
		expect(result.healthStatus).toBe("healthy");
		expect(result.quotaState).toBe("ok");
	});

	it("returns eligible with reasonDetail when one family exhausted", async () => {
		const { getUsageStatusUpdates } = await import("../../src/lib/usageStatus");
		const result = getUsageStatusUpdates(
			{ provider: "antigravity" },
			{
				quotas: {
					"claude-opus-4-6-thinking": { remainingPercentage: 0, total: 1000, used: 1000 },
					"claude-sonnet-4-6": { remainingPercentage: 0, total: 1000, used: 1000 },
					"gemini-3.1-pro-high": { remainingPercentage: 85, total: 1000, used: 150 },
				},
			},
		);
		expect(result.routingStatus).toBe("eligible");
		expect(result.reasonDetail).toContain("Claude exhausted");
		// Should include model lock info or family-level exhaustion, but NOT set global exhausted
		expect(result.quotaState).toBe("ok");
	});

	it("returns exhausted when ALL families exhausted", async () => {
		const { getUsageStatusUpdates } = await import("../../src/lib/usageStatus");
		const result = getUsageStatusUpdates(
			{ provider: "antigravity" },
			{
				quotas: {
					"claude-opus-4-6-thinking": { remainingPercentage: 0, total: 1000, used: 1000 },
					"claude-sonnet-4-6": { remainingPercentage: 0, total: 1000, used: 1000 },
					"gemini-3.1-pro-high": { remainingPercentage: 0, total: 1000, used: 1000 },
				},
			},
		);
		expect(result.routingStatus).toBe("exhausted");
		expect(result.quotaState).toBe("exhausted");
		expect(result.reasonCode).toBe("quota_exhausted");
	});

	it("enriches usageSnapshot with _familyQuotas", async () => {
		const { getUsageStatusUpdates } = await import("../../src/lib/usageStatus");
		const result = getUsageStatusUpdates(
			{ provider: "antigravity" },
			{
				quotas: {
					"claude-sonnet-4-6": { remainingPercentage: 50, total: 1000, used: 500 },
					"gemini-3.1-pro-high": { remainingPercentage: 85, total: 1000, used: 150 },
				},
			},
		);
		const snapshot = JSON.parse(result.usageSnapshot || "{}");
		expect(snapshot._familyQuotas).toBeDefined();
		expect(snapshot._familyQuotas).toHaveLength(2);
		const claude = snapshot._familyQuotas.find((f: any) => f.name === "Claude");
		expect(claude).toBeDefined();
		expect(claude.models).toBe(1);
	});
});
