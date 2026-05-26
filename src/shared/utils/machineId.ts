import { createHash } from "node:crypto";
import { hostname } from "node:os";

const MACHINE_SALT = "axonrouter-machine-id-salt";

function getRawMachineIdSync(): string {
  try {
    // Use hostname as base identifier - stable across reboots
    return createHash("sha256")
      .update(hostname() + MACHINE_SALT)
      .digest("hex");
  } catch {
    return "fallback-" + Date.now().toString(36);
  }
}

/**
 * Get consistent machine ID - ESM compatible, no external dependencies.
 * Returns a 16-char hex string derived from hostname + salt.
 */
export async function getConsistentMachineId(salt: string | null = null): Promise<string> {
  const saltValue = salt || MACHINE_SALT;
  try {
    const rawId = getRawMachineIdSync();
    const hashed = createHash("sha256").update(rawId + saltValue).digest("hex");
    return hashed.substring(0, 16);
  } catch {
    // Ultimate fallback
    const fallback = createHash("sha256")
      .update(`${Date.now()}-${Math.random()}`)
      .digest("hex");
    return fallback.substring(0, 16);
  }
}

/**
 * Get raw machine ID without extra hashing (for debugging)
 */
export async function getRawMachineId(): Promise<string> {
  return getRawMachineIdSync();
}
