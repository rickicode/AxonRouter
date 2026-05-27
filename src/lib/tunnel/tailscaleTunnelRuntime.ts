import { DEFAULT_AXONROUTER_PORT } from "@/shared/constants/runtimeDefaults";
import { loadTunnelStateSnapshot, resolveTunnelShortId } from "./state";
import { updateCurrentSettings } from "@/lib/settingsAccess";
import { getTailscaleMitmHooks } from "./tailscaleMitmHooksRuntime";

type TailscaleLoginResult = {
  authUrl?: string;
  alreadyLoggedIn?: boolean;
};

type TailscaleFunnelResult = {
  tunnelUrl?: string;
  funnelNotEnabled?: boolean;
  enableUrl?: string;
};

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
    const loginResult = (await startLogin(tsHostname)) as TailscaleLoginResult;
    if (loginResult.authUrl) {
      return { success: false, needsLogin: true, authUrl: loginResult.authUrl };
    }
    loggedIn = isTailscaleLoggedIn();
  }

  stopFunnelRuntime();
  const result = (await startFunnelRuntime(localPort)) as TailscaleFunnelResult;

  if (result.funnelNotEnabled) {
    return { success: false, funnelNotEnabled: true, enableUrl: result.enableUrl };
  }

  const running = isTailscaleRunning();
  if (!loggedIn || !running) {
    stopFunnelRuntime();
    return { success: false, error: "Tailscale not connected. Device may have been removed. Please re-login." };
  }

  await updateCurrentSettings({ tailscaleEnabled: true, tailscaleUrl: result.tunnelUrl });
  return { success: true, tunnelUrl: result.tunnelUrl };
}

export async function disableTailscaleRuntime() {
  const { stopFunnelRuntime, stopDaemonRuntime } = await import("./tailscaleFunnelRuntime");
  stopFunnelRuntime();
  const sudoPass = await loadTailscaleSudoPassword();
  await stopDaemonRuntime(sudoPass);
  await updateCurrentSettings({ tailscaleEnabled: false, tailscaleUrl: "" });
  return { success: true };
}

