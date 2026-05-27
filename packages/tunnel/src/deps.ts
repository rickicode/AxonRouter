export interface TunnelDeps {
  getCurrentSettings: () => Promise<any>;
  updateCurrentSettings: (updates: Record<string, unknown>) => Promise<any>;
  loadSingletonFromSqlite: (key: string) => any;
  upsertSingleton: (key: string, value: any) => void;
  sqliteWriteGate: <T>(fn: () => T) => T;
  getMitmCachedPassword: () => string | null | undefined;
  loadMitmEncryptedPassword: () => Promise<string | null | undefined>;
  mitmInitDbHooks: (getSettings: any, updateSettings: any) => void;
  execWithPasswordFromDns: (cmd: string, password: string) => Promise<string>;
  DEFAULT_AXONROUTER_PORT: number;
}

let _deps: TunnelDeps | null = null;

export function configureTunnelDeps(deps: TunnelDeps) {
  _deps = deps;
}

export function getDeps(): TunnelDeps {
  if (!_deps) throw new Error("Tunnel deps not configured. Ensure instrumentation.ts imports initializeApp before route handlers execute.");
  return _deps;
}
