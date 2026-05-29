import { describe, expect, it } from "vitest";

import { FreebuffExecutor } from "../../open-sse/executors/freebuff.ts";

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
});
