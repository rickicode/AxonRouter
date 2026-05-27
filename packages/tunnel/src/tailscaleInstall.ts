import { getTunnelDeps } from "./deps";

type StatusFacadeModule = {
  getCachedPassword: () => string | null | undefined;
  loadEncryptedPassword: () => Promise<string | null | undefined>;
};

type TailscaleInstallExports = Pick<typeof import("./tailscaleInstallRuntime"), "installTailscaleRuntime">;
type TunnelStateExports = Pick<typeof import("./state"), "loadPersistedShortId">;
type TunnelShortIdExports = Pick<typeof import("./shortId"), "generateShortId">;

async function loadMitmStatusFacade(): Promise<StatusFacadeModule> {
  const { getMitmStatusFacade } = getTunnelDeps();
  const mod = (await getMitmStatusFacade()) as unknown as StatusFacadeModule & {
    default?: StatusFacadeModule;
  };
  return mod.default || mod;
}

async function loadTailscaleInstall(): Promise<TailscaleInstallExports> {
  return import("./tailscaleInstallRuntime");
}

async function loadTunnelState(): Promise<TunnelStateExports> {
  return import("./state");
}

async function loadTunnelShortId(): Promise<TunnelShortIdExports> {
  return import("./shortId");
}

export async function resolveTailscaleInstallPassword(sudoPassword?: string) {
  const { getCachedPassword, loadEncryptedPassword } = await loadMitmStatusFacade();
  return sudoPassword || getCachedPassword() || (await loadEncryptedPassword()) || "";
}

export async function resolveTailscaleInstallShortId() {
  const { loadPersistedShortId } = await loadTunnelState();
  const persistedShortId = loadPersistedShortId();
  if (persistedShortId) return persistedShortId;

  const { generateShortId } = await loadTunnelShortId();
  return generateShortId();
}

export async function installTailscaleWithRuntime(
  sudoPassword: string,
  onProgress: (message: string) => void
) {
  const { installTailscaleRuntime } = await loadTailscaleInstall();
  const shortId = await resolveTailscaleInstallShortId();
  return installTailscaleRuntime(sudoPassword, shortId, onProgress);
}
