import os from "os";
import { resolveDataPath, dataFileExists, execSyncCmd } from "@axonrouter/data-dir";
const IS_WINDOWS = os.platform() === "win32";
const SEP = IS_WINDOWS ? "\\" : "/";
function getTailscaleBinPath() {
    return resolveDataPath("bin", IS_WINDOWS ? "tailscale.exe" : "tailscale");
}
function getTailscaleDir() {
    return resolveDataPath("tailscale");
}
function getTailscaleSocket() {
    return getTailscaleDir() + SEP + "tailscaled.sock";
}
function getSocketFlag() {
    return IS_WINDOWS ? [] : ["--socket", getTailscaleSocket()];
}
const WINDOWS_TAILSCALE_BIN = "C:\\Program Files\\Tailscale\\tailscale.exe";
const EXTENDED_PATH = `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${process.env.PATH || ""}`;
function getTailscaleBin() {
    try {
        const systemPath = execSyncCmd("which tailscale 2>/dev/null || where tailscale 2>nul", {
            encoding: "utf8",
            windowsHide: true,
        }).trim();
        if (systemPath)
            return systemPath;
    }
    catch {
        // not in PATH
    }
    const binPath = getTailscaleBinPath();
    if (dataFileExists(binPath))
        return binPath;
    if (IS_WINDOWS && dataFileExists(WINDOWS_TAILSCALE_BIN))
        return WINDOWS_TAILSCALE_BIN;
    return null;
}
export function isTailscaleInstalled() {
    return getTailscaleBin() !== null;
}
export function isTailscaleLoggedIn() {
    const bin = getTailscaleBin();
    if (!bin)
        return false;
    try {
        const out = execSyncCmd(`"${bin}" ${getSocketFlag().join(" ")} status --json`, {
            encoding: "utf8",
            windowsHide: true,
            env: { ...process.env, PATH: EXTENDED_PATH },
            timeout: 5000,
        });
        const json = JSON.parse(out);
        return json.BackendState === "Running";
    }
    catch {
        return false;
    }
}
export function isTailscaleRunning() {
    const bin = getTailscaleBin();
    if (!bin)
        return false;
    try {
        const out = execSyncCmd(`"${bin}" ${getSocketFlag().join(" ")} funnel status --json 2>/dev/null`, {
            encoding: "utf8",
            windowsHide: true,
            env: { ...process.env, PATH: EXTENDED_PATH },
            timeout: 5000,
        });
        const json = JSON.parse(out);
        return Object.keys(json.AllowFunnel || {}).length > 0;
    }
    catch {
        return false;
    }
}
export function isTailscaleDaemonRunning() {
    const bin = getTailscaleBin();
    if (!bin)
        return false;
    try {
        execSyncCmd(`"${bin}" ${getSocketFlag().join(" ")} status --json`, {
            stdio: "ignore",
            windowsHide: true,
            env: { ...process.env, PATH: EXTENDED_PATH },
            timeout: 3000,
        });
        return true;
    }
    catch {
        try {
            execSyncCmd("pgrep -x tailscaled", { stdio: "ignore", windowsHide: true, timeout: 2000 });
            return true;
        }
        catch {
            return false;
        }
    }
}
export function getTailscaleFunnelUrl(_port) {
    const bin = getTailscaleBin();
    if (!bin)
        return null;
    try {
        const out = execSyncCmd(`"${bin}" ${getSocketFlag().join(" ")} status --json`, {
            encoding: "utf8",
            windowsHide: true,
        });
        const json = JSON.parse(out);
        const dnsName = json.Self?.DNSName?.replace(/\.$/, "");
        if (dnsName)
            return `https://${dnsName}`;
    }
    catch {
        // ignore
    }
    return null;
}
