export async function register() {
  // configureTunnelDeps is called at module-level in initializeApp.ts
  // Importing it here ensures DI is configured before any route handler executes
  await import("@/shared/services/initializeApp");
}
