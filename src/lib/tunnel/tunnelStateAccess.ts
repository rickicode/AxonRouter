import { loadState, saveState, generateShortId } from "./state";

export function loadTunnelStateSnapshot() {
  return loadState();
}

export function resolveTunnelShortId() {
  return loadState()?.shortId || generateShortId();
}

export function saveTunnelConnectionState(state: {
  shortId: string;
  machineId: string;
  tunnelUrl: string | null;
}) {
  saveState(state);
}
