import type { CloudflaredDownloadState } from "./cloudflaredDownloadState";
export declare function getTunnelStatusPayload(download?: CloudflaredDownloadState): Promise<{
    tunnel: {
        enabled: boolean;
        tunnelUrl: any;
        shortId: any;
        publicUrl: string;
        running: boolean;
    };
    tailscale: {
        enabled: boolean;
        tunnelUrl: any;
        running: boolean;
    };
    download: CloudflaredDownloadState;
}>;
