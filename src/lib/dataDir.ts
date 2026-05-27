import { pathJoin, osHomedir } from "@axonrouter/data-dir";

let _dataDir: string | null = null;

export function getDataDir() {
  if (_dataDir) return _dataDir;
  if (process.platform === "win32") {
    const roaming = pathJoin(osHomedir(), "AppData", "Roaming");
    const appdata = process.env.APPDATA;
    _dataDir = pathJoin(appdata || roaming, "axonrouter");
  } else {
    _dataDir = pathJoin(osHomedir(), ".axonrouter");
  }
  return _dataDir;
}

export const DATA_DIR = getDataDir();
