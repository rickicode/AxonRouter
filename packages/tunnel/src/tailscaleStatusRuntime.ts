import { getDepsSafe } from "./deps";

export async function getTailscaleStatusRuntime() {
  const deps = getDepsSafe();
  if (!deps) {
    return { enabled: false, tunnelUrl: "", running: false };
  }
  const { getCurrentSettings } = deps;
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
