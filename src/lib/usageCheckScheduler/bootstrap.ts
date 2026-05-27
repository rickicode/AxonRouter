import { getUsageCheckScheduler } from "@/lib/usageCheckScheduler";

let bootstrapped = false;
let bootPromise: Promise<any> | null = null;

export async function ensureUsageCheckSchedulerStarted() {
  if (bootstrapped) return getUsageCheckScheduler().getStatus();
  if (bootPromise) return bootPromise;

  bootPromise = getUsageCheckScheduler()
    .start()
    .then((status) => {
      bootstrapped = true;
      return status;
    })
    .catch((err) => {
      bootPromise = null; // Allow retry on next call
      throw err;
    });

  return bootPromise;
}
