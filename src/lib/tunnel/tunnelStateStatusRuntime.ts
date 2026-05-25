type TunnelStatusManagerModule = Pick<
  typeof import("./tunnelStatusManager"),
  "getTunnelStatus" | "getTailscaleStatus"
>;

let tunnelStatusManagerPromise: Promise<TunnelStatusManagerModule> | null = null;

export async function getTunnelStateStatusRuntime(): Promise<TunnelStatusManagerModule> {
  if (!tunnelStatusManagerPromise) {
    tunnelStatusManagerPromise = import("./tunnelStatusManager");
  }
  return tunnelStatusManagerPromise;
}

export async function getTunnelStatusPayloadRuntime(download: unknown = undefined) {
  const { getTunnelStatus, getTailscaleStatus } = await getTunnelStateStatusRuntime();
  const [tunnel, tailscale] = await Promise.all([getTunnelStatus(), getTailscaleStatus()]);
  return { tunnel, tailscale, download };
}
