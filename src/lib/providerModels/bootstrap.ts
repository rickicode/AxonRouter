import { getModelSyncScheduler } from "@/lib/providerModels/scheduler";
import { syncNoAuthProviderModels } from "@/lib/providerModels/noAuthSync";

let bootstrapped = false;

export async function ensureModelSyncSchedulerStarted() {
  if (bootstrapped) return getModelSyncScheduler().getStatus();
  bootstrapped = true;
  // Always sync noAuth providers on first access (they're free, no credentials needed)
  syncNoAuthProviderModels().catch(() => {});
  return getModelSyncScheduler().start();
}
