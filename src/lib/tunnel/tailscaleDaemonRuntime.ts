import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import * as dnsConfig from "@/mitm/dns/dnsConfig";
import { getDataDir } from "@/lib/dataDir";

const { execWithPassword } = dnsConfig as any;
const IS_MAC = os.platform() === "darwin";
const IS_WINDOWS = os.platform() === "win32";

function getTailscaleBinPath() {
  return path.join(getDataDir(), "bin", IS_WINDOWS ? "tailscale.exe" : "tailscale");
}
function getTailscaleDir() {
  return path.join(getDataDir(), "tailscale");
}
function getTailscaleSocket() {
  return path.join(getTailscaleDir(), "tailscaled.sock");
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
    const systemPath = execSync("which tailscale 2>/dev/null || where tailscale 2>nul", {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    if (systemPath) return systemPath;
  } catch {
    // not in PATH
  }
  const binPath = getTailscaleBinPath();
  if (fs.existsSync(binPath)) return binPath;
  if (IS_WINDOWS && fs.existsSync(WINDOWS_TAILSCALE_BIN)) return WINDOWS_TAILSCALE_BIN;
  return null;
}

export async function startDaemonWithPassword(sudoPassword: string) {
  if (IS_WINDOWS) {
    try {
      const bin = getTailscaleBin();
      if (bin) {
        execSync(`"${bin}" status --json`, { stdio: "ignore", windowsHide: true, timeout: 3000 });
        return;
      }
    } catch {
      // not running
    }
    try {
      execSync("net start Tailscale", { stdio: "ignore", windowsHide: true, timeout: 10000 });
      await new Promise<void>((r) => setTimeout(r, 3000));
    } catch {
      // may need admin or already running
    }
    return;
  }

  try {
    const bin = getTailscaleBin() || "tailscale";
    execSync(`"${bin}" ${getSocketFlag().join(" ")} status --json`, {
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, PATH: EXTENDED_PATH },
      timeout: 3000,
    });
    return;
  } catch {
    // not running, start it
  }

  const tailscaleDir = getTailscaleDir();
  if (!fs.existsSync(tailscaleDir)) fs.mkdirSync(tailscaleDir, { recursive: true });

  const tailscaledBin = IS_MAC ? "/usr/local/bin/tailscaled" : "tailscaled";
  const socket = getTailscaleSocket();
  const daemonCmd = `${tailscaledBin} --socket=${socket} --statedir=${tailscaleDir}`;
  await execWithPassword(`nohup ${daemonCmd} > /dev/null 2>&1 &`, sudoPassword || "");
  await new Promise<void>((r) => setTimeout(r, 3000));
}
