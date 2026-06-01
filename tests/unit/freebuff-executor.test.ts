import { afterEach, describe, expect, it, vi } from "vitest";

import { FreebuffExecutor } from "../../open-sse/executors/freebuff.ts";
import { FREEBUFF_DEFAULT_MODEL } from "../../src/lib/freebuff/probe.ts";

const originalFetch = global.fetch;

afterEach(() => {
	global.fetch = originalFetch;
	vi.restoreAllMocks();
});

describe("FreebuffExecutor request normalization", () => {
	it("maps developer messages to system messages for DeepSeek-backed free completions", () => {
		const executor = new FreebuffExecutor() as any;

		const body = executor.buildEnhancedBody(
			{
				messages: [
					{ role: "developer", content: "Follow project rules." },
					{ role: "user", content: "Hello" },
				],
			},
			"deepseek/deepseek-v4-flash",
			"run-1",
			"client-1",
			"instance-1",
		);

		expect(body.messages).toEqual([
			{ role: "system", content: "Follow project rules." },
			{ role: "user", content: "Hello" },
		]);
		expect(body.codebuff_metadata).toMatchObject({
			run_id: "run-1",
			client_id: "client-1",
			freebuff_instance_id: "instance-1",
		});
	});

	it("extracts precise cooldown from Freebuff 429 quota errors", () => {
		const executor = new FreebuffExecutor() as any;
		const parsed = executor.parseError(
			new Response(JSON.stringify({
				error: "free_mode_rate_limited",
				message: "Free mode rate limit exceeded (30 minutes limit). Try again in 6 minutes.",
			}), { status: 429 }),
			JSON.stringify({
				error: "free_mode_rate_limited",
				message: "Free mode rate limit exceeded (30 minutes limit). Try again in 6 minutes.",
			}),
		);

		expect(parsed.status).toBe(429);
		expect(parsed.message).toContain("Try again in 6 minutes");
		expect(parsed.resetsAtMs).toBeGreaterThan(Date.now() + 5 * 60 * 1000);
		expect(parsed.resetsAtMs).toBeLessThanOrEqual(Date.now() + 6 * 60 * 1000);
	});

	it("normalizes rate-limited session payloads to HTTP 429 even when upstream session returns 200", async () => {
		const executor = new FreebuffExecutor() as any;
		global.fetch = vi.fn().mockResolvedValueOnce(
			new Response(JSON.stringify({
				status: "rate_limited",
				error: "free_mode_rate_limited",
				message: "Free mode rate limit exceeded. Try again in 6 minutes.",
				retryAfterMs: 360000,
			}), { status: 200, headers: { "Content-Type": "application/json" } }),
		) as any;

		const result = await executor.execute({
			model: FREEBUFF_DEFAULT_MODEL,
			body: {
				model: FREEBUFF_DEFAULT_MODEL,
				messages: [{ role: "user", content: "hello" }],
			},
			stream: true,
			credentials: {
				apiKey: "token-1",
				providerSpecificData: { instanceId: "instance-1" },
			},
			log: null,
		});

		expect(result.response.status).toBe(429);
		await expect(result.response.json()).resolves.toMatchObject({
			status: "rate_limited",
			error: "free_mode_rate_limited",
		});
	});
});
