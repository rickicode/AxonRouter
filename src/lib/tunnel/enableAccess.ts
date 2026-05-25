import { enableTunnelAndPersist } from "./tunnelStateFacade";

const DNS_WARMUP_DELAY_MS = 8000;

export async function enableTunnelWithDnsWarmup() {
  const result = await enableTunnelAndPersist();
  // Wait for DNS warmup to propagate at Cloudflare edge after tunnel registered.
  await new Promise((resolve) => setTimeout(resolve, DNS_WARMUP_DELAY_MS));
  return result;
}
