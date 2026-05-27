import fs from "node:fs/promises";
import { resolveDataPath } from "../../src/lib/dataDir";

const SEP = process.platform === "win32" ? "\\" : "/";

let _runtimeDir: string | undefined;
function getRuntimeDir() {
  return _runtimeDir ??= resolveDataPath("runtime");
}

let _heartbeatPath: string | undefined;
function getHeartbeatPath() {
  return _heartbeatPath ??= getRuntimeDir() + SEP + "mcp-heartbeat.json";
}
const HTTP_STATE_KEY = "__nineRouterMcpHttpState";

function getHttpState() {
  if (!globalThis[HTTP_STATE_KEY]) {
    globalThis[HTTP_STATE_KEY] = {
      online: false,
      transport: null,
      activeConnections: 0,
      lastActivityAt: null,
    };
  }
  return globalThis[HTTP_STATE_KEY];
}

export function resolveMcpHeartbeatPath() {
  return getHeartbeatPath();
}

export async function writeMcpHeartbeat(snapshot) {
  await fs.mkdir(getRuntimeDir(), { recursive: true });
  await fs.writeFile(getHeartbeatPath(), JSON.stringify(snapshot, null, 2), "utf8");
}

export async function readMcpHeartbeat() {
  try {
    const raw = await fs.readFile(getHeartbeatPath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isProcessAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isMcpHeartbeatOnline(snapshot, staleAfterMs = 15000) {
  if (!snapshot?.lastHeartbeatAt) return false;
  const age = Date.now() - new Date(snapshot.lastHeartbeatAt).getTime();
  if (!Number.isFinite(age) || age > staleAfterMs) return false;
  return isProcessAlive(snapshot.pid);
}

export function markHttpTransportActive(transport, delta = 0) {
  const state = getHttpState();
  state.online = true;
  state.transport = transport;
  state.activeConnections = Math.max(0, (state.activeConnections || 0) + delta);
  state.lastActivityAt = new Date().toISOString();
  return state;
}

export function getHttpTransportState() {
  return { ...getHttpState() };
}
