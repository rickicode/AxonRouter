import { getTailscaleFunnelUrl, isTailscaleDaemonRunning, isTailscaleInstalled, isTailscaleLoggedIn, isTailscaleRunning } from "./tailscaleStatus";
import { startLogin } from "./tailscaleLogin";
import { startDaemonWithPassword } from "./tailscaleDaemonRuntime";
import { installTailscaleRuntime } from "./tailscaleInstallRuntime";

type TailscaleRuntimeApi = {
  getTailscaleFunnelUrl: typeof getTailscaleFunnelUrl;
  isTailscaleDaemonRunning: typeof isTailscaleDaemonRunning;
  isTailscaleInstalled: typeof isTailscaleInstalled;
  isTailscaleLoggedIn: typeof isTailscaleLoggedIn;
  isTailscaleRunning: typeof isTailscaleRunning;
  startDaemonWithPassword: typeof startDaemonWithPassword;
  startLogin: typeof startLogin;
  installTailscaleRuntime: typeof installTailscaleRuntime;
};

export const tailscaleRuntimeFacade: TailscaleRuntimeApi = {
  getTailscaleFunnelUrl,
  isTailscaleDaemonRunning,
  isTailscaleInstalled,
  isTailscaleLoggedIn,
  isTailscaleRunning,
  startDaemonWithPassword,
  startLogin,
  installTailscaleRuntime,
};
