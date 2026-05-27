export type CloudflaredDownloadState = {
    downloading: boolean;
    progress: number;
};
export declare function getCloudflaredDownloadStatus(): CloudflaredDownloadState;
export declare function setCloudflaredDownloadStatus(next: Partial<CloudflaredDownloadState>): void;
