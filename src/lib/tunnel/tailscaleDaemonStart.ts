import { startDaemonWithPassword } from "./tailscaleDaemonRuntime";

type MitmStatusFacadeModule = {
  loadEncryptedPassword?: () => Promise<string | null | undefined>;
  default?: {
    loadEncryptedPassword?: () => Promise<string | null | undefined>;
  };
};

async function loadMitmStatusFacade(): Promise<MitmStatusFacadeModule> {
  return (await import("@/mitm/statusFacade")) as MitmStatusFacadeModule;
}

export async function startTailscaleDaemonFromStoredPassword(sudoPassword?: string) {
  const mitmStatusFacade = await loadMitmStatusFacade();
  const loadEncryptedPassword =
    mitmStatusFacade.loadEncryptedPassword || mitmStatusFacade.default?.loadEncryptedPassword;

  const password = sudoPassword || globalThis.__mitmSudoPassword || (await loadEncryptedPassword?.()) || "";
  await startDaemonWithPassword(password);
}
