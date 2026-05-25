type TunnelManagerModule = Pick<
  typeof import("./tunnelManager"),
  "getTunnelStatus" | "getTailscaleStatus" | "enableTunnel" | "disableTunnel" | "enableTailscale" | "disableTailscale"
>;

let tunnelManagerPromise: Promise<TunnelManagerModule> | null = null;

export async function getTunnelStateManagerRuntime(): Promise<TunnelManagerModule> {
  if (!tunnelManagerPromise) {
    tunnelManagerPromise = import("./tunnelManager");
  }
  return tunnelManagerPromise;
}
