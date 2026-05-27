import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const _fs = _require("fs");

const SEP = process.platform === "win32" ? "\\" : "/";

let _dataDir = null;

export function getDataDir() {
  if (_dataDir) return _dataDir;
  if (process.platform === "win32") {
    const appdata = process.env.APPDATA;
    const home = process.env.USERPROFILE || process.env.HOMEPATH || "";
    const roaming = home + SEP + "AppData" + SEP + "Roaming";
    _dataDir = (appdata || roaming) + SEP + "axonrouter";
  } else {
    const home = process.env.HOME || "/root";
    _dataDir = home + SEP + ".axonrouter";
  }
  return _dataDir;
}

export function resolveDataPath(...segments) {
  return getDataDir() + SEP + segments.join(SEP);
}

let _dbSqliteFile;
export function getDbSqliteFile() {
  return _dbSqliteFile ??= getDataDir() + SEP + "db.sqlite";
}

let _dbJsonFile;
export function getDbJsonFile() {
  return _dbJsonFile ??= getDataDir() + SEP + "db.json";
}

export function ensureDataDir() {
  const dir = getDataDir();
  if (!_fs.existsSync(dir)) {
    _fs.mkdirSync(dir, { recursive: true });
  }
}

export function dataDirExists() {
  return _fs.existsSync(getDataDir());
}

export function dataFileExists(filePath) {
  return _fs.existsSync(filePath);
}

export function readDataFile(filePath, encoding) {
  return _fs.readFileSync(filePath, encoding);
}

export function renameDataFile(oldPath, newPath) {
  return _fs.renameSync(oldPath, newPath);
}

export function unlinkDataFile(filePath) {
  return _fs.unlinkSync(filePath);
}

export function mkdirForData(dirPath, options) {
  return _fs.mkdirSync(dirPath, options);
}

export function createWriteStreamForData(filePath) {
  return _fs.createWriteStream(filePath);
}

export function statDataFile(filePath) {
  return _fs.statSync(filePath);
}

export function openDataFile(filePath, flags) {
  return _fs.openSync(filePath, flags);
}

export function readDataFd(fd, buffer, offset, length, position) {
  return _fs.readSync(fd, buffer, offset, length, position);
}

export function closeDataFd(fd) {
  return _fs.closeSync(fd);
}

export function chmodDataFile(filePath, mode) {
  return _fs.chmodSync(filePath, mode);
}

export function writeDataFile(filePath, content, encoding) {
  return _fs.writeFileSync(filePath, content, encoding);
}

export function rmDataPath(dirPath, options) {
  return _fs.rmSync(dirPath, options);
}

export function mkdtempForData(prefix) {
  return _fs.mkdtempSync(prefix);
}
