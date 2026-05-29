import { execFile, spawn, execSync } from "child_process";
import fsSync from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { getDataDir } from "@axonrouter/data-dir";

const execFileAsync = promisify(execFile);

const DEFAULT_PORT = 12711;
const IS_MAC = process.platform === "darwin";
const IS_LINUX = process.platform === "linux";
const IS_WINDOWS = process.platform === "win32";
const EXTENDED_PATH = `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${process.env.PATH || ""}`;
const LOGIN_TIMEOUT_MS = 15000;
const FUNNEL_TIMEOUT_MS = 30000;

const SYSTEM_SOCKET_LINUX = "/var/run/tailscale/tailscaled.sock";
const SYSTEM_SOCKET_MAC = "/var/run/tailscaled.sock";
const WINDOWS_TAILSCALE_BIN = "C:\\Program Files\\Tailscale\\tailscale.exe";
const WINDOWS_TAILSCALED_BIN = "C:\\Program Files\\Tailscale\\tailscaled.exe";

let _cachedActiveSocket: string | null = null;
let _cachedActiveSocketTimestamp = 0;
const SOCKET_CACHE_TTL_MS = 10_000;

type TailscaleInstallSource = "managed" | "path" | "env" | "windows-default";
type TailscaleTunnelPhase = "unsupported" | "not_installed" | "needs_login" | "stopped" | "running" | "error";

type PersistedTailscaleState = {
  binaryPath?: string | null;
  installSource?: TailscaleInstallSource | null;
  daemonPid?: number | null;
  tunnelUrl?: string | null;
  lastError?: string | null;
  installedAt?: string | null;
  updatedAt?: string | null;
  enabled?: boolean;
};

type BinaryResolution = {
  binaryPath: string | null;
  installSource: TailscaleInstallSource | null;
  managedInstall: boolean;
};

type JsonRecord = Record<string, unknown>;

export type TailscaleTunnelStatus = {
  supported: boolean;
  installed: boolean;
  managedInstall: boolean;
  installSource: TailscaleInstallSource | null;
  binaryPath: string | null;
  loggedIn: boolean;
  daemonRunning: boolean;
  running: boolean;
  enabled: boolean;
  tunnelUrl: string | null;
  apiUrl: string | null;
  platform: NodeJS.Platform;
  lastError: string | null;
  pid: number | null;
  phase: TailscaleTunnelPhase;
};

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function isSupportedPlatform(platform = process.platform) {
  return platform === "darwin" || platform === "linux" || platform === "win32";
}

function getTailscaleDir() {
  return path.join(getDataDir(), "tailscale");
}

function getManagedBinaryPath(platform = process.platform) {
  return path.join(getTailscaleDir(), "bin", platform === "win32" ? "tailscale.exe" : "tailscale");
}

function getStateFilePath() {
  return path.join(getTailscaleDir(), "state.json");
}

function getPidFilePath() {
  return path.join(getTailscaleDir(), ".tailscaled.pid");
}

function getLogFilePath() {
  return path.join(getTailscaleDir(), "tailscaled.log");
}

function getTailscaleSocketPath() {
  return path.join(getTailscaleDir(), "tailscaled.sock");
}

async function ensureTailscaleDir() {
  await fs.mkdir(path.join(getTailscaleDir(), "bin"), { recursive: true });
}

async function readStateFile(): Promise<PersistedTailscaleState> {
  try {
    const raw = await fs.readFile(getStateFilePath(), "utf8");
    return JSON.parse(raw) as PersistedTailscaleState;
  } catch { return {}; }
}

async function writeStateFile(state: PersistedTailscaleState) {
  await ensureTailscaleDir();
  await fs.writeFile(getStateFilePath(), JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function updateStateFile(patch: Partial<PersistedTailscaleState>) {
  const current = await readStateFile();
  await writeStateFile({ ...current, ...patch, updatedAt: new Date().toISOString() });
}

async function readPidFile() {
  try {
    const raw = await fs.readFile(getPidFilePath(), "utf8");
    const pid = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(pid) ? pid : null;
  } catch { return null; }
}

async function clearPidFile() {
  try { await fs.unlink(getPidFilePath()); } catch { /* ignore */ }
}

function isProcessAlive(pid: number | null) {
  if (!pid || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function getTailscaleApiUrl(tunnelUrl: string | null) {
  return tunnelUrl ? `${tunnelUrl.replace(/\/$/, "")}/v1` : null;
}

function buildExecEnv() {
  return { ...process.env, PATH: EXTENDED_PATH };
}

async function getActiveSocketPath(): Promise<string> {
  const now = Date.now();
  if (_cachedActiveSocket && now - _cachedActiveSocketTimestamp < SOCKET_CACHE_TTL_MS) {
    return _cachedActiveSocket;
  }
  const systemSocket = IS_LINUX ? SYSTEM_SOCKET_LINUX : IS_MAC ? SYSTEM_SOCKET_MAC : null;
  if (systemSocket && fsSync.existsSync(systemSocket)) {
    _cachedActiveSocket = systemSocket;
    _cachedActiveSocketTimestamp = now;
    return systemSocket;
  }
  const customSocket = getTailscaleSocketPath();
  _cachedActiveSocket = customSocket;
  _cachedActiveSocketTimestamp = now;
  return customSocket;
}

function isSystemDaemonAvailable(): boolean {
  const systemSocket = IS_LINUX ? SYSTEM_SOCKET_LINUX : IS_MAC ? SYSTEM_SOCKET_MAC : null;
  return Boolean(systemSocket && fsSync.existsSync(systemSocket));
}

function invalidateSocketCache() {
  _cachedActiveSocket = null;
  _cachedActiveSocketTimestamp = 0;
}

async function buildTailscaleArgs(...args: string[]) {
  if (IS_WINDOWS) return args;
  const socket = await getActiveSocketPath();
  return ["--socket", socket, ...args];
}

async function resolvePathCommand(command: string) {
  const lookupCommand = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(lookupCommand, [command], { timeout: 3000, env: buildExecEnv() });
    return stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || null;
  } catch { return null; }
}

async function resolveBinary(): Promise<BinaryResolution> {
  const envPath = toNonEmptyString(process.env.TAILSCALE_BIN);
  if (envPath && fsSync.existsSync(envPath)) return { binaryPath: envPath, installSource: "env", managedInstall: false };
  const managedPath = getManagedBinaryPath();
  if (fsSync.existsSync(managedPath)) return { binaryPath: managedPath, installSource: "managed", managedInstall: true };
  const pathBinary = await resolvePathCommand("tailscale");
  if (pathBinary) return { binaryPath: pathBinary, installSource: "path", managedInstall: false };
  if (IS_WINDOWS && fsSync.existsSync(WINDOWS_TAILSCALE_BIN)) return { binaryPath: WINDOWS_TAILSCALE_BIN, installSource: "windows-default", managedInstall: false };
  return { binaryPath: null, installSource: null, managedInstall: false };
}

async function resolveDaemonBinary(tailscaleBinaryPath: string | null) {
  const envPath = toNonEmptyString(process.env.TAILSCALED_BIN);
  if (envPath && fsSync.existsSync(envPath)) return envPath;
  const daemonFilename = process.platform === "win32" ? "tailscaled.exe" : "tailscaled";
  const siblingDir = tailscaleBinaryPath ? path.dirname(tailscaleBinaryPath) : null;
  const sibling = siblingDir ? path.join(siblingDir, daemonFilename) : null;
  if (sibling && fsSync.existsSync(sibling)) return sibling;
  const pathBinary = await resolvePathCommand("tailscaled");
  if (pathBinary) return pathBinary;
  if (IS_WINDOWS && fsSync.existsSync(WINDOWS_TAILSCALED_BIN)) return WINDOWS_TAILSCALED_BIN;
  return null;
}

async function readJsonCommand(binaryPath: string, args: string[], timeout = 5000) {
  try {
    const { stdout } = await execFileAsync(binaryPath, args, { timeout, env: buildExecEnv() });
    return JSON.parse(stdout) as JsonRecord;
  } catch { return null; }
}

async function getLiveStatusPayload(binaryPath: string | null) {
  if (!binaryPath) return null;
  return readJsonCommand(binaryPath, await buildTailscaleArgs("status", "--json"));
}

async function getLiveFunnelPayload(binaryPath: string | null) {
  if (!binaryPath) return null;
  const funnelResult = await readJsonCommand(binaryPath, await buildTailscaleArgs("funnel", "status", "--json"));
  if (funnelResult) return funnelResult;
  return readJsonCommand(binaryPath, await buildTailscaleArgs("serve", "status", "--json"));
}

function isBackendRunning(payload: unknown) {
  return toNonEmptyString(asRecord(payload).BackendState) === "Running";
}

function isFunnelRunning(payload: unknown) {
  const allowFunnel = asRecord(payload).AllowFunnel;
  return Boolean(allowFunnel && typeof allowFunnel === "object" && Object.keys(allowFunnel).length > 0);
}

function getTailscaleUrlFromStatusPayload(payload: unknown) {
  const self = asRecord(asRecord(payload).Self);
  const dnsName = toNonEmptyString(self.DNSName);
  if (!dnsName) return null;
  const normalized = dnsName.replace(/\.$/, "");
  return normalized ? `https://${normalized}` : null;
}

function extractTailscaleAuthUrl(text: string) {
  const match = text.match(/https:\/\/login\.tailscale\.com\/a\/[a-zA-Z0-9-]+/);
  return match ? match[0] : null;
}

function extractTailscaleEnableUrl(text: string) {
  const match = text.match(/https:\/\/login\.tailscale\.com\/[^\s"']+/);
  return match ? match[0] : null;
}

function extractTailscaleFunnelUrl(text: string) {
  const match = text.match(/https:\/\/[a-z0-9-]+\.[a-z0-9.-]+\.ts\.net\b[^\s"']*/i);
  if (!match) return null;
  return match[0].replace(/\/$/, "");
}

function getDefaultHostname() {
  return os.hostname().replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() || "axonrouter";
}

async function getLiveTunnelUrl(binaryPath: string | null) {
  const payload = await getLiveStatusPayload(binaryPath);
  return getTailscaleUrlFromStatusPayload(payload);
}

async function runSudoShell(command: string, password: string) {
  const normalizedPassword = password.trim();
  if (!normalizedPassword) throw new Error("Sudo password required");
  execSync(`echo ${shellEscape(normalizedPassword)} | sudo -S sh -c ${shellEscape(command)}`, {
    timeout: 30000,
    stdio: "pipe",
    env: buildExecEnv(),
  });
}

export async function getTailscaleTunnelStatus(): Promise<TailscaleTunnelStatus> {
  const resolution = await resolveBinary();
  const [state, statusPayload, funnelPayload] = await Promise.all([
    readStateFile(),
    getLiveStatusPayload(resolution.binaryPath),
    getLiveFunnelPayload(resolution.binaryPath),
  ]);
  const liveTunnelUrl = getTailscaleUrlFromStatusPayload(statusPayload);
  const storedTunnelUrl = toNonEmptyString(state.tunnelUrl);
  const tunnelUrl = liveTunnelUrl || storedTunnelUrl;
  const loggedIn = isBackendRunning(statusPayload);
  const daemonRunning = Boolean(statusPayload) || isProcessAlive((await readPidFile()) || null);
  const funnelActive = isFunnelRunning(funnelPayload);
  const running = loggedIn && funnelActive && Boolean(tunnelUrl);
  const enabled = state.enabled === true && running;
  let phase: TailscaleTunnelPhase = "stopped";
  if (!isSupportedPlatform()) phase = "unsupported";
  else if (!resolution.binaryPath) phase = "not_installed";
  else if (running) phase = "running";
  else if (daemonRunning && !loggedIn) phase = "needs_login";
  else if (state.lastError) phase = "error";
  return {
    supported: isSupportedPlatform(),
    installed: Boolean(resolution.binaryPath),
    managedInstall: resolution.managedInstall,
    installSource: resolution.installSource,
    binaryPath: resolution.binaryPath,
    loggedIn,
    daemonRunning,
    running,
    enabled,
    tunnelUrl,
    apiUrl: getTailscaleApiUrl(tunnelUrl),
    platform: process.platform,
    lastError: state.lastError || null,
    pid: await readPidFile(),
    phase,
  };
}

export async function startTailscaleDaemon({ sudoPassword }: { sudoPassword?: string } = {}) {
  const resolution = await resolveBinary();
  if (!resolution.binaryPath) throw new Error("Tailscale is not installed");
  invalidateSocketCache();
  if (isSystemDaemonAvailable()) {
    const systemStatus = await getLiveStatusPayload(resolution.binaryPath);
    if (systemStatus) return { started: false, systemDaemon: true };
  }
  const existingStatus = await getLiveStatusPayload(resolution.binaryPath);
  if (existingStatus) return { started: false };
  if (IS_WINDOWS) {
    try { await execFileAsync("net", ["start", "Tailscale"], { timeout: 10000, env: buildExecEnv() }); } catch { /* ignore */ }
    await sleep(2500);
    if (!(await getLiveStatusPayload(resolution.binaryPath))) throw new Error("Failed to start Tailscale service");
    return { started: true };
  }
  const daemonBinary = await resolveDaemonBinary(resolution.binaryPath);
  if (!daemonBinary) throw new Error("tailscaled binary not found");
  const password = toNonEmptyString(sudoPassword) || "";
  if (!password) throw new Error("Sudo password required to start tailscaled");
  await ensureTailscaleDir();
  const command = [
    `mkdir -p ${shellEscape(getTailscaleDir())}`,
    `nohup ${shellEscape(daemonBinary)} --socket=${shellEscape(getTailscaleSocketPath())} --statedir=${shellEscape(getTailscaleDir())} >> ${shellEscape(getLogFilePath())} 2>&1 & echo $! > ${shellEscape(getPidFilePath())}`,
  ].join(" && ");
  runSudoShell(command, password);
  await sleep(3000);
  invalidateSocketCache();
  if (!(await getLiveStatusPayload(resolution.binaryPath))) throw new Error("tailscaled did not become ready");
  const pid = await readPidFile();
  await updateStateFile({ binaryPath: resolution.binaryPath, installSource: resolution.installSource, daemonPid: pid, lastError: null });
  return { started: true };
}

export async function startTailscaleLogin({ hostname, sudoPassword }: { hostname?: string; sudoPassword?: string } = {}): Promise<{ alreadyLoggedIn: true } | { authUrl: string }> {
  const resolution = await resolveBinary();
  if (!resolution.binaryPath) throw new Error("Tailscale is not installed");
  const currentStatus = await getLiveStatusPayload(resolution.binaryPath);
  if (isBackendRunning(currentStatus)) return { alreadyLoggedIn: true };
  const resolvedHostname = toNonEmptyString(hostname) || getDefaultHostname();
  const spawnArgs = await buildTailscaleArgs("up", "--accept-routes", ...(resolvedHostname ? [`--hostname=${resolvedHostname}`] : []));
  return new Promise((resolve, reject) => {
    const child = spawn(resolution.binaryPath as string, spawnArgs, {
      detached: true, stdio: ["ignore", "pipe", "pipe"], env: buildExecEnv(),
    });
    let settled = false;
    let output = "";
    const settle = (callback: () => void) => { if (settled) return; settled = true; clearTimeout(timeoutId); callback(); };
    const handleData = (chunk: Buffer | string) => {
      output += chunk.toString();
      const authUrl = extractTailscaleAuthUrl(output);
      if (authUrl) settle(() => resolve({ authUrl }));
    };
    const timeoutId = setTimeout(() => {
      const authUrl = extractTailscaleAuthUrl(output);
      if (authUrl) { settle(() => resolve({ authUrl })); return; }
      settle(() => reject(new Error("Tailscale login timed out")));
    }, LOGIN_TIMEOUT_MS);
    child.stdout.on("data", handleData);
    child.stderr.on("data", handleData);
    child.on("error", (error) => settle(() => reject(error)));
    child.on("close", async (code) => {
      if (settled) return;
      const authUrl = extractTailscaleAuthUrl(output);
      if (authUrl) { settle(() => resolve({ authUrl })); return; }
      const latestStatus = await getLiveStatusPayload(resolution.binaryPath);
      if (code === 0 || isBackendRunning(latestStatus)) { settle(() => resolve({ alreadyLoggedIn: true })); return; }
      settle(() => reject(new Error(`tailscale up exited with code ${code ?? "unknown"}`)));
    });
    child.unref();
  });
}

async function resetTailscaleFunnel(binaryPath: string) {
  try {
    await execFileAsync(binaryPath, await buildTailscaleArgs("funnel", "--bg", "reset"), { timeout: 5000, env: buildExecEnv() });
  } catch { /* ignore */ }
}

async function startTailscaleFunnel(binaryPath: string, port: number): Promise<{ tunnelUrl: string } | { funnelNotEnabled: true; enableUrl: string | null }> {
  await resetTailscaleFunnel(binaryPath);
  const funnelArgs = await buildTailscaleArgs("funnel", "--bg", String(port));
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, funnelArgs, { stdio: ["ignore", "pipe", "pipe"], env: buildExecEnv() });
    let settled = false;
    let output = "";
    const settle = (callback: () => void) => { if (settled) return; settled = true; clearTimeout(timeoutId); callback(); };
    const finalizeFromOutput = async () => {
      const url = extractTailscaleFunnelUrl(output) || (await getLiveTunnelUrl(binaryPath));
      if (url) { settle(() => resolve({ tunnelUrl: url })); return; }
      const enableUrl = extractTailscaleEnableUrl(output);
      if (/funnel is not enabled/i.test(output) || enableUrl) { settle(() => resolve({ funnelNotEnabled: true, enableUrl })); return; }
      settle(() => reject(new Error(output.trim() || "Failed to start Tailscale Funnel")));
    };
    const handleData = (chunk: Buffer | string) => {
      output += chunk.toString();
      const tunnelUrl = extractTailscaleFunnelUrl(output);
      if (tunnelUrl) { settle(() => resolve({ tunnelUrl })); return; }
      const enableUrl = extractTailscaleEnableUrl(output);
      if (/funnel is not enabled/i.test(output) && enableUrl) settle(() => resolve({ funnelNotEnabled: true, enableUrl }));
    };
    const timeoutId = setTimeout(() => { void finalizeFromOutput(); }, FUNNEL_TIMEOUT_MS);
    child.stdout.on("data", handleData);
    child.stderr.on("data", handleData);
    child.on("error", (error) => settle(() => reject(error)));
    child.on("close", () => { void finalizeFromOutput(); });
  });
}

async function stopTailscaleFunnel(binaryPath: string) {
  await resetTailscaleFunnel(binaryPath);
}

async function stopTailscaleDaemon({ sudoPassword }: { sudoPassword?: string } = {}) {
  const password = toNonEmptyString(sudoPassword) || "";
  const pid = await readPidFile();
  if (pid && isProcessAlive(pid)) {
    try { process.kill(pid, "SIGTERM"); } catch { /* ignore */ }
  }
  await sleep(1000);
  if (pid && isProcessAlive(pid) && password) {
    try { runSudoShell(`kill ${Number(pid)}`, password); } catch { /* ignore */ }
  }
  if (!IS_WINDOWS) {
    try { await execFileAsync("pkill", ["-x", "tailscaled"], { timeout: 3000, env: buildExecEnv() }); } catch { /* ignore */ }
    if (password) { try { runSudoShell("pkill -x tailscaled", password); } catch { /* ignore */ } }
  } else {
    try { await execFileAsync("net", ["stop", "Tailscale"], { timeout: 10000, env: buildExecEnv() }); } catch { /* ignore */ }
  }
  await clearPidFile();
  try { await fs.unlink(getTailscaleSocketPath()); } catch { /* ignore */ }
}

export async function enableTailscaleTunnel({ sudoPassword, hostname, port }: { sudoPassword?: string; hostname?: string; port?: number } = {}) {
  const targetPort = port || DEFAULT_PORT;
  try {
    await startTailscaleDaemon({ sudoPassword });
    const resolution = await resolveBinary();
    const currentStatus = await getLiveStatusPayload(resolution.binaryPath);
    if (!isBackendRunning(currentStatus)) {
      const loginResult = await startTailscaleLogin({ hostname, sudoPassword });
      if ("authUrl" in loginResult) {
        await updateStateFile({ lastError: null });
        return { success: false as const, needsLogin: true as const, authUrl: loginResult.authUrl, status: await getTailscaleTunnelStatus() };
      }
    }
    const funnelResult = await startTailscaleFunnel(resolution.binaryPath!, targetPort);
    if ("funnelNotEnabled" in funnelResult) {
      await updateStateFile({ lastError: null });
      return { success: false as const, funnelNotEnabled: true as const, enableUrl: funnelResult.enableUrl, status: await getTailscaleTunnelStatus() };
    }
    const tunnelUrl = funnelResult.tunnelUrl || (await getLiveTunnelUrl(resolution.binaryPath));
    if (!tunnelUrl) throw new Error("Failed to determine the Tailscale Funnel URL");
    await updateStateFile({ tunnelUrl, lastError: null, enabled: true });
    return { success: true as const, tunnelUrl, apiUrl: getTailscaleApiUrl(tunnelUrl), status: await getTailscaleTunnelStatus() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enable Tailscale Funnel";
    await updateStateFile({ lastError: message });
    throw error;
  }
}

export async function disableTailscaleTunnel({ sudoPassword }: { sudoPassword?: string } = {}) {
  try {
    const resolution = await resolveBinary();
    if (resolution.binaryPath) await stopTailscaleFunnel(resolution.binaryPath);
    await stopTailscaleDaemon({ sudoPassword });
    await updateStateFile({ tunnelUrl: null, lastError: null, enabled: false });
    return { success: true, status: await getTailscaleTunnelStatus() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to disable Tailscale Funnel";
    await updateStateFile({ lastError: message });
    throw error;
  }
}
