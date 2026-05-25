import { getTunnelStatusRuntime } from "./tunnelConnectionStatusRuntime";
import { getTailscaleStatusRuntime } from "./tailscaleStatusRuntime";

export async function getTunnelStatus() {
  return getTunnelStatusRuntime();
}

export async function getTailscaleStatus() {
  return getTailscaleStatusRuntime();
}
