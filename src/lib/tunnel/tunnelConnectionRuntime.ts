import { DEFAULT_AXONROUTER_PORT } from "@/shared/constants/runtimeDefaults";
import crypto from "crypto";
import { loadTunnelStateSnapshot, resolveTunnelShortId, saveTunnelConnectionState } from "./tunnelStateAccess";
import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";
import * as cloudflared from "./cloudflared";

const WORKER_URL = process.env.TUNNEL_WORKER_URL || "https://axonrouter.com";
const MACHINE_ID_SALT = "axonrouter-tunnel-salt";
const RECONNECT_DELAYS_MS = [5000, 10000, 20000, 30000, 60000];
const MAX_RECONNECT_ATTEMPTS = RECONNECT_DELAYS_MS.length;
const RECONNECT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RECONNECTS_IN_WINDOW = 10;

let isReconnecting = false;
let exitHandlerRegistered = false;
let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
let manualDisabled = false;
let reconnectTimestamps: number[] = [];



export function isTunnelManuallyDisabled() {
  return manualDisabled;
}

export function isTunnelReconnecting() {
  return isReconnecting;
}

function getMachineId() {
  try {
    const { machineIdSync } = require("node-machine-id");
    const raw = machineIdSync();
    return crypto.createHash("sha256").update(raw + MACHINE_ID_SALT).digest("hex").substring(0, 16);
  } catch {
    return crypto.randomUUID().replace(/-/g, "").substring(0, 16);
  }
}

async function registerTunnelUrl(shortId: string, tunnelUrl: string) {
  await fetch(`${WORKER_URL}/api/tunnel/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shortId, tunnelUrl }),
  });
}

export async function enableTunnelRuntime(localPort = Number(DEFAULT_AXONROUTER_PORT)) {
  manualDisabled = false;

  const cloudflaredModule = cloudflared;

  if (cloudflaredModule.isCloudflaredRunning()) {
    const existing = loadTunnelStateSnapshot();
    if (existing?.tunnelUrl) {
      const publicUrl = `https://r${existing.shortId}.axonrouter.com`;
      return { success: true, tunnelUrl: existing.tunnelUrl, shortId: existing.shortId, publicUrl, alreadyRunning: true };
    }
  }

  cloudflaredModule.killCloudflared();

  const machineId = getMachineId();
  const existing = loadTunnelStateSnapshot();
  const shortId = existing?.shortId || resolveTunnelShortId();

  const onUrlUpdate = async (url: string) => {
    if (manualDisabled) return;
    await registerTunnelUrl(shortId, url);
    saveTunnelConnectionState({ shortId, machineId, tunnelUrl: url });
    await updateCurrentSettings({ tunnelEnabled: true, tunnelUrl: url });
  };

  const quickTunnelResult: any = await cloudflaredModule.spawnQuickTunnel(localPort, onUrlUpdate);
  const tunnelUrl = quickTunnelResult?.tunnelUrl || "";

  await registerTunnelUrl(shortId, tunnelUrl);
  saveTunnelConnectionState({ shortId, machineId, tunnelUrl });
  await updateCurrentSettings({ tunnelEnabled: true, tunnelUrl });

  if (!exitHandlerRegistered) {
    cloudflaredModule.setUnexpectedExitHandler(() => {
      if (!isReconnecting) scheduleReconnect(0);
    });
    // Kill cloudflared when parent process exits
    process.once("exit", () => { try { cloudflaredModule.killCloudflared(); } catch { /* ignore */ } });
    exitHandlerRegistered = true;
  }

  const publicUrl = `https://r${shortId}.axonrouter.com`;
  return { success: true, tunnelUrl, shortId, publicUrl };
}

async function scheduleReconnect(attempt: number) {
  if (isReconnecting || manualDisabled) return;

  // Sliding window: stop if too many reconnects in a short period
  const now = Date.now();
  reconnectTimestamps = reconnectTimestamps.filter(t => now - t < RECONNECT_WINDOW_MS);
  if (reconnectTimestamps.length >= MAX_RECONNECTS_IN_WINDOW) {
    console.log("[Tunnel] Too many reconnects in 5 minutes, disabling tunnel");
    await updateCurrentSettings({ tunnelEnabled: false });
    return;
  }
  reconnectTimestamps.push(now);

  isReconnecting = true;

  const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
  console.log(`[Tunnel] Reconnecting in ${delay / 1000}s (attempt ${attempt + 1})...`);

  await new Promise((r) => {
    reconnectTimeoutId = setTimeout(r, delay);
  });

  try {
    if (manualDisabled) {
      isReconnecting = false;
      return;
    }
    const settings: any = await getCurrentSettings();
    if (!settings.tunnelEnabled) {
      isReconnecting = false;
      return;
    }
    await enableTunnelRuntime();
    console.log("[Tunnel] Reconnected successfully");
    isReconnecting = false;
  } catch (err: any) {
    console.log(`[Tunnel] Reconnect attempt ${attempt + 1} failed:`, err.message);
    isReconnecting = false;
    const next = attempt + 1;
    if (next < MAX_RECONNECT_ATTEMPTS) scheduleReconnect(next);
    else {
      console.log("[Tunnel] All reconnect attempts exhausted, disabling tunnel");
      await updateCurrentSettings({ tunnelEnabled: false });
    }
  }
}

export async function disableTunnelRuntime() {
  manualDisabled = true;
  isReconnecting = true;
  if (reconnectTimeoutId) {
    clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
  }
  const cloudflaredModule = cloudflared;
  cloudflaredModule.setUnexpectedExitHandler(null);
  exitHandlerRegistered = false;

  cloudflaredModule.killCloudflared();

  const state = loadTunnelStateSnapshot();
  if (state) {
    saveTunnelConnectionState({ shortId: state.shortId, machineId: state.machineId, tunnelUrl: null });
  }

  await updateCurrentSettings({ tunnelEnabled: false, tunnelUrl: "" });
  isReconnecting = false;
  return { success: true };
}

export async function getTunnelStatusRuntime() {
  const state = loadTunnelStateSnapshot();
  const cloudflaredModule = cloudflared;
  const running = cloudflaredModule.isCloudflaredRunning();
  const settings: any = await getCurrentSettings();
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
