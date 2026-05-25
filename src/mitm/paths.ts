const path = require("path");
const os = require("os");

function getDataDir() {
  if (process.platform === "win32") {
    const appdata = /*turbopackIgnore: true*/ process.env.APPDATA;
    const roaming = /*turbopackIgnore: true*/ path.join(os.homedir(), "AppData", "Roaming");
    return /*turbopackIgnore: true*/ path.join(appdata || roaming, "axonrouter");
  }
  return /*turbopackIgnore: true*/ path.join(os.homedir(), ".axonrouter");
}

const DATA_DIR = /*turbopackIgnore: true*/ getDataDir();
const MITM_DIR = /*turbopackIgnore: true*/ path.join(DATA_DIR, "mitm");

module.exports = { DATA_DIR, MITM_DIR };
