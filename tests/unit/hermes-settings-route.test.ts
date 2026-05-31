import { describe, expect, it, vi, beforeEach } from "vitest";

const requireManagementAuth = vi.fn(async () => null);
const execAsyncMock = vi.fn();
const mkdirMock = vi.fn(async () => undefined);
const readFileMock = vi.fn(async () => "");
const writeFileMock = vi.fn(async () => undefined);

vi.mock("@/lib/api/requireManagementAuth", () => ({
	requireManagementAuth,
}));

vi.mock("child_process", () => ({
	exec: (...args: any[]) => execAsyncMock(...args),
}));

vi.mock("util", async () => {
	const actual = await vi.importActual<typeof import("util")>("util");
	return {
		...actual,
		promisify: () => execAsyncMock,
	};
});

vi.mock("fs/promises", () => ({
	default: {
		mkdir: (...args: any[]) => mkdirMock(...args),
		readFile: (...args: any[]) => readFileMock(...args),
		writeFile: (...args: any[]) => writeFileMock(...args),
		access: vi.fn(async () => undefined),
	},
}));

describe("hermes settings route", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		execAsyncMock.mockResolvedValue({
			stdout: "/usr/local/bin/hermes\n",
			stderr: "",
		});
		readFileMock.mockResolvedValue("");
	});

	it("writes model value as-is with cx/ prefix to Hermes config", async () => {
		const { POST } = await import(
			"../../src/app/api/cli-tools/hermes-settings/route"
		);

		const request = new Request(
			"http://localhost/api/cli-tools/hermes-settings",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					baseUrl: "http://127.0.0.1:3000",
					apiKey: "test-key",
					model: "cx/gpt5.3-codex",
				}),
			},
		);

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(writeFileMock).toHaveBeenCalledWith(
			expect.stringContaining("config.yaml"),
			expect.stringContaining('default: "cx/gpt5.3-codex"'),
		);
	});

	it("accepts virtual router presets like auto and economy", async () => {
		const { POST } = await import(
			"../../src/app/api/cli-tools/hermes-settings/route"
		);

		const request = new Request(
			"http://localhost/api/cli-tools/hermes-settings",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					baseUrl: "http://127.0.0.1:3000/v1",
					model: "economy",
				}),
			},
		);

		const response = await POST(request);

		expect(response.status).toBe(200);
		expect(writeFileMock).toHaveBeenCalledWith(
			expect.stringContaining("config.yaml"),
			expect.stringContaining('default: "economy"'),
		);
	});

	it("preserves morph managed shortcut values", async () => {
		const { POST } = await import(
			"../../src/app/api/cli-tools/hermes-settings/route"
		);

		const request = new Request(
			"http://localhost/api/cli-tools/hermes-settings",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					baseUrl: "http://127.0.0.1:3000/v1",
					model: "morph/auto",
				}),
			},
		);

		const response = await POST(request);

		expect(response.status).toBe(200);
		expect(writeFileMock).toHaveBeenCalledWith(
			expect.stringContaining("config.yaml"),
			expect.stringContaining('default: "morph/auto"'),
		);
	});
});
