import { getDeps } from "./deps";
import { startDaemonWithPassword } from "./tailscaleDaemonRuntime";

export async function startTailscaleDaemonFromStoredPassword(sudoPassword?: string) {
  const { getMitmCachedPassword, loadMitmEncryptedPassword } = getDeps();
  const password = sudoPassword || getMitmCachedPassword() || (await loadMitmEncryptedPassword()) || "";
  await startDaemonWithPassword(password);
}
