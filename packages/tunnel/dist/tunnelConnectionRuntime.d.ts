export declare function isTunnelManuallyDisabled(): boolean;
export declare function isTunnelReconnecting(): boolean;
export declare function enableTunnelRuntime(localPort?: number): Promise<{
    success: boolean;
    tunnelUrl: any;
    shortId: any;
    publicUrl: string;
    alreadyRunning: boolean;
} | {
    success: boolean;
    tunnelUrl: any;
    shortId: any;
    publicUrl: string;
    alreadyRunning?: undefined;
}>;
export declare function disableTunnelRuntime(): Promise<{
    success: boolean;
}>;
export declare function getTunnelStatusRuntime(): Promise<{
    enabled: boolean;
    tunnelUrl: any;
    shortId: any;
    publicUrl: string;
    running: boolean;
}>;
