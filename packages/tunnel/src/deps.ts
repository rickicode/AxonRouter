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

const DEP_KEY = "__axonrouter_tunnel_deps";

function getDepsStore(): TunnelDeps | null {
  return (globalThis as any)[DEP_KEY] ?? null;
}

function setDepsStore(deps: TunnelDeps) {
  (globalThis as any)[DEP_KEY] = deps;
}

export function configureTunnelDeps(deps: TunnelDeps) {
  setDepsStore(deps);
}

export function getDeps(): TunnelDeps {
  const deps = getDepsStore();
  if (!deps) throw new Error("Tunnel deps not configured. Ensure instrumentation.ts imports initializeApp before route handlers execute.");
  return deps;
}

/**
 * Safe deps accessor for status-only reads.
 * Returns null if deps haven't been configured yet (cold start),
 * allowing callers to return graceful defaults instead of crashing.
 */
export function getDepsSafe(): TunnelDeps | null {
  return getDepsStore();
}
