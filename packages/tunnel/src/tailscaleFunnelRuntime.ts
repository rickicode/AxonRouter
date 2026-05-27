import { existsSync, execSyncCmd, spawnCmd, osPlatform, osHomedir, resolveDataPath, pathJoin } from "@axonrouter/data-dir";
import { execWithPassword } from "./sudoRuntime";

const IS_WINDOWS = osPlatform() === "win32";

function getTunnelDataDir() {
  if (IS_WINDOWS) {
    return pathJoin(process.env.APPDATA || pathJoin(osHomedir(), "AppData", "Roaming"), "axonrouter");
  }
  return pathJoin(osHomedir(), ".axonrouter");
}

function getBinDir() {
  return pathJoin(getTunnelDataDir(), "bin");
}

function getTailscaleBinPath() {
  return pathJoin(getBinDir(), IS_WINDOWS ? "tailscale.exe" : "tailscale");
}
const WINDOWS_TAILSCALE_BIN = "C:\\Program Files\\Tailscale\\tailscale.exe";

function getTailscaleSocketPath() {
  return pathJoin(getTunnelDataDir(), "tailscale", "tailscaled.sock");
}

function getTailscaleSocketArgs() {
  return IS_WINDOWS ? [] : ["--socket", getTailscaleSocketPath()];
}

function resolveTailscaleBin() {
  try {
    const systemPath = (execSyncCmd("which tailscale 2>/dev/null || where tailscale 2>nul", { encoding: "utf8", windowsHide: true }) as string).trim();
    if (systemPath) return systemPath;
  } catch {
    // not in PATH
  }
  const binPath = getTailscaleBinPath();
  if (existsSync(binPath)) return binPath;
  if (IS_WINDOWS && existsSync(WINDOWS_TAILSCALE_BIN)) return WINDOWS_TAILSCALE_BIN;
  return null;
}

let cachedTailscaleBin: string | null | undefined;

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
    execSyncCmd(`"${bin}" ${socketArgs.join(" ")} funnel --bg reset`, { stdio: "ignore", windowsHide: true } as any);
  } catch {
    // ignore
  }

  return new Promise((resolve, reject) => {
    const child = spawnCmd(bin, [...socketArgs, "funnel", "--bg", `${port}`], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    } as any);

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
    execSyncCmd(`"${bin}" ${socketArgs.join(" ")} funnel --bg reset`, { stdio: "ignore", windowsHide: true } as any);
  } catch {
    // ignore
  }
}

export async function stopDaemonRuntime(sudoPassword: string) {
  try {
    execSyncCmd("pkill -x tailscaled", { stdio: "ignore", windowsHide: true, timeout: 3000 } as any);
  } catch {
    // ignore
  }

  try {
    execSyncCmd("pgrep -x tailscaled", { stdio: "ignore", windowsHide: true, timeout: 2000 } as any);
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
      if (existsSync(socketPath)) {
        const fs = require("fs") as typeof import("fs");
        fs.unlinkSync(socketPath);
      }
    } catch {
      // ignore
    }
  }
}
