export type TunnelDeps = {
  getCurrentSettings: () => Promise<any>;
  updateCurrentSettings: (updates: Record<string, unknown>) => Promise<any>;
  loadSingletonFromSqlite: (key: string) => any;
  upsertSingleton: (key: string, value: any) => void;
  sqliteWriteGate: <T>(fn: () => T) => T;
  execWithPassword: (cmd: string, pwd: string) => Promise<string>;
  getMitmStatusFacade: () => Promise<any>;
  defaultPort?: string;
};

let _deps: TunnelDeps | null = null;

export function configureTunnelDeps(deps: TunnelDeps) {
  _deps = deps;
}

export function getTunnelDeps(): TunnelDeps {
  if (!_deps) throw new Error("Tunnel deps not configured. Call configureTunnelDeps() first.");
  return _deps;
}
