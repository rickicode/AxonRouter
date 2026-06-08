#!/usr/bin/env node

/**
 * AxonRouter CLI — Interactive Terminal UI & System Tray
 * (100% matched with AxonRouter CLI logic)
 */

import { spawn, execSync, exec } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, accessSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import https from "node:https";
import os from "node:os";
import net from "node:net";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const PKG = require("./package.json");

// ═══════════════════════════════════════════════════════════════════════════
// Native spinner - no external dependency
// ═══════════════════════════════════════════════════════════════════════════
function createSpinner(text) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  let interval = null;
  let currentText = text;
  return {
    start() {
      if (process.stdout.isTTY) {
        process.stdout.write(`\r${frames[0]} ${currentText}`);
        interval = setInterval(() => {
          process.stdout.write(`\r${frames[i++ % frames.length]} ${currentText}`);
        }, 80);
      }
      return this;
    },
    stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (process.stdout.isTTY) {
        process.stdout.write("\r\x1b[K");
      }
    },
    succeed(msg) {
      this.stop();
      console.log(`✅ ${msg}`);
    },
    fail(msg) {
      this.stop();
      console.log(`❌ ${msg}`);
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Config & Constants
// ═══════════════════════════════════════════════════════════════════════════
const APP_NAME = PKG.name || "axonrouter";
const INSTALL_CMD_LATEST = `npm i -g ${APP_NAME}@latest --prefer-online`;
const DEFAULT_PORT = 12711;
const DEFAULT_HOST = "0.0.0.0";
const MAX_RESTARTS = 2;
const RESTART_RESET_MS = 30000;

function getAppDataDir() {
  return process.platform === "win32"
    ? join(process.env.APPDATA || "", "axonrouter")
    : join(os.homedir(), ".axonrouter");
}

const DATA_DIR = getAppDataDir();

// ═══════════════════════════════════════════════════════════════════════════
// Parse arguments
// ═══════════════════════════════════════════════════════════════════════════
const args = process.argv.slice(2);
let port = DEFAULT_PORT;
let host = DEFAULT_HOST;
let noBrowser = false;
let skipUpdate = false;
let showLog = false;
let trayMode = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" || args[i] === "-p") {
    port = parseInt(args[i + 1], 10) || DEFAULT_PORT;
    i++;
  } else if (args[i] === "--host" || args[i] === "-H") {
    host = args[i + 1] || DEFAULT_HOST;
    i++;
  } else if (args[i] === "--no-browser" || args[i] === "-n") {
    noBrowser = true;
  } else if (args[i] === "--log" || args[i] === "-l") {
    showLog = true;
  } else if (args[i] === "--skip-update") {
    skipUpdate = true;
  } else if (args[i] === "--tray" || args[i] === "-t") {
    trayMode = true;
    process.env.TRAY_MODE = "1";
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log(`
Usage: ${APP_NAME} [options]

Options:
  -p, --port <port>   Port to run the server (default: ${DEFAULT_PORT})
  -H, --host <host>   Host to bind (default: ${DEFAULT_HOST})
  -n, --no-browser    Don't open browser automatically
  -l, --log           Show server logs (default: hidden)
  -t, --tray          Run in system tray mode (background)
  --skip-update       Skip auto-update check
  -h, --help          Show this help message
  -v, --version       Show version
`);
    process.exit(0);
  } else if (args[i] === "--version" || args[i] === "-v") {
    console.log(PKG.version);
    process.exit(0);
  }
}

// Auto-relaunch after update: detached process has no TTY → fallback to tray
if (skipUpdate && !trayMode && !process.stdin.isTTY) {
  trayMode = true;
  process.env.TRAY_MODE = "1";
}

const RUNTIME = process.execPath;

// ═══════════════════════════════════════════════════════════════════════════
// Update Checker
// ═══════════════════════════════════════════════════════════════════════════
function compareVersions(a, b) {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (partsA[i] > partsB[i]) return 1;
    if (partsA[i] < partsB[i]) return -1;
  }
  return 0;
}

function checkForUpdate() {
  return new Promise((resolve) => {
    if (skipUpdate) {
      resolve(null);
      return;
    }

    const spinner = createSpinner("Checking for updates...").start();
    let resolved = false;

    const safetyTimeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        spinner.stop();
        resolve(null);
      }
    }, 8000);

    const done = (version) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(safetyTimeout);
      spinner.stop();
      resolve(version);
    };

    const req = https.get(`https://registry.npmjs.org/${PKG.name}/latest`, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const latest = JSON.parse(data);
          if (latest.version && compareVersions(latest.version, PKG.version) > 0) {
            done(latest.version);
          } else {
            done(null);
          }
        } catch (e) {
          done(null);
        }
      });
    });

    req.on("error", () => done(null));
    req.on("timeout", () => { req.destroy(); done(null); });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Process Management (100% matched to AxonRouter's robust kill system)
// ═══════════════════════════════════════════════════════════════════════════
function killByPidFile(pidFile) {
  try {
    if (!existsSync(pidFile)) return;
    const pid = parseInt(readFileSync(pidFile, "utf8").trim(), 10);
    if (!pid) return;
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore", windowsHide: true, timeout: 3000 });
      } else {
        process.kill(pid, "SIGKILL");
      }
    } catch { }
    try { unlinkSync(pidFile); } catch { }
  } catch { }
}

function killTunnelByPidFile() {
  const tunnelDir = join(getAppDataDir(), "tunnel");
  killByPidFile(join(tunnelDir, "cloudflared.pid"));
  killByPidFile(join(tunnelDir, "tailscale.pid"));
}

function killCloudflaredByAppPort(appPort) {
  if (!appPort) return [];
  const portMatchers = [`localhost:${appPort}`, `127.0.0.1:${appPort}`];
  const pids = [];
  try {
    if (process.platform === "win32") {
      const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command "Get-WmiObject Win32_Process -Filter 'Name=\\"cloudflared.exe\\"' | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"`;
      const output = execSync(psCmd, { encoding: "utf8", windowsHide: true, timeout: 5000 });
      const lines = output.split("\n").slice(1).filter(l => l.trim());
      lines.forEach(line => {
        if (portMatchers.some(m => line.includes(m))) {
          const match = line.match(/^"(\d+)"/);
          if (match && match[1]) pids.push(match[1]);
        }
      });
    } else {
      const output = execSync("ps -eo pid,command 2>/dev/null", { encoding: "utf8", timeout: 5000 });
      output.split("\n").forEach(line => {
        if (line.includes("cloudflared") && portMatchers.some(m => line.includes(m))) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[0];
          if (pid && !isNaN(pid)) pids.push(pid);
        }
      });
    }
  } catch { }
  return pids;
}

function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* ignore */ }
}

function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch { return true; }
    sleepSync(100);
  }
  return false;
}

function killProxyByPidFile() {
  try {
    const pidFile = join(getAppDataDir(), "mitm", ".mitm.pid");
    if (!existsSync(pidFile)) return;
    const pid = parseInt(readFileSync(pidFile, "utf8").trim(), 10);
    if (!pid) return;

    if (process.platform === "win32") {
      try { execSync(`taskkill /T /PID ${pid}`, { stdio: "ignore", windowsHide: true, timeout: 2000 }); } catch { }
      if (!waitForExit(pid, 1500)) {
        try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore", windowsHide: true, timeout: 3000 }); } catch { }
      }
      if (!waitForExit(pid, 500)) {
        try { execSync(`powershell -NonInteractive -WindowStyle Hidden -Command "Stop-Process -Id ${pid} -Force"`, { stdio: "ignore", windowsHide: true, timeout: 3000 }); } catch { }
      }
    } else {
      try { execSync(`sudo -n kill -TERM ${pid} 2>/dev/null`, { stdio: "ignore", timeout: 2000 }); }
      catch { try { process.kill(pid, "SIGTERM"); } catch { } }
      if (!waitForExit(pid, 1500)) {
        try { execSync(`sudo -n kill -9 ${pid} 2>/dev/null`, { stdio: "ignore", timeout: 2000 }); }
        catch { try { process.kill(pid, "SIGKILL"); } catch { } }
      }
    }
    try { unlinkSync(pidFile); } catch { }
  } catch { }
}

function killAllAppProcesses(appPort) {
  return new Promise((resolve) => {
    try {
      killProxyByPidFile();
      killTunnelByPidFile();
      killByPidFile(join(DATA_DIR, "app.pid")); // AxonRouter legacy pid

      const platform = process.platform;
      let pids = [];
      pids.push(...killCloudflaredByAppPort(appPort));

      if (platform === "win32") {
        try {
          const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command "Get-WmiObject Win32_Process -Filter 'Name=\\"node.exe\\"' | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"`;
          const output = execSync(psCmd, { encoding: "utf8", windowsHide: true, timeout: 5000 });
          const lines = output.split("\n").slice(1).filter(l => l.trim());
          lines.forEach(line => {
            const cmd = line.toLowerCase();
            const isAppProcess = (cmd.includes("node") && cmd.includes(APP_NAME) && (cmd.includes("cli.js") || cmd.includes(`\\${APP_NAME}`) || cmd.includes(`/${APP_NAME}`))) || cmd.includes("next-server");
            if (isAppProcess) {
              const match = line.match(/^"(\d+)"/);
              if (match && match[1] && match[1] !== process.pid.toString()) {
                pids.push(match[1]);
              }
            }
          });
        } catch (e) { }
      } else {
        try {
          const output = execSync('ps aux 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
          const lines = output.split('\n');
          lines.forEach(line => {
            const cmd = line.toLowerCase();
            const isAppProcess = (cmd.includes("node") && cmd.includes(APP_NAME) && (cmd.includes("cli.js") || cmd.includes(`/${APP_NAME}`))) || cmd.includes("next-server");
            if (isAppProcess) {
              const parts = line.trim().split(/\s+/);
              const pid = parts[1];
              if (pid && !isNaN(pid) && pid !== process.pid.toString()) {
                pids.push(pid);
              }
            }
          });
        } catch (e) { }
      }

      if (pids.length > 0) {
        pids.forEach(pid => {
          try {
            if (platform === "win32") {
              execSync(`taskkill /F /PID ${pid} 2>nul`, { stdio: 'ignore', shell: true, windowsHide: true, timeout: 3000 });
            } else {
              execSync(`kill -9 ${pid} 2>/dev/null`, { stdio: 'ignore', timeout: 3000 });
            }
          } catch (err) { }
        });
        setTimeout(() => resolve(), 1000);
      } else {
        resolve();
      }
    } catch (err) {
      resolve();
    }
  });
}

function isPortInUse(port, host = "0.0.0.0") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") resolve(true);
      else resolve(false);
    });
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port, host);
  });
}

async function killProcessOnPort(port) {
  const inUse = await isPortInUse(port, host);
  if (!inUse) return;

  const platform = process.platform;
  let pid = null;
  try {
    if (platform === "win32") {
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8", shell: true, windowsHide: true }).trim();
      const lines = output.split("\n").filter(l => l.includes("LISTENING"));
      if (lines.length > 0) pid = lines[0].trim().split(/\s+/).pop();
    } else {
      const pidOutput = execSync(`lsof -ti:${port}`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
      if (pidOutput) pid = pidOutput.split("\n")[0];
    }
  } catch (e) {}

  if (trayMode) {
    console.error(`\n❌ Port ${port} is already in use by process ${pid || "unknown"}.`);
    console.error(`Please free the port manually.\n`);
    process.exit(1);
  }

  const { confirm, color, COLORS } = await import("./src/utils/input.js");
  const msg = pid 
    ? `Port ${port} is already in use by process ${pid}.` 
    : `Port ${port} is already in use by an unknown process.`;
    
  console.log(`\n⚠️  ${color(msg, COLORS.yellow)}`);
  
  const ans = await confirm(`Do you want to force kill it and restart?`, true);
  if (!ans) {
    console.log(color(`\nExiting. Please free port ${port} manually.`, COLORS.red));
    process.exit(1);
  }

  if (pid) {
    try {
      if (platform === "win32") {
        execSync(`taskkill /F /PID ${pid} 2>nul`, { stdio: "ignore", shell: true, windowsHide: true });
      } else {
        process.kill(parseInt(pid, 10), "SIGKILL");
      }
    } catch (err) {
      console.log(`\n❌ ${color(`Failed to kill process ${pid}.`, COLORS.red)}`);
      console.log(`${color(`Please kill it manually using:`, COLORS.cyan)}`);
      if (platform !== "win32") {
        console.log(`   sudo kill -9 ${pid}\n`);
      } else {
        console.log(`   Run terminal as Administrator and execute: taskkill /F /PID ${pid}\n`);
      }
      process.exit(1);
    }
  } else {
    console.log(`\n❌ ${color(`Cannot find PID for port ${port}.`, COLORS.red)}`);
    console.log(`${color(`Please free the port manually.`, COLORS.cyan)}\n`);
    process.exit(1);
  }

  await new Promise(r => setTimeout(r, 1000));
  const stillInUse = await isPortInUse(port, host);
  if (stillInUse) {
    console.log(`\n❌ ${color(`Port ${port} is still in use! Failed to free the port.`, COLORS.red)}`);
    console.log(`${color(`Please free the port manually. You may need sudo/Administrator privileges.`, COLORS.cyan)}\n`);
    process.exit(1);
  }
  
  console.log(`✅ ${color(`Successfully freed port ${port}.`, COLORS.green)}\n`);
}


function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  if (platform === "darwin") {
    cmd = `open "${url}"`;
  } else if (platform === "win32") {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd, { windowsHide: true }, (err) => {
    if (err) console.log(`Open browser manually: ${url}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Next.js Standalone Path Resolving (AxonRouter spec)
// ═══════════════════════════════════════════════════════════════════════════
let standaloneSynced = false;
function syncStandaloneAssets(projectRoot, standaloneServerPath) {
  if (standaloneSynced) return;
  const standaloneRoot = dirname(standaloneServerPath);
  try { accessSync(standaloneRoot, 0o2); } catch { return; }
  const pairs = [
    [join(projectRoot, ".next", "static"), join(standaloneRoot, ".next", "static")],
    [join(projectRoot, "public"), join(standaloneRoot, "public")],
    [join(projectRoot, "src", "mitm"), join(standaloneRoot, "src", "mitm")],
  ];
  for (const [src, dest] of pairs) {
    if (!existsSync(src)) continue;
    try {
      rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true, force: true });
    } catch { }
  }
  standaloneSynced = true;
}

function getServerScriptPath() {
  const standalonePath = join(__dirname, "..", "..", ".next", "standalone", "server.js");
  const startScript = join(__dirname, "..", "..", "scripts", "start.js");
  if (existsSync(standalonePath)) return { path: standalonePath, type: "standalone" };
  if (existsSync(startScript)) return { path: startScript, type: "start" };
  return { path: null, type: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// Menu System
// ═══════════════════════════════════════════════════════════════════════════
async function showInterfaceMenu(latestVersion) {
  const { selectMenu } = await import("./src/utils/input.js");
  const { getEndpoint } = await import("./src/utils/endpoint.js");
  const { COLORS, color } = await import("./src/utils/display.js");

  const displayHost = host === DEFAULT_HOST ? "localhost" : host;
  let serverUrl;
  try {
    const ep = await getEndpoint(port);
    serverUrl = ep.tunnelEnabled ? ep.url.replace(/\/v1$/, "") : `http://${displayHost}:${port}`;
  } catch (e) {
    serverUrl = `http://${displayHost}:${port}`;
  }

  const subtitle = `🚀 Server: ${color(serverUrl, COLORS.success)}`;
  const menuItems = [];

  if (latestVersion) {
    menuItems.push({ label: `⬆ Update to v${latestVersion} (current: v${PKG.version})` });
  }
  menuItems.push(
    { label: "🌐 Web UI (Open in Browser)" },
    { label: "💻 Terminal UI (Interactive CLI)" },
    { label: "🔔 Hide to Tray (Background)" },
    { label: "🚪 Exit" }
  );

  const selected = await selectMenu(`Choose Interface (v${PKG.version})`, menuItems, { header: subtitle });
  const offset = latestVersion ? 1 : 0;

  if (latestVersion && selected === 0) return "update";
  if (selected === offset) return "web";
  if (selected === offset + 1) return "terminal";
  if (selected === offset + 2) return "hide";
  return "exit";
}

// ═══════════════════════════════════════════════════════════════════════════
// Startup & Core Loop
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  let envModifier = (e) => e;
  try {
    const { ensureSqliteRuntime, buildEnvWithRuntime } = await import("./hooks/sqliteRuntime.js");
    await ensureSqliteRuntime({ silent: true });
    if (typeof buildEnvWithRuntime === "function") envModifier = buildEnvWithRuntime;
  } catch { }

  try {
    const { ensureTrayRuntime } = await import("./hooks/trayRuntime.js");
    await ensureTrayRuntime({ silent: true });
  } catch { }

  const serverInfo = getServerScriptPath();
  if (!serverInfo.path) {
    console.error("Error: Standalone build not found.");
    console.error("Please run 'npm run build:cli' first.");
    process.exit(1);
  }

  if (serverInfo.type === "standalone") {
    syncStandaloneAssets(join(__dirname, "..", ".."), serverInfo.path);
  }

  const latestVersion = await checkForUpdate();
  await killAllAppProcesses(port);
  await killProcessOnPort(port);

  startServer(latestVersion, serverInfo.path, envModifier);
}

function startServer(latestVersion, serverPath, envModifier) {
  const displayHost = host === DEFAULT_HOST ? "localhost" : host;
  const url = `http://${displayHost}:${port}/dashboard`;

  let restartCount = 0;
  let serverStartTime = Date.now();
  let crashLog = [];
  const CRASH_LOG_LINES = 50;

  function _spawnServer() {
    serverStartTime = Date.now();
    crashLog = [];
    const child = spawn(RUNTIME, ["--max-old-space-size=6144", serverPath], {
      stdio: showLog ? "inherit" : ["ignore", "ignore", "pipe"],
      detached: true,
      windowsHide: true,
      env: envModifier({
        ...process.env,
        PORT: port.toString(),
        HOSTNAME: host,
        NODE_ENV: process.env.NODE_ENV || "production"
      })
    });
    if (!showLog && child.stderr) {
      child.stderr.on("data", (data) => {
        const lines = data.toString().split("\n").filter(Boolean);
        crashLog.push(...lines);
        if (crashLog.length > CRASH_LOG_LINES) crashLog = crashLog.slice(-CRASH_LOG_LINES);
      });
    }
    return child;
  }

  let server = _spawnServer();

  let isCleaningUp = false;
  function cleanup() {
    if (isCleaningUp) return;
    isCleaningUp = true;
    try {
      try {
        const trayMod = require("./src/tray/tray.js");
        if (trayMod.killTray) trayMod.killTray();
      } catch (e) { }
      killProxyByPidFile();
      killTunnelByPidFile();
      if (server.pid) process.kill(server.pid, "SIGKILL");
      try { process.kill(-server.pid, "SIGKILL"); } catch (e) {}
    } catch (e) { }
  }

  let isShuttingDown = false;
  process.on("uncaughtException", (err) => {
    if (isShuttingDown) return;
    console.error("Error:", err.message);
  });

  process.on("SIGINT", () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log("\nExiting...");
    cleanup();
    setTimeout(() => process.exit(0), 100);
  });
  process.on("SIGTERM", () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    cleanup();
    setTimeout(() => process.exit(0), 100);
  });
  process.on("SIGHUP", () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    cleanup();
    setTimeout(() => process.exit(0), 100);
  });

  const initTrayIcon = async () => {
    try {
      const { initTray } = await import("./src/tray/tray.js");
      await initTray({
        port,
        onQuit: () => {
          isShuttingDown = true;
          console.log("\n👋 Shutting down from tray...");
          cleanup();
          setTimeout(() => process.exit(0), 100);
        },
        onOpenDashboard: () => openBrowser(url)
      });
    } catch (err) { }
  };

  if (trayMode) {
    process.removeAllListeners("SIGHUP");
    process.on("SIGHUP", () => {});
    console.log(`\n🚀 ${PKG.name} v${PKG.version}`);
    console.log(`Server: http://${displayHost}:${port}`);
    setTimeout(() => {
      initTrayIcon();
      console.log("\n💡 Router is now running in system tray. Close this terminal if you want.");
      console.log("   Right-click tray icon to open dashboard or quit.\n");
    }, 2000);
    return;
  }

  setTimeout(async () => {
    initTrayIcon();
    try {
      while (true) {
        const choice = await showInterfaceMenu(latestVersion);

        if (choice === "update") {
          isShuttingDown = true;
          console.clear();
          console.log(`\n⬆  Update v${PKG.version} → v${latestVersion}\n`);
          console.log(`Run this after exit:\n`);
          console.log(`   \x1b[33m${INSTALL_CMD_LATEST}\x1b[0m\n`);
          cleanup();
          await killAllAppProcesses(port);
          await killProcessOnPort(port);
          setTimeout(() => process.exit(0), 200);
          return;
        } else if (choice === "web") {
          openBrowser(url);
          const { pause } = await import("./src/utils/input.js");
          await pause("\nPress Enter to go back to menu...");
        } else if (choice === "terminal") {
          const { startTerminalUI } = await import("./src/terminalUI.js");
          await startTerminalUI(port);
        } else if (choice === "hide") {
          console.clear();
          try {
            const { enableAutostart } = await import("./src/tray/autostart.js");
            enableAutostart();
          } catch (e) { }

          if (process.platform === "darwin") {
            process.removeAllListeners("SIGHUP");
            process.on("SIGHUP", () => {});
            console.log(`\n⏳ Switching to tray mode... (icon already visible in menu bar)`);
            console.log(`🔔 ${APP_NAME} is running in tray (PID: ${process.pid})`);
            console.log(`   Server: http://${displayHost}:${port}`);
            console.log(`\n💡 You can close this terminal. Right-click tray icon to quit.\n`);
            return;
          }

          console.log(`\n⏳ Starting background process... (tray icon will appear in ~3s)`);
          const bgProcess = spawn(RUNTIME, [fileURLToPath(import.meta.url), "--tray", "--skip-update", "-p", port.toString()], {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
            env: { ...process.env, TRAY_MODE: "1" }
          });
          bgProcess.unref();

          console.log(`🔔 ${APP_NAME} is now running in background (PID: ${bgProcess.pid})`);
          console.log(`   Server: http://${displayHost}:${port}`);
          console.log(`\n💡 You can close this terminal. Right-click tray icon to quit.\n`);
          
          cleanup();
          process.exit(0);
        } else if (choice === "exit") {
          isShuttingDown = true;
          console.log("\nExiting...");
          cleanup();
          setTimeout(() => process.exit(0), 100);
        }
      }
    } catch (err) {
      console.error("Error:", err.message);
      cleanup();
      process.exit(1);
    }
  }, 3000);

  function attachServerEvents() {
    server.on("error", (err) => {
      console.error("Failed to start server:", err.message);
      if (!isShuttingDown) tryRestart();
      else { cleanup(); process.exit(1); }
    });
    server.on("close", (code) => {
      if (isShuttingDown || code === 0) {
        process.exit(code || 0);
        return;
      }
      tryRestart(code);
    });
  }

  function tryRestart(code) {
    const aliveMs = Date.now() - serverStartTime;
    if (aliveMs >= RESTART_RESET_MS) restartCount = 0;

    if (restartCount >= MAX_RESTARTS) {
      console.error(`\n⚠️  Server crashed ${MAX_RESTARTS} times. Disabling MIT and restarting...`);
      try {
        const dbPath = join(DATA_DIR, "db.json");
        if (existsSync(dbPath)) {
          const db = JSON.parse(readFileSync(dbPath, "utf-8"));
          if (db.settings) db.settings.mitmEnabled = false;
          writeFileSync(dbPath, JSON.stringify(db, null, 2));
        }
      } catch { }
      restartCount = 0;
      server = _spawnServer();
      attachServerEvents();
      return;
    }

    restartCount++;
    const delay = Math.min(1000 * restartCount, 10000);
    console.error(`\n⚠️  Server exited (code=${code ?? "unknown"}). Restarting in ${delay / 1000}s... (${restartCount}/${MAX_RESTARTS})`);
    if (crashLog.length) {
      console.error("\n--- Server crash log ---");
      crashLog.forEach(l => console.error(l));
      console.error("--- End crash log ---\n");
    }

    setTimeout(() => {
      server = _spawnServer();
      attachServerEvents();
    }, delay);
  }

  attachServerEvents();
}

main().catch((err) => {
  console.error(`\n✗ Fatal error:`, err.message);
  process.exit(1);
});
