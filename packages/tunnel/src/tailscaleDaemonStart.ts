import { startDaemonWithPassword } from "./tailscaleDaemonRuntime";
import { getTunnelDeps } from "./deps";

type MitmStatusFacadeModule = {
  loadEncryptedPassword?: () => Promise<string | null | undefined>;
  default?: {
    loadEncryptedPassword?: () => Promise<string | null | undefined>;
  };
};

async function loadMitmStatusFacade(): Promise<MitmStatusFacadeModule> {
  const { getMitmStatusFacade } = getTunnelDeps();
  return getMitmStatusFacade() as Promise<MitmStatusFacadeModule>;
}

export async function startTailscaleDaemonFromStoredPassword(sudoPassword?: string) {
  const mitmStatusFacade = await loadMitmStatusFacade();
  const loadEncryptedPassword =
    mitmStatusFacade.loadEncryptedPassword || mitmStatusFacade.default?.loadEncryptedPassword;

  const password = sudoPassword || globalThis.__mitmSudoPassword || (await loadEncryptedPassword?.()) || "";
  await startDaemonWithPassword(password);
}
