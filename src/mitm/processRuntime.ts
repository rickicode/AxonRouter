const { exec, execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execWithPassword } = require("./dns/dnsConfig");
const { getServerPath } = require("./serverPathRuntime");
const { MITM_DIR } = require("./paths");

const IS_WIN = process.platform === "win32";

function getPidFilePath() {
  return path.join(MITM_DIR, ".mitm.pid");
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EACCES";
  }
}

function killProcess(pid, force = false, sudoPassword = null) {
  if (IS_WIN) {
    const flag = force ? "/F " : "";
    exec(`taskkill ${flag}/PID ${pid}`, { windowsHide: true }, () => {});
  } else {
    const sig = force ? "SIGKILL" : "SIGTERM";
    const cmd = `pkill -${sig} -P ${pid} 2>/dev/null; kill -${sig} ${pid} 2>/dev/null`;
    if (sudoPassword) {
      execWithPassword(cmd, sudoPassword).catch(() => exec(cmd, { windowsHide: true }, () => {}));
    } else {
      exec(cmd, { windowsHide: true }, () => {});
    }
  }
}

function checkPort443Free(MITM_PORT) {
  return new Promise((resolve) => {
    const net = require("net");
    const tester = net.createServer();
    tester.once("error", (err) => {
      if (err.code === "EADDRINUSE") resolve("in-use");
      else resolve("no-permission");
    });
    tester.once("listening", () => {
      tester.close(() => resolve("free"));
    });
    tester.listen(MITM_PORT, "127.0.0.1");
  });
}

function getProcessUsingPort443() {
  try {
    if (IS_WIN) {
      const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command ` +
        `"$c = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $c.OwningProcess } else { 0 }"`;
      const pidStr = execSync(psCmd, { encoding: "utf8", windowsHide: true }).trim();
      const pid = parseInt(pidStr, 10);
      if (pid && pid > 4) {
        const tasklistResult = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: "utf8", windowsHide: true });
        const processMatch = tasklistResult.match(/"([^"]+)"/);
        if (processMatch) return processMatch[1].replace(".exe", "");
      }
    } else {
      const pidStr = execSync("lsof -nP -iTCP:443 -sTCP:LISTEN -t", { encoding: "utf8", windowsHide: true }).trim();
      const pid = parseInt(pidStr.split("\n")[0], 10);
      if (pid && !Number.isNaN(pid)) {
        return execSync(`ps -p ${pid} -o comm=`, { encoding: "utf8", windowsHide: true }).trim() || "unknown";
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * @returns {Promise<any>}
 */
function getPort443Owner() {
  return new Promise((resolve) => {
    if (IS_WIN) {
      const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command "$c = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $c.OwningProcess } else { 0 }"`;
      exec(psCmd, { windowsHide: true }, (err, stdout) => {
        if (err) return resolve(null);
        const pid = parseInt(stdout.trim(), 10);
        if (!pid || pid <= 4) return resolve(null);
        exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { windowsHide: true }, (_e2, out2) => {
          const m = out2?.match(/"([^"]+)"/);
          resolve({ pid, name: m ? m[1] : "unknown" });
        });
      });
    } else {
      exec("lsof -nP -iTCP:443 -sTCP:LISTEN -t", { windowsHide: true }, (err, stdout) => {
        if (err || !stdout?.trim()) return resolve(null);
        const pid = parseInt(stdout.trim().split("\n")[0], 10);
        if (!pid || Number.isNaN(pid)) return resolve(null);
        exec(`ps -p ${pid} -o comm=`, { windowsHide: true }, (_e2, out2) => {
          resolve({ pid, name: out2?.trim() || "unknown" });
        });
      });
    }
  });
}

async function ensurePort443Ready(sudoPassword, log) {
  const portStatus = await checkPort443Free(443);
  if (portStatus !== "in-use" && portStatus !== "no-permission") return;

  const ownerRecord = await /** @type {Promise<any>} */ (getPort443Owner());
  if (!ownerRecord) return;

  const ownerObj = /** @type {Record<string, unknown>} */ (Object(ownerRecord));
  const ownerName = String(ownerObj["name"] || "unknown");
  const ownerPid = Number(ownerObj["pid"] || 0);
  const ownerIsNode = ownerName === "node" || ownerName.includes("node");
  if (ownerIsNode && ownerPid > 0) {
    log?.(`Killing orphan node process on port 443 (PID ${ownerPid}, name=${ownerName})...`);
    try {
      await execWithPassword(`kill -9 ${ownerPid}`, sudoPassword);
      await new Promise((r) => setTimeout(r, 800));
      return;
    } catch {
      // best effort, fall through to explicit error
    }
  }

  const shortName = ownerName.includes("/")
    ? ownerName.split("/").filter(Boolean).pop()
    : ownerName;
  throw new Error(`Port 443 is already in use by "${shortName}" (PID ${ownerPid || "unknown"}). Stop that process first.`);
}

function cleanupWindowsPort443BeforeSpawn() {
  if (!IS_WIN) return;
  try {
    const psKill = `$c = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c -and $c.OwningProcess -gt 4) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }`;
    execSync(`powershell -NonInteractive -WindowStyle Hidden -Command "${psKill}"`, { windowsHide: true });
  } catch {
    // best effort
  }
}

async function killLeftoverMitm(serverProcess, serverPid, sudoPassword, log) {
  if (serverProcess && !serverProcess.killed) {
    try {
      serverProcess.kill("SIGKILL");
    } catch {
      // ignore
    }
  }

  try {
    if (fs.existsSync(getPidFilePath())) {
      const savedPid = parseInt(fs.readFileSync(getPidFilePath(), "utf-8").trim(), 10);
      if (savedPid && isProcessAlive(savedPid)) {
        killProcess(savedPid, true, sudoPassword);
        await new Promise((r) => setTimeout(r, 500));
      }
      fs.unlinkSync(getPidFilePath());
    }
  } catch {
    // ignore
  }

  if (!IS_WIN && getServerPath()) {
    try {
      const escaped = getServerPath().replace(/'/g, "'\\''");
      await execWithPassword(`pkill -f '${escaped}' 2>/dev/null || true`, sudoPassword || "");
    } catch {
      // ignore
    }
  }

  log?.("[MITM] Cleaned up leftover processes");
  return { serverProcess: null, serverPid: null };
}

module.exports = {
  IS_WIN,
  getPidFilePath,
  isProcessAlive,
  killProcess,
  checkPort443Free,
  getProcessUsingPort443,
  getPort443Owner,
  ensurePort443Ready,
  cleanupWindowsPort443BeforeSpawn,
  killLeftoverMitm,
};
