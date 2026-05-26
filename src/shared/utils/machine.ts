import { getConsistentMachineId } from "./machineId";

/**
 * Get machine ID using hostname-based derivation
 */
export async function getMachineId(): Promise<string> {
  return await getConsistentMachineId();
}
