import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConnections = [];
const getProviderConnections = vi.fn(async () => mockConnections);
const getProviderConnectionById = vi.fn(
	async (id) =>
		mockConnections.find((connection) => connection.id === id) || null,
);
const validateApiKey = vi.fn(async () => true);
const updateProviderConnection = vi.fn(async (id, data) => ({ id, ...data }));
const getSettings = vi.fn(async () => ({
	fallbackStrategy: "fill-first",
	stickyRoundRobinLimit: 3,
	providerStrategies: {},
}));
const getEligibleConnections = vi.fn(async () => null);
const writeConnectionHotState = vi.fn(async ({ patch }) => patch);
const setConnectionHotState = vi.fn(async () => null);
const projectLegacyConnectionState = vi.fn((snapshot = {}) => snapshot);
const resolveConnectionProxyConfig = vi.fn(async () => ({
	connectionProxyEnabled: false,
	connectionProxyUrl: "",
	connectionNoProxy: false,
	proxyPoolId: null,
	vercelRelayUrl: "",
}));
const applyLiveQuotaUpdate = vi.fn(async () => null);
const getCodexLiveQuotaSignal = vi.fn(() => null);
const syncUsageStatus = vi.fn(async () => null);

vi.mock("@/lib/localDb", () => ({
	getProviderConnections,
	getProviderConnectionById,
	validateApiKey,
	updateProviderConnection,
	getSettings,
}));

vi.mock("@/lib/providerHotState", () => ({
	getEligibleConnections,
	writeConnectionHotState,
	setConnectionHotState,
	projectLegacyConnectionState,
}));

vi.mock("@/lib/network/connectionProxy", () => ({
	resolveConnectionProxyConfig,
}));

vi.mock("../../src/lib/usageStatus.ts", async () => {
	const actual = await vi.importActual("../../src/lib/usageStatus.ts");
		return {
			...actual,
			applyLiveQuotaUpdate,
			getCodexLiveQuotaSignal,
			syncUsageStatus,
		};
	});

vi.mock("@/shared/constants/providers", async () => {
	const actual = await vi.importActual(
		"../../src/shared/constants/providers.ts",
	);
	return actual;
});

const checkFallbackError = vi.fn(() => ({
	shouldFallback: false,
	cooldownMs: 0,
	newBackoffLevel: 0,
}));

vi.mock("open-sse/services/accountFallback.ts", () => ({
	formatRetryAfter: vi.fn((value) => value),
	checkFallbackError,
	isModelLockActive: vi.fn((connection, model) => {
		if (!connection || !model) return false;
		const expiry =
			connection[`modelLock_${model}`] || connection.modelLock___all;
		return Boolean(expiry) && new Date(expiry).getTime() > Date.now();
	}),
	buildModelLockUpdate: vi.fn(() => ({ modelLock___all: null })),
	getEarliestModelLockUntil: vi.fn(() => null),
}));

describe("Amazon Q integration follow-ups", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mockConnections.length = 0;
		getProviderConnections.mockResolvedValue(mockConnections);
		getSettings.mockResolvedValue({
			fallbackStrategy: "fill-first",
			stickyRoundRobinLimit: 3,
			providerStrategies: {},
		});
			getEligibleConnections.mockResolvedValue(null);
			syncUsageStatus.mockResolvedValue(null);
		});

	it("does not block Amazon Q accounts for client-side input length errors", async () => {
		mockConnections.push({
			id: "conn-amazon-q-long-input",
			provider: "amazon-q",
			isActive: true,
			priority: 1,
			displayName: "Amazon Q long input",
			accessToken: "token",
			routingStatus: "eligible",
			authState: "ok",
		});

		const { buildModelLockUpdate, checkFallbackError } = await import(
			"open-sse/services/accountFallback.ts"
		);
		const { markAccountUnavailable } = await import(
			"../../src/sse/services/auth.tsx"
		);

		const result = await markAccountUnavailable(
			"conn-amazon-q-long-input",
			400,
			'[400]: {"message":"Input is too long.","reason":"CONTENT_LENGTH_EXCEEDS_THRESHOLD"}',
			"amazon-q",
			"claude-sonnet-4",
		);

		expect(result).toEqual({ shouldFallback: false, cooldownMs: 0 });
		expect(checkFallbackError).not.toHaveBeenCalled();
		expect(buildModelLockUpdate).not.toHaveBeenCalled();
		expect(writeConnectionHotState).not.toHaveBeenCalled();
		expect(updateProviderConnection).not.toHaveBeenCalled();
	});

	it("does not block accounts for Gemini INVALID_ARGUMENT request validation errors", async () => {
		mockConnections.push({
			id: "conn-gemini-invalid-arg",
			provider: "gemini-cli",
			isActive: true,
			priority: 1,
			displayName: "Gemini invalid arg",
			accessToken: "token",
			routingStatus: "eligible",
			authState: "ok",
		});

		const { buildModelLockUpdate, checkFallbackError } = await import(
			"open-sse/services/accountFallback.ts"
		);
		const { markAccountUnavailable } = await import(
			"../../src/sse/services/auth.tsx"
		);

		const result = await markAccountUnavailable(
			"conn-gemini-invalid-arg",
			400,
			'[400]: {"error":{"status":"INVALID_ARGUMENT","message":"Invalid value at request.tools[0].function_declarations[0].parameters.type"}}',
			"gemini-cli",
			"gemini-3-flash-preview",
		);

		expect(result).toEqual({ shouldFallback: false, cooldownMs: 0 });
		expect(checkFallbackError).not.toHaveBeenCalled();
		expect(buildModelLockUpdate).not.toHaveBeenCalled();
		expect(writeConnectionHotState).not.toHaveBeenCalled();
		expect(updateProviderConnection).not.toHaveBeenCalled();
	});

	it("includes Amazon Q in provider limit normalization", async () => {
		const { parseQuotaData } = await import(
			"../../src/app/(dashboard)/app/usage/components/ProviderLimits/utils.tsx"
		);

		const result = parseQuotaData("amazon-q", {
			quotas: {
				agentic_request: {
					used: 10,
					total: 100,
					remainingPercentage: 90,
					resetAt: "2026-05-11T00:00:00.000Z",
				},
			},
		});

		expect(result).toEqual([
			expect.objectContaining({
				name: "agentic_request",
				used: 10,
				total: 100,
			}),
		]);
	});

	it("puts generic provider 429 errors into cooldown instead of blocking", async () => {
		mockConnections.push({
			id: "conn-openai-rate-limit",
			provider: "openai",
			isActive: true,
			priority: 1,
			displayName: "OpenAI rate limit",
			accessToken: "token",
			routingStatus: "eligible",
			authState: "ok",
		});

		checkFallbackError.mockReturnValueOnce({
			shouldFallback: true,
			cooldownMs: 15_000,
			newBackoffLevel: 2,
		});

		const { markAccountUnavailable } = await import(
			"../../src/sse/services/auth.tsx"
		);

		const result = await markAccountUnavailable(
			"conn-openai-rate-limit",
			429,
			"Rate limit exceeded by upstream",
			"openai",
			"gpt-4o",
		);

		expect(result).toEqual({ shouldFallback: true, cooldownMs: 15000 });
			expect(syncUsageStatus).toHaveBeenCalledWith(
				expect.objectContaining({
					id: "conn-openai-rate-limit",
					provider: "openai",
				}),
				expect.objectContaining({
					lastCheckedAt: expect.any(String),
				}),
			);
	});

	it("treats Amazon Q auth validation like Kiro in provider tests", async () => {
		const fileText = await import(
			"../../src/app/api/providers/[id]/test/testUtils.ts"
		);
		expect(fileText).toBeTruthy();

		const { readFile } = await import("node:fs/promises");
		const { fileURLToPath } = await import("node:url");
		const sourcePath = fileURLToPath(
			new URL(
				"../../src/app/api/providers/[id]/test/testUtils.ts",
				import.meta.url,
			),
		);
		const source = await readFile(sourcePath, "utf8");

		expect(source).toContain(
			'if (provider === "kiro" || provider === "amazon-q")',
		);
		expect(source).toContain("kiro: { checkExpiry: true, refreshable: true }");
	});
});
