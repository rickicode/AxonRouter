import { DEFAULT_AXONROUTER_PORT } from "@/shared/constants/runtimeDefaults";
import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";

import { getTunnelStateManagerRuntime } from "./tunnelStateManagerRuntime";

export async function getTunnelStatusPayloadWithDownload(download: unknown) {
  const { getTunnelStatus, getTailscaleStatus } = await getTunnelStateManagerRuntime();
  const [tunnel, tailscale] = await Promise.all([getTunnelStatus(), getTailscaleStatus()]);
  return { tunnel, tailscale, download };
}

export async function enableTunnelAndPersist(localPort = Number(DEFAULT_AXONROUTER_PORT)) {
  const { enableTunnel } = await getTunnelStateManagerRuntime();
  return enableTunnel(localPort);
}

export async function disableTunnelAndPersist() {
  const { disableTunnel } = await getTunnelStateManagerRuntime();
  return disableTunnel();
}

export async function enableTailscaleAndPersist(localPort = Number(DEFAULT_AXONROUTER_PORT)) {
  const { enableTailscale } = await getTunnelStateManagerRuntime();
  return enableTailscale(localPort);
}

export async function disableTailscaleAndPersist() {
  const { disableTailscale } = await getTunnelStateManagerRuntime();
  return disableTailscale();
}

export { getCurrentSettings, updateCurrentSettings };
