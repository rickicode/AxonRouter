import { startDaemonWithPassword } from "./tailscaleDaemonRuntime";
import { getTunnelDeps } from "./deps";
async function loadMitmStatusFacade() {
    const { getMitmStatusFacade } = getTunnelDeps();
    return getMitmStatusFacade();
}
export async function startTailscaleDaemonFromStoredPassword(sudoPassword) {
    const mitmStatusFacade = await loadMitmStatusFacade();
    const loadEncryptedPassword = mitmStatusFacade.loadEncryptedPassword || mitmStatusFacade.default?.loadEncryptedPassword;
    const password = sudoPassword || globalThis.__mitmSudoPassword || (await loadEncryptedPassword?.()) || "";
    await startDaemonWithPassword(password);
}
