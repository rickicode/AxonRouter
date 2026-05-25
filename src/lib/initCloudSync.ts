let initialized = false;

function loadInitializeAppModule() {
  // Keep init runtime loading out of static trace when building standalone output.
  const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<typeof import("@/shared/services/initializeApp")>;
  return dynamicImport("@/shared/services/initializeApp");
}

export async function ensureAppInitialized() {
  if (!initialized) {
    try {
      const { default: initializeApp } = await loadInitializeAppModule();
      await initializeApp();
      initialized = true;
    } catch (error) {
      console.error("[ServerInit] Error initializing app:", error);
    }
  }
  return initialized;
}

export default ensureAppInitialized;
