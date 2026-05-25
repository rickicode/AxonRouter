import { startFunnelRuntime, stopDaemonRuntime, stopFunnelRuntime } from "./tailscaleFunnelRuntime";
import { tailscaleRuntimeFacade } from "./tailscaleRuntimeFacade";

const {
  getTailscaleFunnelUrl,
  isTailscaleDaemonRunning,
  isTailscaleInstalled,
  isTailscaleLoggedIn,
  isTailscaleRunning,
  startDaemonWithPassword,
  startLogin,
  installTailscaleRuntime,
} = tailscaleRuntimeFacade;

export {
  getTailscaleFunnelUrl,
  isTailscaleDaemonRunning,
  isTailscaleInstalled,
  isTailscaleLoggedIn,
  isTailscaleRunning,
  startDaemonWithPassword,
  startLogin,
};

/** Install tailscale with a dedicated install-only runtime seam. */
export async function installTailscale(sudoPassword, hostname, onProgress) {
  return installTailscaleRuntime(sudoPassword, hostname, onProgress);
}

/** Start tailscale funnel for the given port */
export async function startFunnel(port) {
  return startFunnelRuntime(port);
}

/** Stop tailscale funnel */
export function stopFunnel() {
  return stopFunnelRuntime();
}

/** Kill tailscaled daemon (runs as root, needs sudo) */
export async function stopDaemon(sudoPassword) {
  return stopDaemonRuntime(sudoPassword);
}
