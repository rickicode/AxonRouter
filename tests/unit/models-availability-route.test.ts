import { beforeEach, describe, expect, it, vi } from "vitest";

type MockConnection = Record<string, unknown> & {
	id: string;
	provider: string;
};

type ProviderFilter = {
	provider?: string;
};

const mockConnections: MockConnection[] = [];
const getProviderConnections = vi.fn(async (filter: ProviderFilter = {}) => {
	if (filter.provider) {
		return mockConnections.filter(
			(connection) => connection.provider === filter.provider,
		);
	}
	return mockConnections;
});
const updateProviderConnection = vi.fn(
	async (id: string, data: Record<string, unknown>) => ({ id, ...data }),
);

vi.mock("next/server", () => ({
	NextResponse: {
		json: (body: unknown, init?: { status?: number }) => ({
			status: init?.status || 200,
			body,
			json: async () => body,
		}),
	},
}));

vi.mock("@/lib/localDb", () => ({
	getProviderConnections,
	updateProviderConnection,
}));

vi.mock("@/lib/connectionStatus", async () => {
	const actual = await import("../../src/lib/connectionStatus.ts");
	return actual;
});

describe("models availability route", () => {
	const futureIso = () =>
		new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

	beforeEach(() => {
		mockConnections.length = 0;
		getProviderConnections.mockClear();
		updateProviderConnection.mockClear();
		vi.resetModules();
	});

	it("derives canonical provider-wide and model-lock rows from centralized state", async () => {
		const retryAt = futureIso();
		mockConnections.push(
			{
				id: "conn-cooldown",
				provider: "codex",
				name: "Cooldown Conn",
				routingStatus: "exhausted",
				nextRetryAt: retryAt,
				reasonDetail: "Quota exhausted",
			},
			{
				id: "conn-model-lock",
				provider: "codex",
				name: "Model Lock Conn",
				routingStatus: "eligible",
				["modelLock_gpt-4.1"]: futureIso(),
			},
			{
				id: "conn-blocked",
				provider: "openai",
				name: "Blocked Conn",
				routingStatus: "blocked",
				lastError: "Probe failed",
			},
		);

		const { GET } = await import(
			"../../src/app/api/models/availability/route.ts"
		);
		const response = await GET(
			new Request("http://localhost/api/models/availability"),
		);

		expect(response.status).toBe(200);
		expect(response.body.models).toEqual([
			expect.objectContaining({
				connectionId: "conn-cooldown",
				provider: "codex",
				model: "__all",
				status: "exhausted",
				until: retryAt,
				lastError: "Quota exhausted",
			}),
			expect.objectContaining({
				connectionId: "conn-model-lock",
				provider: "codex",
				model: "gpt-4.1",
				status: "cooldown",
			}),
			expect.objectContaining({
				connectionId: "conn-blocked",
				provider: "openai",
				connectionName: "Blocked Conn",
				model: "__all",
				status: "blocked",
				until: undefined,
				lastError: null,
			}),
		]);
		expect(response.body.unavailableCount).toBe(3);
	});

	it("includes exhausted provider-wide and model-lock rows when both apply", async () => {
		const retryAt = futureIso();
		mockConnections.push({
			id: "conn-both",
			provider: "codex",
			name: "Mixed Conn",
			routingStatus: "exhausted",
			nextRetryAt: retryAt,
			modelLock_gpt4: futureIso(),
		});

		const { GET } = await import(
			"../../src/app/api/models/availability/route.ts"
		);
		const response = await GET(
			new Request("http://localhost/api/models/availability"),
		);

		expect(response.status).toBe(200);
		expect(response.body.models).toEqual([
			expect.objectContaining({
				connectionId: "conn-both",
				model: "__all",
				status: "exhausted",
				until: retryAt,
			}),
			expect.objectContaining({
				connectionId: "conn-both",
				model: "gpt4",
				status: "cooldown",
			}),
		]);
	});

	it("includes provider-wide rows for timed cooldowns without centralized blocked status", async () => {
		const nextRetryAt = futureIso();
		const resetAt = futureIso();
		mockConnections.push(
			{
				id: "conn-next-retry",
				provider: "codex",
				name: "Retry Conn",
				routingStatus: "eligible",
				nextRetryAt,
				reasonDetail: "Backoff active",
			},
			{
				id: "conn-reset-at",
				provider: "openai",
				name: "Reset Conn",
				routingStatus: "eligible",
				resetAt,
			},
		);

		const { GET } = await import(
			"../../src/app/api/models/availability/route.ts"
		);
		const response = await GET(
			new Request("http://localhost/api/models/availability"),
		);

		expect(response.status).toBe(200);
		expect(response.body.models).toEqual([
			expect.objectContaining({
				connectionId: "conn-next-retry",
				provider: "codex",
				model: "__all",
				status: "exhausted",
				until: nextRetryAt,
				lastError: "Backoff active",
			}),
			expect.objectContaining({
				connectionId: "conn-reset-at",
				provider: "openai",
				model: "__all",
				status: "exhausted",
				until: resetAt,
			}),
		]);
	});

	it("includes provider-wide timed cooldown row alongside model lock rows", async () => {
		const nextRetryAt = futureIso();
		mockConnections.push({
			id: "conn-timed-and-model",
			provider: "codex",
			name: "Timed Mixed Conn",
			routingStatus: "eligible",
			nextRetryAt,
			modelLock_gpt4: futureIso(),
		});

		const { GET } = await import(
			"../../src/app/api/models/availability/route.ts"
		);
		const response = await GET(
			new Request("http://localhost/api/models/availability"),
		);

		expect(response.status).toBe(200);
		expect(response.body.models).toEqual([
			expect.objectContaining({
				connectionId: "conn-timed-and-model",
				model: "__all",
				status: "exhausted",
				until: nextRetryAt,
			}),
			expect.objectContaining({
				connectionId: "conn-timed-and-model",
				model: "gpt4",
				status: "cooldown",
			}),
		]);
	});

	it("clears provider-wide cooldown fields without forced reactivation when status is not eligible", async () => {
		mockConnections.push({
			id: "conn-cooldown",
			provider: "codex",
			routingStatus: "exhausted",
			quotaState: "exhausted",
			testStatus: "unavailable",
			nextRetryAt: futureIso(),
			rateLimitedUntil: futureIso(),
			reasonCode: "quota_exhausted",
			reasonDetail: "Weekly quota exhausted",
			modelLock_gpt4: futureIso(),
		});

		const { POST } = await import(
			"../../src/app/api/models/availability/route.ts"
		);
		const response = await POST(
			new Request("http://localhost/api/models/availability", {
				method: "POST",
				body: JSON.stringify({
					action: "clearCooldown",
					provider: "codex",
					model: "__all",
				}),
				headers: { "content-type": "application/json" },
			}),
		);

		expect(response.status).toBe(200);
		expect(updateProviderConnection).toHaveBeenCalledWith("conn-cooldown", {
			nextRetryAt: null,
			resetAt: null,
			modelLock_gpt4: null,
			routingStatus: null,
			quotaState: null,
		});
	});

	it("does not reactivate provider-wide clears when a non-cooldown blocker remains", async () => {
		mockConnections.push({
			id: "conn-expired",
			provider: "codex",
			routingStatus: "blocked_quota",
			quotaState: "exhausted",
			authState: "expired",
			testStatus: "unavailable",
			nextRetryAt: futureIso(),
		});

		const { POST } = await import(
			"../../src/app/api/models/availability/route.ts"
		);
		const response = await POST(
			new Request("http://localhost/api/models/availability", {
				method: "POST",
				body: JSON.stringify({
					action: "clearCooldown",
					provider: "codex",
					model: "__all",
				}),
				headers: { "content-type": "application/json" },
			}),
		);

		expect(response.status).toBe(200);
		expect(updateProviderConnection).toHaveBeenCalledWith("conn-expired", {
			nextRetryAt: null,
			resetAt: null,
			quotaState: null,
		});
	});

	it("clears model-specific locks without changing unrelated provider-wide state", async () => {
		mockConnections.push({
			id: "conn-model-lock",
			provider: "codex",
			routingStatus: "eligible",
			testStatus: "active",
			modelLock_gpt4: futureIso(),
		});

		const { POST } = await import(
			"../../src/app/api/models/availability/route.ts"
		);
		const response = await POST(
			new Request("http://localhost/api/models/availability", {
				method: "POST",
				body: JSON.stringify({
					action: "clearCooldown",
					provider: "codex",
					model: "gpt4",
				}),
				headers: { "content-type": "application/json" },
			}),
		);

		expect(response.status).toBe(200);
		expect(updateProviderConnection).toHaveBeenCalledWith("conn-model-lock", {
			modelLock_gpt4: null,
		});
	});

	it("ignores expired raw model lock fields when clearing a specific model", async () => {
		mockConnections.push({
			id: "conn-expired-lock",
			provider: "codex",
			routingStatus: "eligible",
			testStatus: "active",
			modelLock_gpt4: "2020-04-24T00:00:00.000Z",
		});

		const { POST } = await import(
			"../../src/app/api/models/availability/route.ts"
		);
		const response = await POST(
			new Request("http://localhost/api/models/availability", {
				method: "POST",
				body: JSON.stringify({
					action: "clearCooldown",
					provider: "codex",
					model: "gpt4",
				}),
				headers: { "content-type": "application/json" },
			}),
		);

		expect(response.status).toBe(200);
		expect(updateProviderConnection).not.toHaveBeenCalled();
	});
});
