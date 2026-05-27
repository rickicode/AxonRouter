// Dependency injection
export { configureTunnelDeps } from "./deps";

// Tunnel manager (main entry point)
export {
  enableTunnel,
  disableTunnel,
  getTunnelStatus,
  isTunnelManuallyDisabled,
  isTunnelReconnecting,
  enableTailscale,
  disableTailscale,
  getTailscaleStatus,
} from "./tunnelManager";

// Cloudflared
export {
  ensureCloudflared,
  killCloudflared,
  isCloudflaredRunning,
  spawnCloudflared,
  spawnQuickTunnel,
  getDownloadStatus,
  setUnexpectedExitHandler,
} from "./cloudflared";

// State
export {
  loadState,
  saveState,
  clearState,
  loadPersistedShortId,
  savePid,
  loadPid,
  clearPid,
  generateShortId,
  saveTailscalePid,
  loadTailscalePid,
  clearTailscalePid,
} from "./state";

// Tunnel state access
export {
  loadTunnelStateSnapshot,
  resolveTunnelShortId,
  saveTunnelConnectionState,
} from "./tunnelStateAccess";

// Connection runtime
export {
  enableTunnelRuntime,
  disableTunnelRuntime,
  getTunnelStatusRuntime,
} from "./tunnelConnectionRuntime";

// Tailscale tunnel runtime
export {
  enableTailscaleRuntime,
  disableTailscaleRuntime,
} from "./tailscaleTunnelRuntime";

// Tailscale status runtime
export { getTailscaleStatusRuntime } from "./tailscaleStatusRuntime";

// Tailscale status
export {
  isTailscaleInstalled,
  isTailscaleLoggedIn,
  isTailscaleRunning,
  isTailscaleDaemonRunning,
  getTailscaleFunnelUrl,
} from "./tailscaleStatus";

// Tailscale check access
export { getTailscaleCheckPayload } from "./tailscaleCheckAccess";

// Tailscale install access
export { createTailscaleInstallStream } from "./tailscaleInstallAccess";

// Tailscale login
export { startLogin as startTailscaleLogin } from "./tailscaleLogin";

// Tailscale daemon start
export { startTailscaleDaemonFromStoredPassword } from "./tailscaleDaemonStart";

// Tailscale daemon runtime
export { startDaemonWithPassword, getTailscaleBin, getTailscaleSocketArgs } from "./tailscaleDaemonRuntime";

// Cloudflared download state
export { getCloudflaredDownloadStatus, setCloudflaredDownloadStatus } from "./cloudflaredDownloadState";
