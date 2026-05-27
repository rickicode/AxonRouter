// IMPORTANT: This must produce the same path as @axonrouter/data-dir's getDataDir()
// If you change the data directory logic, update both this file and packages/data-dir/src/index.js
const path = require("path");
const os = require("os");

function getDataDir() {
  if (process.platform === "win32") {
    const appdata = process.env.APPDATA;
    const roaming = path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appdata || roaming, "axonrouter");
  }
  return path.join(os.homedir(), ".axonrouter");
}

const DATA_DIR = getDataDir();
const MITM_DIR = path.join(DATA_DIR, "mitm");

module.exports = { DATA_DIR, MITM_DIR };
