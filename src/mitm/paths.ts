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

let _dataDir;
let _mitmDir;

function getDataDirLazy() {
  return _dataDir ??= getDataDir();
}

function getMitmDir() {
  return _mitmDir ??= path.join(getDataDirLazy(), "mitm");
}

module.exports = {
  get DATA_DIR() { return getDataDirLazy(); },
  get MITM_DIR() { return getMitmDir(); },
};
