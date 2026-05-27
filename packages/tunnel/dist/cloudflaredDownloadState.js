const dlState = {
    downloading: false,
    progress: 0,
};
export function getCloudflaredDownloadStatus() {
    return {
        downloading: dlState.downloading,
        progress: dlState.progress,
    };
}
export function setCloudflaredDownloadStatus(next) {
    if (typeof next.downloading === "boolean") {
        dlState.downloading = next.downloading;
    }
    if (typeof next.progress === "number") {
        dlState.progress = next.progress;
    }
}
