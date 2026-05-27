export declare function getDownloadStatus(): import("./cloudflaredDownloadState").CloudflaredDownloadState;
export declare function ensureCloudflared(): Promise<any>;
export declare function __test_buildCloudflaredExitError(code: any, stderrText?: string): Error;
/** Register a callback to be called when cloudflared exits unexpectedly after connecting */
export declare function setUnexpectedExitHandler(handler: any): void;
export declare function spawnCloudflared(tunnelToken: any): Promise<unknown>;
/**
 * Spawn cloudflared quick tunnel (no account needed)
 * Returns the generated trycloudflare.com URL
 */
export declare function spawnQuickTunnel(localPort: any, onUrlUpdate: any): Promise<unknown>;
export declare function killCloudflared(): void;
export declare function isCloudflaredRunning(): boolean;
