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
export declare function configureTunnelDeps(deps: TunnelDeps): void;
export declare function getTunnelDeps(): TunnelDeps;
