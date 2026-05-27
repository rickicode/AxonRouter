import { existsSync, mkdirSync, execSyncCmd, osPlatform, resolveDataPath, pathJoin } from "@axonrouter/data-dir";
import { getDeps } from "./deps";

const IS_MAC = osPlatform() === "darwin";
const IS_WINDOWS = osPlatform() === "win32";

function getTailscaleBinPath() {
  return resolveDataPath("bin", IS_WINDOWS ? "tailscale.exe" : "tailscale");
}
function getTailscaleDir() {
  return resolveDataPath("tailscale");
}
function getTailscaleSocket() {
  return pathJoin(getTailscaleDir(), "tailscaled.sock");
}

function getSocketFlag() {
  return IS_WINDOWS ? [] : ["--socket", getTailscaleSocket()];
}
const WINDOWS_TAILSCALE_BIN = "C:\\Program Files\\Tailscale\\tailscale.exe";
const EXTENDED_PATH = `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${process.env.PATH || ""}`;

export function getTailscaleSocketArgs(): string[] {
  return [...getSocketFlag()];
}

export function getTailscaleBin() {
  try {
    const systemPath = (execSyncCmd("which tailscale 2>/dev/null || where tailscale 2>nul", {
      encoding: "utf8",
      windowsHide: true,
    }) as string).trim();
    if (systemPath) return systemPath;
  } catch {
    // not in PATH
  }
  const binPath = getTailscaleBinPath();
  if (existsSync(binPath)) return binPath;
  if (IS_WINDOWS && existsSync(WINDOWS_TAILSCALE_BIN)) return WINDOWS_TAILSCALE_BIN;
  return null;
}

export async function startDaemonWithPassword(sudoPassword: string) {
  if (IS_WINDOWS) {
    try {
      const bin = getTailscaleBin();
      if (bin) {
        execSyncCmd(`"${bin}" status --json`, { stdio: "ignore", windowsHide: true, timeout: 3000 } as any);
        return;
      }
    } catch {
      // not running
    }
    try {
      execSyncCmd("net start Tailscale", { stdio: "ignore", windowsHide: true, timeout: 10000 } as any);
      await new Promise<void>((r) => setTimeout(r, 3000));
    } catch {
      // may need admin or already running
    }
    return;
  }

  try {
    const bin = getTailscaleBin() || "tailscale";
    execSyncCmd(`"${bin}" ${getSocketFlag().join(" ")} status --json`, {
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, PATH: EXTENDED_PATH },
      timeout: 3000,
    } as any);
    return;
  } catch {
    // not running, start it
  }

  const tailscaleDir = getTailscaleDir();
  if (!existsSync(tailscaleDir)) mkdirSync(tailscaleDir, { recursive: true });

  const { execWithPasswordFromDns } = getDeps();
  const tailscaledBin = IS_MAC ? "/usr/local/bin/tailscaled" : "tailscaled";
  const socket = getTailscaleSocket();
  const daemonCmd = `${tailscaledBin} --socket=${socket} --statedir=${tailscaleDir}`;
  await execWithPasswordFromDns(`nohup ${daemonCmd} > /dev/null 2>&1 &`, sudoPassword || "");
  await new Promise<void>((r) => setTimeout(r, 3000));
}
