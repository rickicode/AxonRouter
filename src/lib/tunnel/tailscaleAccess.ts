import { DEFAULT_AXONROUTER_PORT } from "@/shared/constants/runtimeDefaults";
import { getTunnelStateManagerRuntime } from "./tunnelStateManagerRuntime";

export async function enableTailscaleAccess(localPort = Number(DEFAULT_AXONROUTER_PORT)) {
  const { enableTailscale } = await getTunnelStateManagerRuntime();
  return enableTailscale(localPort);
}

export async function disableTailscaleAccess() {
  const { disableTailscale } = await getTunnelStateManagerRuntime();
  return disableTailscale();
}
