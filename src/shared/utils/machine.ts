import crypto from "node:crypto";
import os from "node:os";

const MACHINE_SALT = "axonrouter-machine-id-salt";

let cachedId: string | null = null;

function computeRawMachineId(): string {
  try {
    const raw = `${os.hostname()}:${os.userInfo().username}:${os.platform()}`;
    return crypto.createHash("sha256").update(raw).digest("hex");
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

export function getMachineId(): string {
  if (!cachedId) {
    cachedId = computeRawMachineId();
  }
  return cachedId;
}

export async function getConsistentMachineId(salt: string | null = null): Promise<string> {
  const saltValue = salt || MACHINE_SALT;
  const raw = getMachineId();
  return crypto.createHash("sha256").update(raw + saltValue).digest("hex");
}
