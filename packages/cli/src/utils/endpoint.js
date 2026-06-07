import { color, COLORS } from "./display.js";
import * as api from "../api/client.js";

export async function getEndpoint(port) {
  try {
    const tunnelStatus = await api.getTunnelStatus();
    if (tunnelStatus?.enabled && tunnelStatus?.publicUrl) {
      return { url: `${tunnelStatus.publicUrl}/v1`, tunnelEnabled: true, publicUrl: tunnelStatus.publicUrl };
    }
  } catch { /* ignore */ }
  return { url: `http://localhost:${port}/v1`, tunnelEnabled: false, publicUrl: null };
}

export function getEndpointColored(endpoint) {
  if (endpoint.tunnelEnabled) {
    return color(endpoint.publicUrl || endpoint.url, COLORS.success);
  }
  return color(`http://localhost:${endpoint.url.match(/:(\d+)/)?.[1] || "?"}`, COLORS.cyan);
}
