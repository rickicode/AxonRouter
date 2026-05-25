const { exec, spawn, execSync } = require("child_process");
const os = require("os");
const { isSudoAvailable, execWithPassword } = require("./dns/dnsConfig");
const {
  clearAllDnsEntries,
  readDnsStatus,
  enableDnsForTool,
  disableDnsForTool,
} = require("./dnsRuntime");
const { getServerPath } = require("./serverPathRuntime");
const {
  initPasswordStoreHooks,
  getCachedPassword,
  setCachedPassword,
  saveMitmSettings,
  clearEncryptedPassword,
  loadEncryptedPassword,
} = require("./passwordStoreRuntime");
const {
  DEFAULT_MITM_ROUTER_BASE,
  initRouterBaseHooks,
  resolveMitmRouterBaseUrl,
  setMitmRouterBaseUrl,
} = require("./routerBaseRuntime");
const {
  IS_WIN,
  getPidFilePath,
  isProcessAlive,
  killProcess,
  ensurePort443Ready,
  cleanupWindowsPort443BeforeSpawn,
  killLeftoverMitm,
} = require("./processRuntime");
const {
  readLiveOrPersistedPid,
  readPersistedPidForStop,
  persistServerPid,
  clearPersistedServerPid,
} = require("./processStateRuntime");
const {
  attachMitmProcessHandlers,
  waitForMitmHealth,
} = require("./serverProcessRuntime");
const {
  createMitmRestartState,
  shouldResetRestartCount,
  selectRestartDelay,
} = require("./restartRuntime");
const { readReusableServerPid } = require("./serverReuseRuntime");
const { buildSudoInlineCommand } = require("./spawnCommandRuntime");

let _getSettings = null;
let _updateSettings = null;
const IS_MAC = process.platform === "darwin";
const {
  initCertRuntimeHooks,
  getMitmCertStatus,
  ensureMitmRootCertReady,
  trustMitmRootCert,
} = require("./certRuntime");
const log = (msg) => console.log(`[${new Date().toLocaleTimeString("en-US", { hour12: false })}] [MITM] ${msg}`);
const err = (msg) => console.error(`[${new Date().toLocaleTimeString("en-US", { hour12: false })}] ❌ [MITM] ${msg}`);

const MITM_PORT = 443;
const MITM_WIN_NODE_PORT = 8443;

const MITM_MAX_RESTARTS = 5;
const MITM_RESTART_DELAYS_MS = [5000, 10000, 20000, 30000, 60000];
const MITM_RESTART_RESET_MS = 60000;

const restartState = createMitmRestartState();


let serverProcess = null;
let serverPid = null;

function initDbHooks(getSettingsFn, updateSettingsFn) {
  _getSettings = getSettingsFn;
  _updateSettings = updateSettingsFn;
  initPasswordStoreHooks(getSettingsFn, updateSettingsFn);
  initRouterBaseHooks(getSettingsFn, updateSettingsFn);
  initCertRuntimeHooks(getSettingsFn, updateSettingsFn);
}

/**
 * Get full MITM status including per-tool DNS status
 */
async function getMitmStatus() {
  const { running, pid } = readLiveOrPersistedPid({
    serverProcess,
    serverPid,
    getPidFilePath,
    isProcessAlive,
  });

  const dnsStatus = readDnsStatus();
  const { certExists, certTrusted } = await getMitmCertStatus();

  return { running, pid, certExists, certTrusted, dnsStatus };
}

async function scheduleMitmRestart(apiKey) {
  if (restartState.isRestarting) return;

  if (shouldResetRestartCount(restartState.lastStartTime, MITM_RESTART_RESET_MS)) {
    restartState.restartCount = 0;
  }

  if (restartState.restartCount >= MITM_MAX_RESTARTS) {
    err("Max restart attempts reached. Giving up.");
    return;
  }

  const delay = selectRestartDelay(restartState.restartCount, MITM_RESTART_DELAYS_MS);
  restartState.restartCount++;
  restartState.isRestarting = true;

  log(`Restarting in ${delay / 1000}s... (${restartState.restartCount}/${MITM_MAX_RESTARTS})`);
  await new Promise((r) => setTimeout(r, delay));

  try {
    const settings = _getSettings ? await _getSettings() : null;
    if (settings && !settings.mitmEnabled) {
      log("MITM disabled, skipping restart");
      restartState.isRestarting = false;
      return;
    }
    const password = getCachedPassword() || await loadEncryptedPassword();
    if (!password && !IS_WIN) {
      err("No cached password, cannot auto-restart");
      restartState.isRestarting = false;
      return;
    }
    await startServer(apiKey, password);
    log("🔄 Restarted successfully");
    restartState.restartCount = 0;
    restartState.isRestarting = false;
  } catch (e) {
    err(`Restart attempt ${restartState.restartCount}/${MITM_MAX_RESTARTS} failed: ${e.message}`);
    restartState.isRestarting = false;
    // Schedule next retry
    scheduleMitmRestart(apiKey);
  }
}

/**
 * Start MITM server only (cert + server, no DNS)
 */
async function startServer(apiKey, sudoPassword) {
  if (!serverProcess || serverProcess.killed) {
    const reusablePid = readReusableServerPid(getPidFilePath, isProcessAlive);
    if (reusablePid) {
      serverPid = reusablePid;
      log(`♻️ Reusing existing process (PID: ${reusablePid})`);
      await saveMitmSettings(true, sudoPassword);
      if (sudoPassword) setCachedPassword(sudoPassword);
      return { running: true, pid: reusablePid };
    }
  }

  if (serverProcess && !serverProcess.killed) {
    throw new Error("MITM server is already running");
  }

  await killLeftoverMitm(sudoPassword);

  if (!IS_WIN) {
    await ensurePort443Ready(sudoPassword, log);
  }

  // Step 1: Ensure Root CA lifecycle and trust state are ready.
  await ensureMitmRootCertReady({
    sudoPassword,
    getCachedPassword,
    loadEncryptedPassword,
    log,
  });

  // Step 2: Spawn server (Root CA already installed in Step 1.5)
  const mitmRouterBase = await resolveMitmRouterBaseUrl();
  log(`🚀 Starting server... (router: ${mitmRouterBase})`);
  if (IS_WIN) {
    cleanupWindowsPort443BeforeSpawn();
    await new Promise((r) => setTimeout(r, 500));

    // Spawn directly — process already has admin rights
    serverProcess = spawn(
      process.execPath,
      ["--experimental-strip-types", getServerPath()],
      {
        detached: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ROUTER_API_KEY: apiKey,
          NODE_ENV: "production",
          MITM_ROUTER_BASE: mitmRouterBase,
        },
      }
    );

    // certRuntime already keeps cert-installed settings in sync.
  } else if (isSudoAvailable()) {
    // Pass HOME explicitly so os.homedir() resolves to the unprivileged user's home
    // instead of /root when sudo resets the environment.
    const inlineCmd = buildSudoInlineCommand({
      homeDir: os.homedir(),
      apiKey,
      mitmRouterBase,
      execPath: process.execPath,
      serverPath: getServerPath(),
    });
    serverProcess = spawn(
      "sudo", ["-S", "-E", "sh", "-c", inlineCmd],
      { detached: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
    );
    serverProcess.stdin.write(`${sudoPassword}\n`);
    serverProcess.stdin.end();
  } else {
    // Docker/minimal images: no sudo — same as Windows-style direct spawn
    serverProcess = spawn(process.execPath, ["--experimental-strip-types", getServerPath()], {
      detached: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ROUTER_API_KEY: apiKey,
        NODE_ENV: "production",
        MITM_ROUTER_BASE: mitmRouterBase,
      },
    });
  }

  if (serverProcess) {
    serverPid = serverProcess.pid;
    persistServerPid(getPidFilePath, serverPid);
    restartState.lastStartTime = Date.now();
  }

  let startErrorReader = { getStartError: () => null };
  if (serverProcess) {
    startErrorReader = attachMitmProcessHandlers({
      serverProcess,
      isWin: IS_WIN,
      setCachedPassword,
      clearEncryptedPassword,
      setMitmIsRestarting: (value) => {
        restartState.isRestarting = value;
      },
      scheduleMitmRestart,
      resetServerRefs: () => {
        serverProcess = null;
        serverPid = null;
      },
      log,
      err,
      apiKey,
    });
  }

  const health = await waitForMitmHealth({
    timeoutMs: 8000,
    port: MITM_PORT,
    serverProcess,
    getStartError: startErrorReader.getStartError,
  });

  // certRuntime already keeps cert-installed settings in sync.

  const healthRecord = health as any;
  log(`✅ Server healthy (PID: ${serverPid || healthRecord?.pid})`);

  // Log DNS status per tool
  const dnsStatus = readDnsStatus();
  for (const [tool, active] of Object.entries(dnsStatus)) {
    log(`🌐 DNS ${tool}: ${active ? "✅ active" : "❌ inactive"}`);
  }

  await saveMitmSettings(true, sudoPassword);
  if (sudoPassword) setCachedPassword(sudoPassword);

  return { running: true, pid: serverPid };
}

/**
 * Stop MITM server — removes ALL tool DNS entries first, then kills server
 */
async function stopServer(sudoPassword) {
  // Prevent auto-restart from triggering on intentional stop
  restartState.isRestarting = true;
  restartState.restartCount = 0;
  log("⏹ Stopping server...");

  // Kill server process
  const pidToKill = readPersistedPidForStop({
    serverProcess,
    getPidFilePath,
  });

  if (pidToKill && isProcessAlive(pidToKill)) {
    log(`Killing server (PID: ${pidToKill})...`);
    killProcess(pidToKill, false, sudoPassword);
    await new Promise(r => setTimeout(r, 1000));
    if (isProcessAlive(pidToKill)) killProcess(pidToKill, true, sudoPassword);
  }
  serverProcess = null;
  serverPid = null;

  await clearAllDnsEntries(sudoPassword, err);

  clearPersistedServerPid(getPidFilePath);
  await saveMitmSettings(false, null);
  restartState.isRestarting = false;

  return { running: false, pid: null };
}

/**
 * Enable DNS for a specific tool (requires server running)
 */
async function enableToolDNS(tool, sudoPassword) {
  const status = await getMitmStatus();
  if (!status.running) throw new Error("MITM server is not running. Start the server first.");
  
  // Use cached password if not provided
  const password = sudoPassword || getCachedPassword() || await loadEncryptedPassword();
  await enableDnsForTool(tool, password);
  return { success: true };
}

/**
 * Disable DNS for a specific tool
 */
async function disableToolDNS(tool, sudoPassword) {
  // Use cached password if not provided
  const password = sudoPassword || getCachedPassword() || await loadEncryptedPassword();
  await disableDnsForTool(tool, password);
  return { success: true };
}

/**
 * Install Root CA to system trust store (standalone, no server start)
 */
async function trustCert(sudoPassword) {
  return trustMitmRootCert({
    sudoPassword,
    getCachedPassword,
    loadEncryptedPassword,
    setCachedPassword,
    log,
  });
}

// Legacy aliases for backward compatibility
const startMitm = startServer;
const stopMitm = stopServer;

module.exports = {
  getMitmStatus,
  startServer,
  stopServer,
  enableToolDNS,
  disableToolDNS,
  trustCert,
  setMitmRouterBaseUrl,
  // Legacy
  startMitm,
  stopMitm,
  getCachedPassword,
  setCachedPassword,
  loadEncryptedPassword,
  clearEncryptedPassword,
  initDbHooks,
};
