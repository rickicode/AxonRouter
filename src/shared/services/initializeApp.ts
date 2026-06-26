import { cleanupProviderConnections, getSettings } from "@/lib/localDb";
import { closeSqliteDb } from "@/lib/sqliteHelpers";
import { bootstrapUsageDb } from "@/lib/usageDb/bootstrap";
import { closeUsageDb } from "@/lib/usageDb/core";
import { drainUsageQueue } from "@/lib/usageDb/backgroundQueue";
import { autoStartMitmIfEnabled, bootstrapMitmRuntimeFromInitializeApp } from "@/lib/mitm/initializeMitmAccess";
import { ensureUsageCheckSchedulerStarted } from "@/lib/usageCheckScheduler/bootstrap";
import { startProxyHealthCheck } from "@/lib/network/proxyHealthCheck";
import { ensureDefaultPassword } from "@/lib/auth/ensureDefaultPassword";

// Inject correct paths and DB hooks into the MITM runtime once from the initializer context.
void bootstrapMitmRuntimeFromInitializeApp();

// Multiple modules register SIGINT/SIGTERM handlers legitimately
process.setMaxListeners(20);

// Use global to survive Next.js hot reload — prevents duplicate intervals
const g = global.__appSingleton ??= {
  signalHandlersRegistered: false,
  mitmStartInProgress: false,
};

async function cleanupAppResources() {
  try {
    await drainUsageQueue();
  } catch {}

  try {
    closeUsageDb();
  } catch {}

  try {
    closeSqliteDb();
  } catch {}
}

/**
 * Initialize app on startup
 * - Cleanup stale data
 * - Register shutdown handler to close SQLite resources
 */
export async function initializeApp() {
  try {
    await cleanupProviderConnections();
    await bootstrapUsageDb();

    // Set request logging flag from DB settings
    const settings = await getSettings();
    (globalThis as any).__AXONROUTER_REQUEST_LOGS_ENABLED = settings.enableRequestLogs === true;

    // Close SQLite resources on process exit.
    if (!g.signalHandlersRegistered) {
      const cleanup = () => {
        void cleanupAppResources();
      };
      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
      process.on("unhandledRejection", (reason) => {
        console.error("[AxonRouter] Unhandled rejection:", reason);
      });
      process.on("uncaughtException", (error) => {
        console.error("[AxonRouter] Uncaught exception:", error);
      });
      g.signalHandlersRegistered = true;
    }

    // Ensure dashboard password exists (first-run default or AXONROUTER_PASSWORD env)
    await ensureDefaultPassword();

    // Initialize combo rotation state from disk (survives restarts)
    // Dynamic import to avoid Turbopack NFT warnings (rotationPersist uses fs/path)
    import("../../../open-sse/services/combo").then((m) => m.initRotationState()).catch(() => {});

    // Auto-seed smart routing combos (auto-small, auto-medium, etc.) on first run
    import("@/lib/smart-router/seed").then((m) => m.seedAutoCombos()).catch(() => {});

    // Auto-start MITM if it was enabled before restart
    autoStartMitm();

    // Start usage check scheduler (background, non-blocking)
    ensureUsageCheckSchedulerStarted().catch(() => {});

    // Start proxy health check scheduler (background, non-blocking)
    startProxyHealthCheck();
  } catch (error) {
    console.error("[InitApp] Error:", error);
  }
}

/** Auto-start MITM if it was enabled before restart */
async function autoStartMitm() {
  if (g.mitmStartInProgress) return;
  g.mitmStartInProgress = true;
  try {
    await autoStartMitmIfEnabled();
  } catch (err) {
    console.log("[InitApp] MITM auto-start failed:", err.message);
  } finally {
    g.mitmStartInProgress = false;
  }
}

export default initializeApp;
