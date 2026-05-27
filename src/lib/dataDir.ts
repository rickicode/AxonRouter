import { getDataDir as _getDataDir } from "@axonrouter/data-dir";

let _dataDir: string | null = null;

export function getDataDir() {
  if (_dataDir) return _dataDir;
  _dataDir = _getDataDir();
  return _dataDir;
}

export const DATA_DIR = getDataDir();
