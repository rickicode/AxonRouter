export async function register() {
  // configureTunnelDeps is called at module-level in initializeApp.ts
  // Importing it here ensures DI is configured before any route handler executes
  // Note: register() only runs in nodejs runtime in Next.js 16, no EXT_RUNTIME guard needed
  await import("@/shared/services/initializeApp");
}
