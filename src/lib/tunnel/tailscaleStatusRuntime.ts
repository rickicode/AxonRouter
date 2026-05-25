import { getCurrentSettings } from "@/lib/settingsAccess";

export async function getTailscaleStatusRuntime() {
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
