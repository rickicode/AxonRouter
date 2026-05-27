import { getDeps } from "./deps";

export async function getTailscaleStatusRuntime() {
  const { getCurrentSettings } = getDeps();
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
