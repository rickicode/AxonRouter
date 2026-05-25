import { loadTunnelStateSnapshot } from "./tunnelStateAccess";
import { getCurrentSettings } from "@/lib/settingsAccess";

function loadCloudflaredModule() {
  const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<typeof import("./cloudflared")>;
  return dynamicImport("./cloudflared");
}

export async function getTunnelStatusRuntime() {
  const state = loadTunnelStateSnapshot();
  const [cloudflared, settings] = await Promise.all([loadCloudflaredModule(), getCurrentSettings()]);
  const running = cloudflared.isCloudflaredRunning();
  const shortId = state?.shortId || "";
  const publicUrl = shortId ? `https://r${shortId}.axonrouter.com` : "";

  return {
    enabled: settings.tunnelEnabled === true && running,
    tunnelUrl: state?.tunnelUrl || "",
    shortId,
    publicUrl,
    running,
  };
}
