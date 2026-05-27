export async function getTunnelStatusPayload(download) {
    const [{ getTunnelStatusRuntime }, { getTailscaleStatusRuntime }] = await Promise.all([
        import("./tunnelConnectionRuntime"),
        import("./tailscaleStatusRuntime"),
    ]);
    const [tunnel, tailscale] = await Promise.all([getTunnelStatusRuntime(), getTailscaleStatusRuntime()]);
    return { tunnel, tailscale, download };
}
