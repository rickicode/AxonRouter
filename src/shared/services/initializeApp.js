import { cleanupProviderConnections } from "@/lib/localDb";

process.setMaxListeners(20);

// Defer heavy startup work so the first HTTP request isn't starved
const STARTUP_DEFER_MS = 2000;

// Survive Next.js hot reload
const g = (global.__appSingleton ??= {
  initialized: false,
});

export async function initializeApp() {
  if (g.initialized) return;
  g.initialized = true;

  try {
    // Defer background schedulers — nothing here blocks incoming requests.
    setTimeout(() => {
      runHeavyStartup().catch((e) => console.error("[InitApp] deferred startup failed:", e.message));
    }, STARTUP_DEFER_MS);
  } catch (error) {
    console.error("[InitApp] Error:", error);
  }
}

async function runHeavyStartup() {
  await cleanupProviderConnections();

  // Seed built-in combos on first boot only
  import("@/lib/seed/seedDefaultCombos")
    .then(({ seedDefaultCombos }) => seedDefaultCombos())
    .catch((e) => console.log("[InitApp] combo seed failed:", e.message));

  // Proactive OAuth token refresh (e.g. grok-cli ~6h TTL). Module is idempotent.
  import("@/sse/services/backgroundTokenRefresh.js")
    .then(({ startBackgroundTokenRefresh }) => startBackgroundTokenRefresh())
    .catch((e) => console.log("[BackgroundTokenRefresh] scheduler start failed:", e.message));

  // Quota cache background refresh
  import("@/domain/quotaCache.js")
    .then(({ startBackgroundRefresh }) => startBackgroundRefresh())
    .catch((e) => console.log("[QuotaCache] scheduler start failed:", e.message));

  // Periodic in-memory state sweeper — prunes expired fitness/session state.
  import("@/lib/network/stateSweeper.js")
    .then(({ startStateSweeper }) => startStateSweeper())
    .catch((e) => console.log("[StateSweeper] scheduler start failed:", e.message));
}


export default initializeApp;
