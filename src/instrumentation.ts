export async function register() {
  // Importing initializeApp ensures tunnel and app services are initialized before any route handler executes
  // Note: register() only runs in nodejs runtime in Next.js 16, no EXT_RUNTIME guard needed
  await import("@/shared/services/initializeApp");
}
