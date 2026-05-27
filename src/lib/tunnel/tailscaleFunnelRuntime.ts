import fs from "fs";
import os from "os";
import path from "path";
import { execSync, spawn } from "child_process";
import { execWithPassword } from "./sudoRuntime";

const IS_WINDOWS = os.platform() === "win32";

let _tunnelDataDir: string | null = null;
function getTunnelDataDir() {
  if (_tunnelDataDir) return _tunnelDataDir;
  if (IS_WINDOWS) {
    _tunnelDataDir = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "axonrouter");
  } else {
    _tunnelDataDir = path.join(os.homedir(), ".axonrouter");
  }
  return _tunnelDataDir;
}

let _binDir: string | null = null;
function getBinDir() {
  if (!_binDir) _binDir = path.join(getTunnelDataDir(), "bin");
  return _binDir;
}

let _tailscaleBin: string | null = null;
function getTailscaleBinPath() {
  if (!_tailscaleBin) _tailscaleBin = path.join(getBinDir(), IS_WINDOWS ? "tailscale.exe" : "tailscale");
  return _tailscaleBin;
}
const WINDOWS_TAILSCALE_BIN = "C:\\Program Files\\Tailscale\\tailscale.exe";

let cachedTailscaleSocketPath: string | null = null;

function getTailscaleSocketPath() {
  if (cachedTailscaleSocketPath) return cachedTailscaleSocketPath;
  cachedTailscaleSocketPath = path.join(getTunnelDataDir(), "tailscale", "tailscaled.sock");
  return cachedTailscaleSocketPath;
}

function getTailscaleSocketArgs() {
  return IS_WINDOWS ? [] : ["--socket", getTailscaleSocketPath()];
}

let cachedTailscaleBin: string | null | undefined;

function resolveTailscaleBin() {
  try {
    const systemPath = execSync("which tailscale 2>/dev/null || where tailscale 2>nul", { encoding: "utf8", windowsHide: true }).trim();
    if (systemPath) return systemPath;
  } catch {
    // not in PATH
  }
  const binPath = getTailscaleBinPath();
  if (fs.existsSync(binPath)) return binPath;
  if (IS_WINDOWS && fs.existsSync(WINDOWS_TAILSCALE_BIN)) return WINDOWS_TAILSCALE_BIN;
  return null;
}

function getTailscaleBin() {
  if (cachedTailscaleBin !== undefined) return cachedTailscaleBin;
  cachedTailscaleBin = resolveTailscaleBin();
  return cachedTailscaleBin;
}

const FUNNEL_URL_REGEX = /https:\/\/[a-z0-9-]+\.[a-z0-9.-]+\.ts\.net[^\s]*/i;
const FUNNEL_ENABLE_URL_REGEX = /https:\/\/login\.tailscale\.com\/[^\s]+/;

function parseFunnelUrl(text: string) {
  return (text.match(FUNNEL_URL_REGEX) || [])[0]?.replace(/\/$/, "") || null;
}

export async function startFunnelRuntime(port: number) {
  const bin = getTailscaleBin();
  if (!bin) throw new Error("Tailscale not installed");

  const socketArgs = getTailscaleSocketArgs();
  try {
    execSync(`"${bin}" ${socketArgs.join(" ")} funnel --bg reset`, { stdio: "ignore", windowsHide: true });
  } catch {
    // ignore
  }

  return new Promise((resolve, reject) => {
    const child = spawn(bin, [...socketArgs, "funnel", "--bg", `${port}`], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let resolved = false;
    let output = "";

    const timeout = setTimeout(async () => {
      if (resolved) return;
      resolved = true;
      const { getTailscaleFunnelUrl } = await import("./tailscaleStatus");
      const url = getTailscaleFunnelUrl(port);
      if (url) resolve({ tunnelUrl: url });
      else reject(new Error(`Tailscale funnel timed out: ${output.trim() || "no output"}`));
    }, 30000);

    let funnelNotEnabled = false;

    const handleData = (data: Buffer) => {
      output += data.toString();
      if (output.includes("Funnel is not enabled")) funnelNotEnabled = true;

      if (funnelNotEnabled && !resolved) {
        const enableMatch = output.match(FUNNEL_ENABLE_URL_REGEX);
        if (enableMatch) {
          resolved = true;
          clearTimeout(timeout);
          child.kill();
          resolve({ funnelNotEnabled: true, enableUrl: enableMatch[0] });
          return;
        }
      }

      const url = parseFunnelUrl(output);
      if (url && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ tunnelUrl: url });
      }
    };

    child.stdout.on("data", handleData);
    child.stderr.on("data", handleData);

    child.on("exit", async (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      const { getTailscaleFunnelUrl } = await import("./tailscaleStatus");
      const url = parseFunnelUrl(output) || getTailscaleFunnelUrl(port);
      if (url) resolve({ tunnelUrl: url });
      else reject(new Error(`tailscale funnel failed (code ${code}): ${output.trim()}`));
    });

    child.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export function stopFunnelRuntime() {
  const bin = getTailscaleBin();
  if (!bin) return;
  const socketArgs = getTailscaleSocketArgs();
  try {
    execSync(`"${bin}" ${socketArgs.join(" ")} funnel --bg reset`, { stdio: "ignore", windowsHide: true });
  } catch {
    // ignore
  }
}

export async function stopDaemonRuntime(sudoPassword: string) {
  try {
    execSync("pkill -x tailscaled", { stdio: "ignore", windowsHide: true, timeout: 3000 });
  } catch {
    // ignore
  }

  try {
    execSync("pgrep -x tailscaled", { stdio: "ignore", windowsHide: true, timeout: 2000 });
  } catch {
    return;
  }

  if (!IS_WINDOWS) {
    try {
      await execWithPassword("pkill -x tailscaled", sudoPassword || "");
    } catch {
      // ignore
    }

    const socketPath = getTailscaleSocketPath();
    try {
      if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
    } catch {
      // ignore
    }
  }
}
