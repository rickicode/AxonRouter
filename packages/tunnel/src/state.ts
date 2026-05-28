import { getDeps, getDepsSafe } from "./deps";
import { generateShortId } from "./shortId";

function loadTunnelState() {
  const deps = getDepsSafe();
  if (!deps) return {};
  return deps.loadSingletonFromSqlite("tunnelState") || {};
}

function saveTunnelState(next) {
  const { sqliteWriteGate, upsertSingleton } = getDeps();
  sqliteWriteGate(() => upsertSingleton("tunnelState", next));
}

export function loadState() {
  return loadTunnelState().state || null;
}

export function loadPersistedShortId() {
  return loadTunnelState().state?.shortId ?? null;
}

export function saveState(state) {
  saveTunnelState({ ...loadTunnelState(), state });
}

export function clearState() {
  const next = { ...loadTunnelState() };
  delete next.state;
  saveTunnelState(next);
}

// Cloudflare-specific PID
export function savePid(pid) {
  saveTunnelState({ ...loadTunnelState(), cloudflaredPid: Number(pid) });
}

export function loadPid() {
  return loadTunnelState().cloudflaredPid ?? null;
}

export function clearPid() {
  const next = { ...loadTunnelState() };
  delete next.cloudflaredPid;
  saveTunnelState(next);
}

// Tailscale-specific PID
export function saveTailscalePid(pid) {
  saveTunnelState({ ...loadTunnelState(), tailscalePid: Number(pid) });
}

export function loadTailscalePid() {
  return loadTunnelState().tailscalePid ?? null;
}

export function clearTailscalePid() {
  const next = { ...loadTunnelState() };
  delete next.tailscalePid;
  saveTunnelState(next);
}

export { generateShortId };
