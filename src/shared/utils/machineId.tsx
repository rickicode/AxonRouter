const machineIdModule = require('node-machine-id');
const machineIdSync: () => string = machineIdModule.machineIdSync || machineIdModule;

const MACHINE_SALT = 'axonrouter-machine-id-salt';

function getMachineId(): string {
  try {
    return machineIdSync();
  } catch {
    const { createHash } = require('crypto');
    const { hostname } = require('os');
    return createHash('sha256')
      .update(hostname() + MACHINE_SALT)
      .digest('hex');
  }
}

/**
 * Get consistent machine ID using node-machine-id with salt
 */
export async function getConsistentMachineId(salt: string | null = null) {
  const saltValue = salt || MACHINE_SALT;
  try {
    const rawMachineId = getMachineId();
    const crypto = await import('crypto');
    const hashedMachineId = crypto.createHash('sha256').update(rawMachineId + saltValue).digest('hex');
    return hashedMachineId.substring(0, 16);
  } catch (error) {
    console.log('Error getting machine ID:', error);
    return crypto.randomUUID ? crypto.randomUUID() :
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
  }
}

/**
 * Get raw machine ID without hashing (for debugging purposes)
 */
export async function getRawMachineId() {
  try {
    return getMachineId();
  } catch (error) {
    console.log('Error getting raw machine ID:', error);
    return crypto.randomUUID ? crypto.randomUUID() :
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
  }
}

/**
 * Check if we're running in browser or server environment
 */
export function isBrowser() {
  return typeof window !== 'undefined';
}
