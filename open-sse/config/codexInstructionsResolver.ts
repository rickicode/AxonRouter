/// <reference types="node" />

// Codex default instructions resolver.
//
// User-controlled, three-state behavior for the `instructions` field on Codex
// requests. Configured per-installation via dashboard provider settings:
//
//   1. enabled + mode="default"   -> built-in CODEX_DEFAULT_INSTRUCTIONS
//   2. enabled + mode="custom"    -> contents of AxonRouter home codex-instructions.md
//   3. disabled                   -> empty string (saves ~3000 tokens / request,
//                                    backend uses its own server-side default)
//
// State 3 matches CLIProxyAPI's `instructions: ""` behavior. State 1 is the
// historical axonrouter behavior and remains the default for back-compat.

import { CODEX_DEFAULT_INSTRUCTIONS } from "./codexInstructions";

export const CODEX_INSTRUCTIONS_FILENAME = "codex-instructions.md";
export const CODEX_INSTRUCTIONS_FILE_PATH = null;

const DEFAULT_SETTINGS = Object.freeze({ enabled: true, mode: "default" });

type RuntimeFlags = typeof globalThis & {
	WebSocketPair?: unknown;
	EdgeRuntime?: unknown;
};

type CodexInstructionsSettings = {
	enabled: boolean;
	mode: "default" | "custom";
};

function isWorkerRuntime() {
	const runtime = globalThis as RuntimeFlags;
	return (
		typeof runtime.WebSocketPair !== "undefined" ||
		typeof runtime.EdgeRuntime !== "undefined"
	);
}

type NodeHelpers = {
	fs: typeof import("node:fs");
	dataDir: string;
	filePath: string;
};

type LocalSettingsShape = {
	codexInstructions?: unknown;
};

async function loadNodeHelpers(): Promise<NodeHelpers | null> {
	try {
		const [fsModule, pathModule, { DATA_DIR }] = await Promise.all([
			import("node:fs"),
			import("node:path"),
			import("../../src/lib/dataDir"),
		]);
		const fs = fsModule.default;
		const path = pathModule.default;

		if (typeof DATA_DIR !== "string" || !DATA_DIR) {
			return null;
		}

		return {
			fs,
			dataDir: DATA_DIR,
			filePath: path.join(DATA_DIR, CODEX_INSTRUCTIONS_FILENAME),
		};
	} catch {
		return null;
	}
}

async function loadCodexInstructionsSettings(): Promise<unknown | null> {
	if (isWorkerRuntime()) {
		return null;
	}

	try {
		const { getSettings } = await import("../../src/lib/localDb");
		const settings = (await getSettings()) as LocalSettingsShape;
		return settings?.codexInstructions || null;
	} catch {
		return null;
	}
}

// Normalize a settings.codexInstructions object into a known shape.
export function normalizeCodexInstructionsSettings(
	raw: unknown,
): CodexInstructionsSettings {
	if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
	const settings = raw as { enabled?: boolean; mode?: string };
	const enabled = settings.enabled !== false; // default true
	const mode = settings.mode === "custom" ? "custom" : "default";
	return { enabled, mode };
}

// Read the user's custom instructions .md file, or null if absent / unreadable.
export async function readCustomCodexInstructionsFile() {
	try {
		const helpers = await loadNodeHelpers();
		if (!helpers || !helpers.fs.existsSync(helpers.filePath)) return null;
		const content = helpers.fs.readFileSync(helpers.filePath, "utf-8");
		return typeof content === "string" ? content : null;
	} catch {
		return null;
	}
}

// Write the user's custom instructions .md file. Creates parent dir as needed.
export async function writeCustomCodexInstructionsFile(content: unknown) {
	const text = typeof content === "string" ? content : "";
	const helpers = await loadNodeHelpers();
	if (!helpers) return;
	if (!helpers.fs.existsSync(helpers.dataDir)) {
		helpers.fs.mkdirSync(helpers.dataDir, { recursive: true });
	}
	helpers.fs.writeFileSync(helpers.filePath, text, "utf-8");
}

// Delete the user's custom instructions .md file. No-op if absent.
export async function deleteCustomCodexInstructionsFile() {
	try {
		const helpers = await loadNodeHelpers();
		if (helpers?.fs.existsSync(helpers.filePath)) {
			helpers.fs.unlinkSync(helpers.filePath);
		}
	} catch {
		// Best-effort.
	}
}

// Resolve the instructions string for a Codex request given the current
// codexInstructions settings and (optional) custom file contents.
export function resolveCodexInstructionsFromConfig(
	rawSettings: unknown,
	customContent: unknown,
) {
	const { enabled, mode } = normalizeCodexInstructionsSettings(rawSettings);
	if (!enabled) return "";
	if (mode === "custom") {
		if (typeof customContent === "string" && customContent.length > 0) {
			return customContent;
		}
		// Custom mode selected but no usable file content -> fall back to default
		// so requests continue to receive a meaningful prompt.
		return CODEX_DEFAULT_INSTRUCTIONS;
	}
	return CODEX_DEFAULT_INSTRUCTIONS;
}

// Async helper used by the executor: read settings (cached) + custom file and
// return the resolved instructions string for the next outbound Codex request.
export async function resolveCodexInstructionsForRequest() {
	const raw = await loadCodexInstructionsSettings();
	const { enabled, mode } = normalizeCodexInstructionsSettings(raw);
	if (!enabled) return "";
	if (mode === "custom") {
		const custom = await readCustomCodexInstructionsFile();
		if (typeof custom === "string" && custom.length > 0) return custom;
		return CODEX_DEFAULT_INSTRUCTIONS;
	}
	return CODEX_DEFAULT_INSTRUCTIONS;
}
