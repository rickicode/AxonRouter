import { getTunnelDeps } from "./deps";
export async function getTailscaleStatusRuntime() {
    const { getCurrentSettings } = getTunnelDeps();
    const [{ isTailscaleRunning }, settings] = await Promise.all([
        import("./tailscaleStatus"),
        getCurrentSettings(),
    ]);
    const running = isTailscaleRunning();
    return {
        enabled: settings.tailscaleEnabled === true && running,
        tunnelUrl: settings.tailscaleUrl || "",
        running,
    };
}
