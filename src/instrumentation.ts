export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		// Use relative import to avoid Next.js 16.2.9 Turbopack bug where
		// dynamic `import("@/...")` inside instrumentation.ts skips path-alias
		// resolution, leaving literal `@/shared` in the runtime bundle
		// (ERR_MODULE_NOT_FOUND on every request). Relative path bypasses alias entirely.
		const { default: initializeApp } = await import("./shared/services/initializeApp");
		await initializeApp();
	}
}
