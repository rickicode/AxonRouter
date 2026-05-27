import type { ChildProcess, SpawnOptionsWithoutStdio } from 'node:child_process';
import type { WriteStream } from 'node:fs';
import type { IncomingMessage, ClientRequest } from 'node:http';
import type { Stats } from 'node:fs';
import type { Hash } from 'node:crypto';

/** Returns the platform-specific data directory for axonrouter. */
export declare function getDataDir(): string;

/** Joins the data directory path with additional path segments. */
export declare function resolveDataPath(...segments: string[]): string;

/** Creates the data directory if it does not exist. Returns the directory path. */
export declare function ensureDataDir(): string;

/** Checks if a file exists relative to the data directory. */
export declare function dataFileExists(p: string): boolean;

/** Reads a file relative to the data directory. */
export declare function readDataFile(p: string, enc?: BufferEncoding): string | Buffer;

/** Writes data to a file relative to the data directory. */
export declare function writeDataFile(p: string, data: string | Buffer): void;

/** Creates a directory relative to the data directory. */
export declare function mkdirForData(p: string, opts?: { recursive?: boolean }): string | undefined;

/** Creates a write stream for a file relative to the data directory. */
export declare function createWriteStreamForData(p: string): WriteStream;

/** Returns stat info for a file relative to the data directory. */
export declare function statDataFile(p: string): Stats;

/** Opens a file relative to the data directory and returns a file descriptor. */
export declare function openDataFile(p: string, flags: string | number): number;

/** Reads from a file descriptor into a buffer. */
export declare function readDataFd(fd: number, buf: Buffer, offset: number, len: number, pos: number | null): number;

/** Closes a file descriptor. */
export declare function closeDataFd(fd: number): void;

/** Changes file permissions relative to the data directory. */
export declare function chmodDataFile(p: string, mode: string | number): void;

/** Removes a file or directory relative to the data directory. */
export declare function rmDataPath(p: string, opts?: { recursive?: boolean; force?: boolean }): void;

/** Creates a temporary directory with a prefix relative to the data directory. */
export declare function mkdtempForData(prefix: string): string;

/** Unlinks (deletes) a file relative to the data directory. */
export declare function unlinkDataFile(p: string): void;

/** Renames a file relative to the data directory. */
export declare function renameDataFile(src: string, dst: string): void;

/** Raw fs.existsSync for absolute paths. */
export declare function existsSync(p: string): boolean;

/** Raw fs.mkdirSync for absolute paths. */
export declare function mkdirSync(p: string, opts?: { recursive?: boolean }): string | undefined;

/** Raw fs.writeFileSync for absolute paths. */
export declare function writeFileSync(p: string, data: string | Buffer, enc?: BufferEncoding): void;

/** Executes a command synchronously. */
export declare function execSyncCmd(cmd: string, opts?: { encoding?: BufferEncoding; cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number; stdio?: any; windowsHide?: boolean; [key: string]: any }): string | Buffer;

/** Spawns a child process. */
export declare function spawnCmd(cmd: string, args?: string[], opts?: SpawnOptionsWithoutStdio & { [key: string]: any }): ChildProcess;

/** Makes an HTTPS GET request. */
export declare function httpsGet(url: string | URL, cb?: (res: IncomingMessage) => void): ClientRequest;

/** Joins path segments. */
export declare function pathJoin(...segments: string[]): string;

/** Returns the directory name of a path. */
export declare function pathDirname(p: string): string;

/** Returns whether a path is absolute. */
export declare function pathIsAbsolute(p: string): boolean;

/** Returns the operating system platform. */
export declare function osPlatform(): NodeJS.Platform;

/** Returns the operating system CPU architecture. */
export declare function osArch(): string;

/** Returns the home directory of the current user. */
export declare function osHomedir(): string;

/** Returns the operating system temporary directory. */
export declare function osTmpdir(): string;

/** Returns the hostname of the operating system. */
export declare function osHostname(): string;

/** Creates a write stream for an absolute path (outside the data directory). */
export declare function createWriteStreamAbsolute(p: string): WriteStream;

/** Removes a file or directory at an absolute path (outside the data directory). */
export declare function rmAbsolute(p: string, opts?: { recursive?: boolean; force?: boolean }): void;

/** Unlinks (deletes) a file at an absolute path (outside the data directory). */
export declare function unlinkAbsolute(p: string): void;

/** Creates a hash object using the specified algorithm (e.g., 'sha256'). */
export declare function cryptoCreateHash(algorithm: string): Hash;

/** Generates a random UUID (v4). */
export declare function cryptoRandomUUID(): string;
