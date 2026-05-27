import { getDeps } from "./deps";
import { loadPersistedShortId } from "./state";
import { generateShortId } from "./shortId";
import { installTailscaleRuntime } from "./tailscaleInstallRuntime";

export async function resolveTailscaleInstallPassword(sudoPassword?: string) {
  const { getMitmCachedPassword, loadMitmEncryptedPassword } = getDeps();
  return sudoPassword || getMitmCachedPassword() || (await loadMitmEncryptedPassword()) || "";
}

export async function resolveTailscaleInstallShortId() {
  const persistedShortId = loadPersistedShortId();
  if (persistedShortId) return persistedShortId;
  return generateShortId();
}

export async function installTailscaleWithRuntime(
  sudoPassword: string,
  onProgress: (message: string) => void
) {
  const shortId = await resolveTailscaleInstallShortId();
  return installTailscaleRuntime(sudoPassword, shortId, onProgress);
}
