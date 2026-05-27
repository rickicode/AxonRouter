import type { CloudflaredDownloadState } from "./cloudflaredDownloadState";

export async function getTunnelStatusPayload(download?: CloudflaredDownloadState) {
  const [{ getTunnelStatusRuntime }, { getTailscaleStatusRuntime }] = await Promise.all([
    import("./tunnelConnectionRuntime"),
    import("./tailscaleStatusRuntime"),
  ]);
  const [tunnel, tailscale] = await Promise.all([getTunnelStatusRuntime(), getTailscaleStatusRuntime()]);
  return { tunnel, tailscale, download };
}
