import {
  existsSync,
  mkdirSync,
  writeFileSync,
  execSyncCmd,
  spawnCmd,
  httpsGet,
  pathJoin,
  pathDirname,
  osPlatform,
  osArch,
  osTmpdir,
  resolveDataPath,
  dataFileExists,
  mkdirForData,
  createWriteStreamForData,
  createWriteStreamAbsolute,
  rmAbsolute,
  statDataFile,
  openDataFile,
  readDataFd,
  closeDataFd,
  chmodDataFile,
  unlinkDataFile,
  renameDataFile,
  rmDataPath,
} from "@axonrouter/data-dir";
import { savePid, loadPid, clearPid } from "./state";
import {
  getCloudflaredDownloadStatus,
  setCloudflaredDownloadStatus,
} from "./cloudflaredDownloadState";

const BINARY_NAME = "cloudflared";
const IS_WINDOWS = osPlatform() === "win32";
const BIN_NAME = IS_WINDOWS ? `${BINARY_NAME}.exe` : BINARY_NAME;

function getBinDir() { return resolveDataPath("bin"); }
function getBinPath() { return pathJoin(getBinDir(), BIN_NAME); }

const GITHUB_BASE_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download";

const PLATFORM_MAPPINGS = {
  darwin: {
    x64: "cloudflared-darwin-amd64.tgz",
    arm64: "cloudflared-darwin-arm64.tgz"
  },
  win32: {
    x64: "cloudflared-windows-amd64.exe",
    ia32: "cloudflared-windows-386.exe",
    arm64: "cloudflared-windows-386.exe"
  },
  linux: {
    x64: "cloudflared-linux-amd64",
    arm64: "cloudflared-linux-arm64"
  }
};

const PLATFORM_FALLBACK = {
  darwin: "cloudflared-darwin-amd64.tgz",
  win32: "cloudflared-windows-386.exe",
  linux: "cloudflared-linux-amd64"
};

function getDownloadUrl() {
  const platform = osPlatform();
  const arch = osArch();

  const platformMapping = PLATFORM_MAPPINGS[platform];
  if (!platformMapping) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const binaryName = platformMapping[arch] || PLATFORM_FALLBACK[platform];
  return `${GITHUB_BASE_URL}/${binaryName}`;
}

export function getDownloadStatus() {
  return getCloudflaredDownloadStatus();
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const destDir = pathDirname(dest);
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    // dest is always inside data dir, use createWriteStreamForData with relative path
    // But since dest is an absolute path, we need to compute relative path from data dir
    const dataDir = resolveDataPath("");
    const isInDataDir = dest.startsWith(dataDir);

    let file;
    if (isInDataDir) {
      const relPath = dest.slice(dataDir.length).replace(/^\//, "");
      file = createWriteStreamForData(relPath);
    } else {
      // For absolute paths outside data dir
      file = createWriteStreamAbsolute(dest);
    }

    httpsGet(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        file.close();
        try { if (existsSync(dest)) unlinkAbsolute(dest); } catch { /* ignore */ }
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        try { if (existsSync(dest)) unlinkAbsolute(dest); } catch { /* ignore */ }
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const totalBytes = parseInt(response.headers["content-length"], 10) || 0;
      let receivedBytes = 0;
      setCloudflaredDownloadStatus({ downloading: true, progress: 0 });

      response.on("data", (chunk) => {
        receivedBytes += chunk.length;
        if (totalBytes > 0) {
          setCloudflaredDownloadStatus({ progress: Math.round((receivedBytes / totalBytes) * 100) });
        }
      });

      response.pipe(file);

      file.on("finish", () => {
        setCloudflaredDownloadStatus({ downloading: false, progress: 100 });
        file.close(() => resolve(dest));
      });

      file.on("error", (err) => {
        setCloudflaredDownloadStatus({ downloading: false, progress: 0 });
        file.close();
        try { if (existsSync(dest)) unlinkAbsolute(dest); } catch { /* ignore */ }
        reject(err);
      });
    }).on("error", (err) => {
      setCloudflaredDownloadStatus({ downloading: false, progress: 0 });
      file.close();
      try { if (existsSync(dest)) unlinkAbsolute(dest); } catch { /* ignore */ }
      reject(err);
    });
  });
}

/** Helper to unlink an absolute path that lives in dataDir using the relative unlinkDataFile */
function unlinkAbsolute(abspath: string) {
  const dataDir = resolveDataPath("");
  if (abspath.startsWith(dataDir)) {
    unlinkDataFile(abspath.slice(dataDir.length).replace(/^\//, ""));
  }
}

/** Helper to rename absolute paths that live in dataDir */
function renameAbsolute(src: string, dst: string) {
  const dataDir = resolveDataPath("");
  if (src.startsWith(dataDir) && dst.startsWith(dataDir)) {
    renameDataFile(
      src.slice(dataDir.length).replace(/^\//, ""),
      dst.slice(dataDir.length).replace(/^\//, "")
    );
  }
}

const MIN_BINARY_SIZE = 1024 * 1024; // 1MB - cloudflared is ~30MB+

function isValidBinary(filePath) {
  try {
    const dataDir = resolveDataPath("");
    const relPath = filePath.slice(dataDir.length).replace(/^\//, "");
    const stat = statDataFile(relPath);
    if (stat.size < MIN_BINARY_SIZE) return false;
    const fd = openDataFile(relPath, "r");
    const buf = Buffer.alloc(4);
    readDataFd(fd, buf, 0, 4, 0);
    closeDataFd(fd);
    const magic = buf.toString("hex");
    if (IS_WINDOWS) return magic.startsWith("4d5a"); // PE (MZ)
    if (osPlatform() === "darwin") return magic.startsWith("cffaedfe") || magic.startsWith("cefaedfe");
    return magic.startsWith("7f454c46"); // ELF (Linux)
  } catch {
    return false;
  }
}

let downloadPromise = null;

export async function ensureCloudflared() {
  if (downloadPromise) return downloadPromise;
  downloadPromise = _ensureCloudflared().finally(() => { downloadPromise = null; });
  return downloadPromise;
}

async function _ensureCloudflared() {
  if (!dataFileExists("bin")) {
    mkdirForData("bin", { recursive: true });
  }

  // Clean up incomplete downloads from previous runs
  const binRelPath = `bin/${BIN_NAME}`;
  const tmpRelPath = `${binRelPath}.tmp`;
  if (dataFileExists(tmpRelPath)) {
    try { unlinkDataFile(tmpRelPath); } catch { /* ignore */ }
  }

  if (dataFileExists(binRelPath)) {
    if (!isValidBinary(getBinPath())) {
      console.log("[cloudflared] Invalid binary detected, re-downloading...");
      unlinkDataFile(binRelPath);
    } else {
      if (!IS_WINDOWS) chmodDataFile(binRelPath, "755");
      return getBinPath();
    }
  }

  const url = getDownloadUrl();
  const isArchive = url.endsWith(".tgz");
  const downloadDest = isArchive ? pathJoin(getBinDir(), "cloudflared.tgz.tmp") : getBinPath() + ".tmp";

  await downloadFile(url, downloadDest);

  if (isArchive) {
    execSyncCmd(`tar -xzf "${downloadDest}" -C "${getBinDir()}"`, { stdio: "pipe" } as any);
    unlinkAbsolute(downloadDest);
  } else {
    renameAbsolute(downloadDest, getBinPath());
  }

  if (!IS_WINDOWS) {
    chmodDataFile(binRelPath, "755");
  }

  return getBinPath();
}

let cloudflaredProcess = null;
let unexpectedExitHandler = null;

export function __test_buildCloudflaredExitError(code, stderrText = "") {
  const details = [];
  if (Number.isInteger(code)) details.push(`code ${code}`);

  const compact = String(stderrText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join(" | ");

  if (compact) details.push(compact);
  if (details.length === 0) return new Error("cloudflared exited unexpectedly");
  return new Error(`cloudflared exited: ${details.join(" - ")}`);
}

/** Register a callback to be called when cloudflared exits unexpectedly after connecting */
export function setUnexpectedExitHandler(handler) {
  unexpectedExitHandler = handler;
}

export async function spawnCloudflared(tunnelToken) {
  const binaryPath = await ensureCloudflared();

  const child = spawnCmd(binaryPath, ["tunnel", "run", "--dns-resolver-addrs", "1.1.1.1:53", "--token", tunnelToken], {
    detached: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  } as any);

  cloudflaredProcess = child;
  savePid(child.pid);

  return new Promise((resolve, reject) => {
    let connectionCount = 0;
    let resolved = false;
    let stderrText = "";
    const timeout = setTimeout(() => {
      resolved = true;
      resolve(child);
    }, 90000);

    const handleLog = (data) => {
      const msg = data.toString();
      const matches = msg.match(/Registered tunnel connection/g);
      if (matches) {
        connectionCount += matches.length;
        if (connectionCount >= 4 && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(child);
        }
      }
    };

    child.stdout.on("data", handleLog);
    child.stderr.on("data", (data) => {
      stderrText += data.toString();
      handleLog(data);
    });

    child.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    child.on("exit", (code) => {
      cloudflaredProcess = null;
      clearPid();
      const wasConnected = resolved;
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if (connectionCount === 0) {
          reject(__test_buildCloudflaredExitError(code, stderrText));
          return;
        }
      }
      if (wasConnected && unexpectedExitHandler) {
        unexpectedExitHandler();
      }
    });
  });
}

/**
 * Spawn cloudflared quick tunnel (no account needed)
 * Returns the generated trycloudflare.com URL
 */
export async function spawnQuickTunnel(localPort, onUrlUpdate) {
  const binaryPath = await ensureCloudflared();

  const configDir = pathJoin(osTmpdir(), `cloudflared-quick-${Date.now()}`);
  mkdirSync(configDir, { recursive: true });
  const configPath = pathJoin(configDir, "config.yml");
  writeFileSync(configPath, "# quick-tunnel config placeholder\n", "utf8");

  let isCleaned = false;
  const cleanup = () => {
    if (isCleaned) return;
    isCleaned = true;
    try {
      rmAbsolute(configDir, { recursive: true, force: true });
    } catch (e) { /* ignore */ }
  };

  const child = spawnCmd(binaryPath, ["tunnel", "--url", `http://localhost:${localPort}`, "--config", configPath, "--no-autoupdate"], {
    detached: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  } as any);

  cloudflaredProcess = child;
  savePid(child.pid);

  return new Promise((resolve, reject) => {
    let resolved = false;
    let stderrText = "";

    function getQuickTunnelUrlFromLog(message) {
      const regex = /https:\/\/([a-z0-9-]+)\.trycloudflare\.com/gi;
      const candidates = [];

      for (const match of message.matchAll(regex)) {
        const host = match[1];
        if (host === "api") continue;
        candidates.push(`https://${host}.trycloudflare.com`);
      }

      if (!candidates.length) return null;
      return candidates[candidates.length - 1];
    }

    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(new Error("Quick tunnel timed out"));
    }, 90000);

    let lastUrl = null;

    const handleLog = (data) => {
      const msg = data.toString();
      const tunnelUrl = getQuickTunnelUrlFromLog(msg);
      if (!tunnelUrl) return;

      if (!resolved) {
        resolved = true;
        lastUrl = tunnelUrl;
        clearTimeout(timeout);
        cleanup();
        resolve({ child, tunnelUrl });
        return;
      }

      if (tunnelUrl !== lastUrl) {
        lastUrl = tunnelUrl;
        if (onUrlUpdate) onUrlUpdate(tunnelUrl);
      }
    };

    child.stdout.on("data", handleLog);
    child.stderr.on("data", (data) => {
      stderrText += data.toString();
      handleLog(data);
    });

    child.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      cleanup();
      reject(err);
    });

    child.on("exit", (code) => {
      cloudflaredProcess = null;
      clearPid();
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        cleanup();
        reject(__test_buildCloudflaredExitError(code, stderrText));
        return;
      }
      if (unexpectedExitHandler) unexpectedExitHandler();
      cleanup();
    });
  });
}

export function killCloudflared() {
  if (cloudflaredProcess) {
    try {
      cloudflaredProcess.kill();
    } catch (e) { /* ignore */ }
    cloudflaredProcess = null;
  }

  const pid = loadPid();
  if (pid) {
    try {
      process.kill(pid);
    } catch (e) { /* ignore */ }
    clearPid();
  }

  // Kill any remaining cloudflared processes
  try {
    execSyncCmd("pkill -f cloudflared 2>/dev/null || true", { stdio: "ignore" } as any);
  } catch (e) { /* ignore */ }
}

export function isCloudflaredRunning() {
  const pid = loadPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}
