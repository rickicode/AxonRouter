import { MORPH_DEFAULT_INSTRUCTIONS } from "./morphInstructions";

export const MORPH_INSTRUCTIONS_FILENAME = "morph-instructions.md";

const DEFAULT_SETTINGS = Object.freeze({
	enabled: true,
	mode: "default" as const,
});

type InstructionsSettingsInput =
	| {
			enabled?: boolean;
			mode?: string;
	  }
	| null
	| undefined;

import {
	importInstructionsLocalDbModule,
	isWorkerRuntime,
	loadInstructionsNodeHelpers,
} from "./instructionsConfigShared";

async function loadNodeHelpers() {
	return loadInstructionsNodeHelpers(MORPH_INSTRUCTIONS_FILENAME);
}

async function loadMorphInstructionsSettings() {
	if (isWorkerRuntime()) return null;

	try {
		const localDbModule = await importInstructionsLocalDbModule();
		const getSettings = localDbModule?.getSettings;
		if (typeof getSettings !== "function") return null;
		const settings = await getSettings();
		return settings?.morphInstructions || null;
	} catch {
		return null;
	}
}

export function normalizeMorphInstructionsSettings(
	raw: InstructionsSettingsInput,
) {
	if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
	const enabled = raw.enabled !== false;
	const mode = raw.mode === "custom" ? "custom" : "default";
	return { enabled, mode };
}

export async function readCustomMorphInstructionsFile() {
	try {
		const helpers = await loadNodeHelpers();
		if (!helpers || !helpers.fs.existsSync(helpers.filePath)) return null;
		const content = helpers.fs.readFileSync(helpers.filePath, "utf-8");
		return typeof content === "string" ? content : null;
	} catch {
		return null;
	}
}

export async function writeCustomMorphInstructionsFile(
	content: string | null | undefined,
) {
	const text = typeof content === "string" ? content : "";
	const helpers = await loadNodeHelpers();
	if (!helpers) return;
	if (!helpers.fs.existsSync(helpers.dataDir)) {
		helpers.fs.mkdirSync(helpers.dataDir, { recursive: true });
	}
	helpers.fs.writeFileSync(helpers.filePath, text, "utf-8");
}

export async function deleteCustomMorphInstructionsFile() {
	try {
		const helpers = await loadNodeHelpers();
		if (helpers?.fs.existsSync(helpers.filePath)) {
			helpers.fs.unlinkSync(helpers.filePath);
		}
	} catch {
		// Best-effort.
	}
}

export function resolveMorphInstructionsFromConfig(
	rawSettings: InstructionsSettingsInput,
	customContent: string | null | undefined,
) {
	const { enabled, mode } = normalizeMorphInstructionsSettings(rawSettings);
	if (!enabled) return "";
	if (mode === "custom") {
		if (typeof customContent === "string" && customContent.length > 0) {
			return customContent;
		}
		return MORPH_DEFAULT_INSTRUCTIONS;
	}
	return MORPH_DEFAULT_INSTRUCTIONS;
}

export async function resolveMorphInstructionsForRequest() {
	const raw = await loadMorphInstructionsSettings();
	const { enabled, mode } = normalizeMorphInstructionsSettings(raw);
	if (!enabled) return "";
	if (mode === "custom") {
		const custom = await readCustomMorphInstructionsFile();
		if (typeof custom === "string" && custom.length > 0) return custom;
		return MORPH_DEFAULT_INSTRUCTIONS;
	}
	return MORPH_DEFAULT_INSTRUCTIONS;
}
