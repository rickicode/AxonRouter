const DEFAULT_AXONROUTER_PORT = "12711";

export async function enableTunnel(localPort = Number(DEFAULT_AXONROUTER_PORT)) {
  const { enableTunnelRuntime } = await import("./tunnelConnectionRuntime");
  return enableTunnelRuntime(localPort);
}

export async function disableTunnel() {
  const { disableTunnelRuntime } = await import("./tunnelConnectionRuntime");
  return disableTunnelRuntime();
}

export async function getTunnelStatus() {
  const { getTunnelStatusRuntime } = await import("./tunnelConnectionRuntime");
  return getTunnelStatusRuntime();
}

let tunnelConnectionRuntimePromise: Promise<typeof import("./tunnelConnectionRuntime")> | null = null;

function loadTunnelConnectionRuntime() {
  if (!tunnelConnectionRuntimePromise) {
    tunnelConnectionRuntimePromise = import("./tunnelConnectionRuntime");
  }
  return tunnelConnectionRuntimePromise;
}

let cachedTunnelFlags: Pick<typeof import("./tunnelConnectionRuntime"), "isTunnelManuallyDisabled" | "isTunnelReconnecting"> | null = null;

void loadTunnelConnectionRuntime().then((mod) => {
  cachedTunnelFlags = {
    isTunnelManuallyDisabled: mod.isTunnelManuallyDisabled,
    isTunnelReconnecting: mod.isTunnelReconnecting,
  };
});

export function isTunnelManuallyDisabled() {
  return cachedTunnelFlags?.isTunnelManuallyDisabled() ?? false;
}

export function isTunnelReconnecting() {
  return cachedTunnelFlags?.isTunnelReconnecting() ?? false;
}

// Tailscale Funnel

export async function enableTailscale(localPort = Number(DEFAULT_AXONROUTER_PORT)) {
  const { enableTailscaleRuntime } = await import("./tailscaleTunnelRuntime");
  return enableTailscaleRuntime(localPort);
}

export async function disableTailscale() {
  const { disableTailscaleRuntime } = await import("./tailscaleTunnelRuntime");
  return disableTailscaleRuntime();
}

export async function getTailscaleStatus() {
  const { getTailscaleStatusRuntime } = await import("./tailscaleStatusRuntime");
  return getTailscaleStatusRuntime();
}
