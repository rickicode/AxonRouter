import { getUsageCheckScheduler } from "@/lib/usageCheckScheduler";

let bootstrapped = false;

export async function ensureUsageCheckSchedulerStarted() {
  if (bootstrapped) return getUsageCheckScheduler().getStatus();
  bootstrapped = true;
  return getUsageCheckScheduler().start();
}
