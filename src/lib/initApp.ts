import initializeApp from "@/shared/services/initializeApp";

let initPromise: Promise<void> | null = null;

export function ensureAppInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = initializeApp().catch((err) => {
      console.error("[InitApp] Initialization failed:", err);
      initPromise = null;
    });
  }
  return initPromise;
}

// Auto-initialize when this module is first imported (server-side side effect)
void ensureAppInitialized();
