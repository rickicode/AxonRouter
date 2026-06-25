import { cleanupProviderConnections, getSettings } from "@/lib/localDb";
import { closeSqliteDb } from "@/lib/sqliteHelpers";
import { bootstrapUsageDb } from "@/lib/usageDb/bootstrap";
import { closeUsageDb } from "@/lib/usageDb/core";
import { drainUsageQueue } from "@/lib/usageDb/backgroundQueue";
import { autoStartMitmIfEnabled, bootstrapMitmRuntimeFromInitializeApp } from "@/lib/mitm/initializeMitmAccess";
import { ensureUsageCheckSchedulerStarted } from "@/lib/usageCheckScheduler/bootstrap";
import { startProxyHealthCheck } from "@/lib/network/proxyHealthCheck";
import { ensureDefaultPassword } from "@/lib/auth/ensureDefaultPassword";
    // Initialize combo rotation state from disk (survives restarts)
    initRotationState().catch(() => {});

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
