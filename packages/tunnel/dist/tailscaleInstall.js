import { getTunnelDeps } from "./deps";
async function loadMitmStatusFacade() {
    const { getMitmStatusFacade } = getTunnelDeps();
    const mod = (await getMitmStatusFacade());
    return mod.default || mod;
}
async function loadTailscaleInstall() {
    return import("./tailscaleInstallRuntime");
}
async function loadTunnelState() {
    return import("./state");
}
async function loadTunnelShortId() {
    return import("./shortId");
}
export async function resolveTailscaleInstallPassword(sudoPassword) {
    const { getCachedPassword, loadEncryptedPassword } = await loadMitmStatusFacade();
    return sudoPassword || getCachedPassword() || (await loadEncryptedPassword()) || "";
}
export async function resolveTailscaleInstallShortId() {
    const { loadPersistedShortId } = await loadTunnelState();
    const persistedShortId = loadPersistedShortId();
    if (persistedShortId)
        return persistedShortId;
    const { generateShortId } = await loadTunnelShortId();
    return generateShortId();
}
export async function installTailscaleWithRuntime(sudoPassword, onProgress) {
    const { installTailscaleRuntime } = await loadTailscaleInstall();
    const shortId = await resolveTailscaleInstallShortId();
    return installTailscaleRuntime(sudoPassword, shortId, onProgress);
}
