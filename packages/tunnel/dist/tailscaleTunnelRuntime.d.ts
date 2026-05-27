export declare function enableTailscaleRuntime(localPort?: number): Promise<{
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
export declare function disableTailscaleRuntime(): Promise<{
    success: boolean;
}>;
