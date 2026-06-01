import type { UsageRefreshTrigger } from "@/lib/usageRefresh/canonicalTypes";

type RefreshUsageOptions = {
  runConnectionTest?: boolean;
  force?: boolean;
  trigger?: UsageRefreshTrigger;
  metadata?: Record<string, unknown>;
};

export async function refreshUsageWithTransientSkip(
  connectionId: string,
  options: RefreshUsageOptions = {}
) {
  const { runCanonicalUsageWorker } = await import("@/lib/canonicalUsageWorker");
  const { trigger = "preflight", ...workerOptions } = options;
  return runCanonicalUsageWorker({
    connectionId,
    trigger,
    ...workerOptions,
    skipTransientConnectivityErrors: true,
  });
}
