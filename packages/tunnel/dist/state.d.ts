import { generateShortId } from "./shortId";
export declare function loadState(): any;
export declare function loadPersistedShortId(): any;
export declare function saveState(state: any): void;
export declare function clearState(): void;
export declare function savePid(pid: any): void;
export declare function loadPid(): any;
export declare function clearPid(): void;
export declare function saveTailscalePid(pid: any): void;
export declare function loadTailscalePid(): any;
export declare function clearTailscalePid(): void;
export { generateShortId };
export declare function loadTunnelStateSnapshot(): any;
export declare function resolveTunnelShortId(): any;
export declare function saveTunnelConnectionState(state: {
    shortId: string;
    machineId: string;
    tunnelUrl: string | null;
}): void;
