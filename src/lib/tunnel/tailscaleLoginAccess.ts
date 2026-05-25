import { generateShortId } from "./shortId";
import { loadPersistedShortId } from "./shortIdState";
import { startLogin } from "./tailscaleLogin";

export async function startTailscaleLoginFlow() {
  const shortId = loadPersistedShortId() || generateShortId();
  return startLogin(shortId);
}
