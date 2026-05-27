import { existsSync, execSyncCmd, spawnCmd, osPlatform, osTmpdir, pathJoin } from "@axonrouter/data-dir";
import { startLogin } from "./tailscaleLogin";
import { startDaemonWithPassword } from "./tailscaleDaemonRuntime";

const IS_MAC = osPlatform() === "darwin";
const IS_WINDOWS = osPlatform() === "win32";
const WINDOWS_TAILSCALE_BIN = "C:\\Program Files\\Tailscale\\tailscale.exe";
const EXTENDED_PATH = `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${process.env.PATH || ""}`;

function hasBrew() {
  try {
    execSyncCmd("which brew", { stdio: "ignore", windowsHide: true, env: { ...process.env, PATH: EXTENDED_PATH } } as any);
    return true;
  } catch {
    return false;
  }
}

async function installTailscaleMac(sudoPassword: string, log: (message: string) => void) {
  if (hasBrew()) {
    log("Installing via Homebrew...");
    await new Promise<void>((resolve, reject) => {
      const child = spawnCmd("brew", ["install", "tailscale"], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: { ...process.env, PATH: EXTENDED_PATH },
      } as any);
      child.stdout.on("data", (d) => {
        const line = d.toString().trim();
        if (line) log(line);
      });
      child.stderr.on("data", (d) => {
        const line = d.toString().trim();
        if (line) log(line);
      });
      child.on("close", (c) => {
        if (c === 0) resolve();
        else reject(new Error(`brew install failed (code ${c})`));
      });
      child.on("error", reject);
    });
    return;
  }

  const pkgUrl = "https://pkgs.tailscale.com/stable/tailscale-latest.pkg";
  const pkgPath = pathJoin(osTmpdir(), "tailscale.pkg");

  log("Downloading Tailscale package...");
  await new Promise<void>((resolve, reject) => {
    const child = spawnCmd("curl", ["-fL", "--progress-bar", pkgUrl, "-o", pkgPath], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    } as any);
    child.stderr.on("data", (d) => {
      const line = d.toString().trim();
      if (line) log(line);
    });
    child.on("close", (c) => {
      if (c === 0) resolve();
      else reject(new Error("Download failed"));
    });
    child.on("error", reject);
  });

  log("Installing package...");
  await new Promise<void>((resolve, reject) => {
    const child = spawnCmd("sudo", ["-S", "installer", "-pkg", pkgPath, "-target", "/"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    } as any);
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.stdout.on("data", (d) => {
      const line = d.toString().trim();
      if (line) log(line);
    });
    child.on("close", (c) => {
      try {
        execSyncCmd(`rm -f ${pkgPath}`, { stdio: "ignore", windowsHide: true } as any);
      } catch {
        // ignore
      }
      if (c === 0) resolve();
      else {
        const msg = stderr.includes("incorrect password") || stderr.includes("Sorry")
          ? "Wrong sudo password"
          : stderr || `Exit code ${c}`;
        reject(new Error(msg));
      }
    });
    child.on("error", reject);
    child.stdin.write(`${sudoPassword}\n`);
    child.stdin.end();
  });
}

async function installTailscaleLinux(sudoPassword: string, log: (message: string) => void) {
  log("Downloading install script...");
  return new Promise<void>((resolve, reject) => {
    const curlChild = spawnCmd("curl", ["-fsSL", "https://tailscale.com/install.sh"], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    } as any);
    let scriptContent = "";
    let curlErr = "";
    curlChild.stdout.on("data", (d) => {
      scriptContent += d.toString();
    });
    curlChild.stderr.on("data", (d) => {
      curlErr += d.toString();
    });
    curlChild.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`Failed to download install script: ${curlErr}`));
      log("Running install script...");
      const child = spawnCmd("sudo", ["-S", "sh"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true } as any);
      let stderr = "";
      child.stdout.on("data", (d) => {
        const line = d.toString().trim();
        if (line) log(line);
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("close", (c) => {
        if (c === 0) resolve();
        else {
          const msg = stderr.includes("incorrect password") || stderr.includes("Sorry")
            ? "Wrong sudo password"
            : stderr || `Exit code ${c}`;
          reject(new Error(msg));
        }
      });
      child.on("error", reject);
      child.stdin.write(`${sudoPassword}\n`);
      child.stdin.write(scriptContent);
      child.stdin.end();
    });
    curlChild.on("error", reject);
  });
}

async function installTailscaleWindows(log: (message: string) => void) {
  const msiUrl = "https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi";
  const msiPath = pathJoin(osTmpdir(), "tailscale-setup.msi");

  log("Downloading Tailscale installer...");
  await new Promise<void>((resolve, reject) => {
    const child = spawnCmd("curl.exe", ["-L", "-#", "-o", msiPath, msiUrl], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    } as any);
    let lastPct = "";
    child.stderr.on("data", (d) => {
      const text = d.toString();
      const match = text.match(/(\d+\.\d)%/);
      if (match && match[1] !== lastPct) {
        lastPct = match[1];
        log(`Downloading... ${lastPct}%`);
      }
    });
    child.on("close", (c) => (c === 0 ? resolve() : reject(new Error("Download failed"))));
    child.on("error", reject);
  });

  log("Installing Tailscale (UAC prompt may appear)...");
  await new Promise<void>((resolve, reject) => {
    const args = `'/i','${msiPath}','TS_NOLAUNCH=true','/quiet','/norestart'`;
    const child = spawnCmd("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Start-Process msiexec -ArgumentList ${args} -Verb RunAs -Wait`,
    ], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true } as any);
    child.stderr.on("data", (d) => {
      const l = d.toString().trim();
      if (l) log(l);
    });
    child.on("close", (c) => {
      try {
        const fs = require("fs") as typeof import("fs");
        fs.unlinkSync(msiPath);
      } catch {
        // ignore
      }
      c === 0 ? resolve() : reject(new Error(`msiexec failed (code ${c})`));
    });
    child.on("error", reject);
  });

  log("Verifying installation...");
  const maxWait = 10000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (existsSync(WINDOWS_TAILSCALE_BIN)) {
      log("Installation complete.");
      return;
    }
    await new Promise<void>((r) => setTimeout(r, 1000));
  }
  throw new Error("Installation finished but tailscale.exe not found");
}

export async function installTailscaleRuntime(sudoPassword: string, hostname: string, onProgress?: (message: string) => void) {
  const log = onProgress || (() => {});
  if (IS_WINDOWS) {
    await installTailscaleWindows(log);
    return { success: true };
  }
  if (IS_MAC) await installTailscaleMac(sudoPassword, log);
  else await installTailscaleLinux(sudoPassword, log);

  log("Starting daemon...");
  await startDaemonWithPassword(sudoPassword);
  log("Logging in...");
  return startLogin(hostname);
}
