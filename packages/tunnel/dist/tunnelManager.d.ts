export declare function enableTunnel(localPort?: number): Promise<{
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
export declare function disableTunnel(): Promise<{
    success: boolean;
}>;
export declare function getTunnelStatus(): Promise<{
    enabled: boolean;
    tunnelUrl: any;
    shortId: any;
    publicUrl: string;
    running: boolean;
}>;
export declare function isTunnelManuallyDisabled(): boolean;
export declare function isTunnelReconnecting(): boolean;
export declare function enableTailscale(localPort?: number): Promise<{
    success: boolean;
    needsLogin: boolean;
    authUrl: string;
    funnelNotEnabled?: undefined;
    enableUrl?: undefined;
    error?: undefined;
    tunnelUrl?: undefined;
} | {
    success: boolean;
    funnelNotEnabled: boolean;
    enableUrl: string;
    needsLogin?: undefined;
    authUrl?: undefined;
    error?: undefined;
    tunnelUrl?: undefined;
} | {
    success: boolean;
    error: string;
    needsLogin?: undefined;
    authUrl?: undefined;
    funnelNotEnabled?: undefined;
    enableUrl?: undefined;
    tunnelUrl?: undefined;
} | {
    success: boolean;
    tunnelUrl: string;
    needsLogin?: undefined;
    authUrl?: undefined;
    funnelNotEnabled?: undefined;
    enableUrl?: undefined;
    error?: undefined;
}>;
export declare function disableTailscale(): Promise<{
    success: boolean;
}>;
export declare function getTailscaleStatus(): Promise<{
    enabled: boolean;
    tunnelUrl: any;
    running: boolean;
}>;
