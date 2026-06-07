import { execSync, exec } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function getCliPath() {
  return fileURLToPath(import.meta.resolve("../cli.js"));
}

function getHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || "~";
}

// ── macOS (launchd) ─────────────────────────────────────────────────────────

function enableMacOS() {
  const plistPath = join(getHomeDir(), "Library", "LaunchAgents", "com.axonrouter.plist");
  const cliPath = getCliPath();
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.axonrouter</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${cliPath}</string>
    <string>--tray</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}</string>
  </dict>
</dict>
</plist>`;

  mkdirSync(join(getHomeDir(), "Library", "LaunchAgents"), { recursive: true });
  writeFileSync(plistPath, plist, "utf-8");
  execSync(`launchctl load "${plistPath}"`, { timeout: 5000 });
}

function disableMacOS() {
  const plistPath = join(getHomeDir(), "Library", "LaunchAgents", "com.axonrouter.plist");
  if (existsSync(plistPath)) {
    try {
      execSync(`launchctl unload "${plistPath}"`, { timeout: 5000 });
    } catch { /* may fail if not loaded */ }
    unlinkSync(plistPath);
  }
}

function isEnabledMacOS() {
  return existsSync(join(getHomeDir(), "Library", "LaunchAgents", "com.axonrouter.plist"));
}

// ── Windows (Startup Folder) ────────────────────────────────────────────────

function enableWindows() {
  const startupDir = join(process.env.APPDATA || join(getHomeDir(), "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
  const vbsPath = join(startupDir, "axonrouter.vbs");
  const cliPath = getCliPath();
  const vbs = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "${process.execPath} ${cliPath} --tray", 0, False`;

  mkdirSync(startupDir, { recursive: true });
  writeFileSync(vbsPath, vbs, "utf-8");
}

function disableWindows() {
  const vbsPath = join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "axonrouter.vbs");
  if (existsSync(vbsPath)) unlinkSync(vbsPath);
}

function isEnabledWindows() {
  const vbsPath = join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "axonrouter.vbs");
  return existsSync(vbsPath);
}

// ── Linux (Desktop Entry) ───────────────────────────────────────────────────

function enableLinux() {
  const autostartDir = join(getHomeDir(), ".config", "autostart");
  const desktopPath = join(autostartDir, "axonrouter.desktop");
  const cliPath = getCliPath();
  const desktop = `[Desktop Entry]
Type=Application
Name=AxonRouter
Exec=${process.execPath} ${cliPath} --tray
Path=${join(cliPath, "..")}
Terminal=false
X-GNOME-Autostart-enabled=true`;

  mkdirSync(autostartDir, { recursive: true });
  writeFileSync(desktopPath, desktop, "utf-8");
}

function disableLinux() {
  const desktopPath = join(getHomeDir(), ".config", "autostart", "axonrouter.desktop");
  if (existsSync(desktopPath)) unlinkSync(desktopPath);
}

function isEnabledLinux() {
  return existsSync(join(getHomeDir(), ".config", "autostart", "axonrouter.desktop"));
}

// ── Unified API ─────────────────────────────────────────────────────────────

export function enableAutostart() {
  const platform = process.platform;
  if (platform === "darwin") return enableMacOS();
  if (platform === "win32") return enableWindows();
  return enableLinux();
}

export function disableAutostart() {
  const platform = process.platform;
  if (platform === "darwin") return disableMacOS();
  if (platform === "win32") return disableWindows();
  return disableLinux();
}

export function isAutostartEnabled() {
  const platform = process.platform;
  if (platform === "darwin") return isEnabledMacOS();
  if (platform === "win32") return isEnabledWindows();
  return isEnabledLinux();
}
