function isWorkerRuntime() {
	return (
		typeof (globalThis as typeof globalThis & { WebSocketPair?: unknown })
			.WebSocketPair !== "undefined" ||
		typeof (globalThis as typeof globalThis & { EdgeRuntime?: unknown })
			.EdgeRuntime !== "undefined"
	);
}

type DataDirModule = {
	DATA_DIR?: string | null;
	getDataDir?: () => string | null;
};

type MinimalFs = {
	existsSync(path: string): boolean;
	readFileSync(path: string, encoding: string): string;
	mkdirSync(path: string, options?: { recursive?: boolean }): void;
	writeFileSync(path: string, data: string, encoding: string): void;
	unlinkSync(path: string): void;
};

type MinimalPath = {
	join(...parts: string[]): string;
};

type NodeHelpers = {
	fs: MinimalFs;
	dataDir: string;
	filePath: string;
};

async function importDataDirModule(): Promise<DataDirModule | null> {
	try {
		return await import("../../src/lib/dataDir");
	} catch {
		try {
			return await import("../../src/lib/dataDir");
		} catch {
			return null;
		}
	}
}

async function importNodeFs(): Promise<MinimalFs | null> {
	if (isWorkerRuntime()) return null;
	try {
		const modName = ["node", "fs"].join(":");
		const mod = await (import(/* webpackIgnore: true */ modName) as Promise<any>);
		return (mod.default || mod) as MinimalFs;
	} catch {
		return null;
	}
}

async function importNodePath(): Promise<MinimalPath | null> {
	if (isWorkerRuntime()) return null;
	try {
		const modName = ["node", "path"].join(":");
		const mod = await (import(/* webpackIgnore: true */ modName) as Promise<any>);
		return (mod.default || mod) as MinimalPath;
	} catch {
		return null;
	}
}

export async function loadInstructionsNodeHelpers(
	filename: string,
): Promise<NodeHelpers | null> {
	try {
		const [fs, path, dataDirModule] = await Promise.all([
			importNodeFs(),
			importNodePath(),
			importDataDirModule(),
		]);
			const dataDir =
				typeof dataDirModule?.getDataDir === "function"
					? dataDirModule.getDataDir()
					: dataDirModule?.DATA_DIR;
		if (!fs || !path || !dataDir) return null;

		return {
			fs,
			dataDir,
			filePath: path.join(dataDir, filename),
		};
	} catch {
		return null;
	}
}

export async function importInstructionsLocalDbModule() {
	try {
		return await import("../../src/lib/localDb");
	} catch {
		try {
			return await import("../../src/lib/localDb");
		} catch {
			return null;
		}
	}
}

export { isWorkerRuntime };
