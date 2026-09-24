import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
function getMachineIdSync() {
  try {
    const pkg = require("node-machine-id");
    return pkg.machineIdSync || pkg;
  } catch {
    return () => crypto.randomUUID();
  }
}
const machineIdSync = getMachineIdSync();
import crypto from "node:crypto";

let cachedRawId = null;

function loadRawMachineId() {
  if (cachedRawId) return cachedRawId;
  try {
    cachedRawId = machineIdSync();
  } catch {
    cachedRawId = crypto.randomUUID();
  }
  return cachedRawId;
}

export async function getConsistentMachineId(salt = "endpoint-proxy-salt") {
  const rawId = loadRawMachineId();
  return crypto.createHash("sha256").update(rawId + salt).digest("hex").substring(0, 16);
}
