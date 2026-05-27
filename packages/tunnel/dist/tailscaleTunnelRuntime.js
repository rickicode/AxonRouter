import { loadTunnelStateSnapshot, resolveTunnelShortId } from "./state";
import { getTunnelDeps } from "./deps";
import { getTailscaleMitmHooks } from "./tailscaleMitmHooksRuntime";
const DEFAULT_AXONROUTER_PORT = "12711";
function resolveTailscaleHostname() {
    const existing = loadTunnelStateSnapshot();
    return existing?.shortId || resolveTunnelShortId();
}
async function loadTailscaleSudoPassword() {
    const { getCachedPassword, loadEncryptedPassword } = await getTailscaleMitmHooks();
    return getCachedPassword() || (await loadEncryptedPassword()) || "";
}
export async function enableTailscaleRuntime(localPort = Number(DEFAULT_AXONROUTER_PORT)) {
    const [funnelRuntime, tailscaleStatus, tailscaleDaemon, tailscaleLogin] = await Promise.all([
        import("./tailscaleFunnelRuntime"),
        import("./tailscaleStatus"),
        import("./tailscaleDaemonRuntime"),
        import("./tailscaleLogin"),
    ]);
    const { startFunnelRuntime, stopFunnelRuntime } = funnelRuntime;
    const { isTailscaleLoggedIn, isTailscaleRunning } = tailscaleStatus;
    const { startDaemonWithPassword } = tailscaleDaemon;
    const { startLogin } = tailscaleLogin;
    const sudoPass = await loadTailscaleSudoPassword();
    await startDaemonWithPassword(sudoPass);
    const tsHostname = resolveTailscaleHostname();
    let loggedIn = isTailscaleLoggedIn();
    if (!loggedIn) {
        const loginResult = (await startLogin(tsHostname));
        if (loginResult.authUrl) {
            return { success: false, needsLogin: true, authUrl: loginResult.authUrl };
        }
        loggedIn = isTailscaleLoggedIn();
    }
    stopFunnelRuntime();
    const result = (await startFunnelRuntime(localPort));
    if (result.funnelNotEnabled) {
        return { success: false, funnelNotEnabled: true, enableUrl: result.enableUrl };
    }
    const running = isTailscaleRunning();
    if (!loggedIn || !running) {
        stopFunnelRuntime();
        return { success: false, error: "Tailscale not connected. Device may have been removed. Please re-login." };
    }
    const { updateCurrentSettings } = getTunnelDeps();
    await updateCurrentSettings({ tailscaleEnabled: true, tailscaleUrl: result.tunnelUrl });
    return { success: true, tunnelUrl: result.tunnelUrl };
}
export async function disableTailscaleRuntime() {
    const { stopFunnelRuntime, stopDaemonRuntime } = await import("./tailscaleFunnelRuntime");
    stopFunnelRuntime();
    const sudoPass = await loadTailscaleSudoPassword();
    await stopDaemonRuntime(sudoPass);
    const { updateCurrentSettings } = getTunnelDeps();
    await updateCurrentSettings({ tailscaleEnabled: false, tailscaleUrl: "" });
    return { success: true };
}
