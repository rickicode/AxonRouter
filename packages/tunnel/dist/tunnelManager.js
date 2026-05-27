import { getTunnelDeps } from "./deps";
// Inlined from src/shared/constants/runtimeDefaults.json -- keep in sync
function getDefaultPort() {
    try {
        return getTunnelDeps().defaultPort || "12711";
    }
    catch {
        return "12711";
    }
}
export async function enableTunnel(localPort) {
    localPort = localPort ?? Number(getDefaultPort());
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
let tunnelConnectionRuntimePromise = null;
function loadTunnelConnectionRuntime() {
    if (!tunnelConnectionRuntimePromise) {
        tunnelConnectionRuntimePromise = import("./tunnelConnectionRuntime");
    }
    return tunnelConnectionRuntimePromise;
}
let cachedTunnelFlags = null;
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
export async function enableTailscale(localPort) {
    localPort = localPort ?? Number(getDefaultPort());
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
