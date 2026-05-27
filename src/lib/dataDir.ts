import path from "path";
import os from "os";

let _dataDir: string | null = null;

export function getDataDir() {
  if (_dataDir) return _dataDir;
  if (process.platform === "win32") {
    const roaming = path.join(os.homedir(), "AppData", "Roaming");
    const appdata = process.env.APPDATA;
    _dataDir = path.join(appdata || roaming, "axonrouter");
  } else {
    _dataDir = path.join(os.homedir(), ".axonrouter");
  }
  return _dataDir;
}

export const DATA_DIR = getDataDir();
