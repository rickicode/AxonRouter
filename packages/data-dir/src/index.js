import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream, statSync, openSync, readSync, closeSync, chmodSync, rmSync, mkdtempSync, unlinkSync, renameSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { get as httpsGetRaw } from 'node:https';
import { platform, arch, homedir, tmpdir, hostname } from 'node:os';

/**
 * Returns the platform-specific data directory for axonrouter.
 * Windows: %APPDATA%/axonrouter
 * Others: ~/.axonrouter
 */
export function getDataDir() {
  if (platform() === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'axonrouter');
  }
  return join(homedir(), '.axonrouter');
}

/**
 * Joins the data directory path with additional path segments.
 */
export function resolveDataPath(...segments) {
  return join(getDataDir(), ...segments);
}

/**
 * Creates the data directory if it does not exist.
 */
export function ensureDataDir() {
  const dir = getDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Checks if a file exists relative to the data directory.
 */
export function dataFileExists(p) {
  return existsSync(join(getDataDir(), p));
}

/**
 * Reads a file relative to the data directory.
 */
export function readDataFile(p, enc) {
  return readFileSync(join(getDataDir(), p), enc);
}

/**
 * Writes data to a file relative to the data directory.
 */
export function writeDataFile(p, data) {
  return writeFileSync(join(getDataDir(), p), data);
}

/**
 * Creates a directory relative to the data directory.
 */
export function mkdirForData(p, opts) {
  return mkdirSync(join(getDataDir(), p), opts);
}

/**
 * Creates a write stream for a file relative to the data directory.
 */
export function createWriteStreamForData(p) {
  return createWriteStream(join(getDataDir(), p));
}

/**
 * Returns stat info for a file relative to the data directory.
 */
export function statDataFile(p) {
  return statSync(join(getDataDir(), p));
}

/**
 * Opens a file relative to the data directory and returns a file descriptor.
 */
export function openDataFile(p, flags) {
  return openSync(join(getDataDir(), p), flags);
}

/**
 * Reads from a file descriptor into a buffer.
 */
export function readDataFd(fd, buf, offset, len, pos) {
  return readSync(fd, buf, offset, len, pos);
}

/**
 * Closes a file descriptor.
 */
export function closeDataFd(fd) {
  return closeSync(fd);
}

/**
 * Changes file permissions relative to the data directory.
 */
export function chmodDataFile(p, mode) {
  return chmodSync(join(getDataDir(), p), mode);
}

/**
 * Removes a file or directory relative to the data directory.
 */
export function rmDataPath(p, opts) {
  return rmSync(join(getDataDir(), p), opts);
}

/**
 * Creates a temporary directory with a prefix relative to the data directory.
 */
export function mkdtempForData(prefix) {
  return mkdtempSync(join(getDataDir(), prefix));
}

/**
 * Unlinks (deletes) a file relative to the data directory.
 */
export function unlinkDataFile(p) {
  return unlinkSync(join(getDataDir(), p));
}

/**
 * Renames a file relative to the data directory.
 */
export function renameDataFile(src, dst) {
  return renameSync(join(getDataDir(), src), join(getDataDir(), dst));
}

/**
 * Raw fs.existsSync for absolute paths.
 */
export { existsSync };

/**
 * Raw fs.mkdirSync for absolute paths.
 */
export { mkdirSync };

/**
 * Raw fs.writeFileSync for absolute paths.
 */
export { writeFileSync };

/**
 * Executes a command synchronously.
 */
export function execSyncCmd(cmd, opts) {
  return execSync(cmd, opts);
}

/**
 * Spawns a child process.
 */
export function spawnCmd(cmd, args, opts) {
  return spawn(cmd, args, opts);
}

/**
 * Makes an HTTPS GET request.
 */
export function httpsGet(url, cb) {
  return httpsGetRaw(url, cb);
}

/**
 * Joins path segments.
 */
export function pathJoin(...segments) {
  return join(...segments);
}

/**
 * Returns the directory name of a path.
 */
export function pathDirname(p) {
  return dirname(p);
}

/**
 * Returns whether a path is absolute.
 */
export function pathIsAbsolute(p) {
  return isAbsolute(p);
}

/**
 * Returns the operating system platform.
 */
export function osPlatform() {
  return platform();
}

/**
 * Returns the operating system CPU architecture.
 */
export function osArch() {
  return arch();
}

/**
 * Returns the home directory of the current user.
 */
export function osHomedir() {
  return homedir();
}

/**
 * Returns the operating system temporary directory.
 */
export function osTmpdir() {
  return tmpdir();
}

/**
 * Returns the hostname of the operating system.
 */
export function osHostname() {
  return hostname();
}
