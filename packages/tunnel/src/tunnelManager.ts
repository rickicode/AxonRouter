import { getDeps } from "./deps";
import { enableTunnelRuntime, disableTunnelRuntime, getTunnelStatusRuntime, isTunnelManuallyDisabled as _isTunnelManuallyDisabled, isTunnelReconnecting as _isTunnelReconnecting } from "./tunnelConnectionRuntime";
import { enableTailscaleRuntime, disableTailscaleRuntime } from "./tailscaleTunnelRuntime";
import { getTailscaleStatusRuntime } from "./tailscaleStatusRuntime";

export async function enableTunnel(localPort?: number) {
  const { DEFAULT_AXONROUTER_PORT } = getDeps();
  return enableTunnelRuntime(localPort ?? DEFAULT_AXONROUTER_PORT);
}

export async function disableTunnel() {
  return disableTunnelRuntime();
}

export async function getTunnelStatus() {
  return getTunnelStatusRuntime();
}

export function isTunnelManuallyDisabled() {
  return _isTunnelManuallyDisabled();
}

export function isTunnelReconnecting() {
  return _isTunnelReconnecting();
}

// Tailscale Funnel

export async function enableTailscale(localPort?: number) {
  const { DEFAULT_AXONROUTER_PORT } = getDeps();
  return enableTailscaleRuntime(localPort ?? DEFAULT_AXONROUTER_PORT);
}

export async function disableTailscale() {
  return disableTailscaleRuntime();
}

export async function getTailscaleStatus() {
  return getTailscaleStatusRuntime();
}
