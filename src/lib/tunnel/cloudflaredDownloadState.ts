export type CloudflaredDownloadState = {
  downloading: boolean;
  progress: number;
};

const dlState: CloudflaredDownloadState = {
  downloading: false,
  progress: 0,
};

export function getCloudflaredDownloadStatus(): CloudflaredDownloadState {
  return {
    downloading: dlState.downloading,
    progress: dlState.progress,
  };
}

export function setCloudflaredDownloadStatus(next: Partial<CloudflaredDownloadState>) {
  if (typeof next.downloading === "boolean") {
    dlState.downloading = next.downloading;
  }
  if (typeof next.progress === "number") {
    dlState.progress = next.progress;
  }
}
