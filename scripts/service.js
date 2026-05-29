#!/usr/bin/env node
// IMPORTANT: Never chown the axonrouter package directory to root.
// This breaks native modules like better-sqlite3.

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE_NAME = "axonrouter";
const SYSTEMD_UNIT_PATH = `/etc/systemd/system/${SERVICE_NAME}.service`;
const INITD_SCRIPT_PATH = `/etc/init.d/${SERVICE_NAME}`;
const PID_FILE = `/var/run/${SERVICE_NAME}.pid`;
const DEFAULT_PORT = 12711;

const USER_SYSTEMD_DIR = path.join(os.homedir(), ".config", "systemd", "user");
const USER_UNIT_PATH = path.join(USER_SYSTEMD_DIR, `${SERVICE_NAME}.service`);

/**
 * Check if the current process is running as root (uid 0).
 */
export function isRoot() {
  return process.getuid() === 0;
}

/**
 * Run a command with sudo if not already root.
 * Prompts for password interactively when needed.
 */
export function runWithSudo(command, options = {}) {
  if (isRoot()) {
    return execSync(command, { stdio: "inherit", ...options });
  }
  return execSync(`sudo ${command}`, { stdio: "inherit", ...options });
}

/**
 * Run a command with sudo silently (capture output instead of inheriting stdio).
 */
export function runWithSudoSilent(command, options = {}) {
  if (isRoot()) {
    return execSync(command, { stdio: "pipe", ...options });
  }
  return execSync(`sudo ${command}`, { stdio: "pipe", ...options });
}

/**
 * Detect the init system available on this machine.
 * Returns "systemd" if systemctl exists, otherwise "initd".
 */
export function detectInitSystem() {
  try {
    execSync("which systemctl", { stdio: "ignore" });
    return "systemd";
  } catch {
    return "initd";
  }
}

/**
 * Get the path to the axonrouter binary resolved from import.meta.url.
 * This avoids relying on 'which axonrouter' which fails under sudo or nvm.
 */
export function getExecPath() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "..", "bin", "axonrouter.js");
}

/**
 * Get the full node binary path for use in service files.
 * systemd does not use the shell to resolve shebangs via env/nvm,
 * so we need the absolute path to node.
 */
export function getNodePath() {
  return process.execPath;
}

/**
 * Resolve the home directory for a given user.
 * When SUDO_USER is set, tries /etc/passwd lookup, then falls back to /home/<user>.
 * For root, returns /root. Otherwise falls back to os.homedir().
 */
export function getInstallingUserHome(user) {
  if (user === "root") {
    return "/root";
  }

  // Try to read from /etc/passwd
  try {
    const passwd = fs.readFileSync("/etc/passwd", "utf-8");
    const lines = passwd.split("\n");
    for (const line of lines) {
      const fields = line.split(":");
      if (fields[0] === user && fields[5]) {
        return fields[5];
      }
    }
  } catch {
    // /etc/passwd not readable, fall through
  }

  // Fall back to /home/<user> if SUDO_USER is set
  if (process.env.SUDO_USER) {
    return `/home/${user}`;
  }

  return os.homedir();
}

/**
 * Detect the real (non-root) user who invoked the install command.
 * When run via sudo, reads SUDO_USER and SUDO_GID for the original user.
 * Otherwise uses os.userInfo() for the current user.
 * Returns { user, group, home }.
 */
export function getInstallingUser() {
  const sudoUser = process.env.SUDO_USER;

  if (sudoUser) {
    let group = process.env.SUDO_GID || String(os.userInfo().gid);
    // Try to resolve group name from GID via /etc/group
    try {
      const groupFile = fs.readFileSync("/etc/group", "utf-8");
      const lines = groupFile.split("\n");
      for (const line of lines) {
        const fields = line.split(":");
        if (fields[2] === group) {
          group = fields[0];
          break;
        }
      }
    } catch {
      // If we can't resolve the group name, use the username as group
      group = sudoUser;
    }

    // If group is still numeric (GID didn't resolve), fall back to username
    if (/^\d+$/.test(group)) {
      group = sudoUser;
    }

    const home = getInstallingUserHome(sudoUser);
    return { user: sudoUser, group, home };
  }

  const info = os.userInfo();
  const user = info.username;
  let group = String(info.gid);

  // Try to resolve group name from GID via /etc/group
  try {
    const groupFile = fs.readFileSync("/etc/group", "utf-8");
    const lines = groupFile.split("\n");
    for (const line of lines) {
      const fields = line.split(":");
      if (fields[2] === group) {
        group = fields[0];
        break;
      }
    }
  } catch {
    // Fall back to username as group
    group = user;
  }

  // If group is still numeric (GID didn't resolve), fall back to username
  if (/^\d+$/.test(group)) {
    group = user;
  }

  const home = getInstallingUserHome(user);
  return { user, group, home };
}

/**
 * Generate systemd unit file content.
 * Uses absolute node path + script path to avoid shebang/PATH issues under systemd.
 * Accepts an optional userInfo parameter to avoid repeated getInstallingUser() calls.
 * When userMode is true, omits User=/Group= and uses WantedBy=default.target.
 */
export function generateSystemdUnit(execPath, userInfo, options = {}) {
  const nodePath = getNodePath();
  const { user, group, home } = userInfo || getInstallingUser();
  const workingDirectory = path.resolve(path.dirname(execPath), "..");
  const userMode = options.userMode || false;

  let serviceSection;
  if (userMode) {
    serviceSection = `[Service]
Type=simple
WorkingDirectory=${workingDirectory}
ExecStart=${nodePath} ${execPath}
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=${DEFAULT_PORT}
Environment=HOME=${home}
# Graceful shutdown timeout
TimeoutStopSec=30
# Kill remaining child processes (cloudflared, tailscaled) on stop
KillMode=control-group`;
  } else {
    serviceSection = `[Service]
Type=simple
User=${user}
Group=${group}
WorkingDirectory=${workingDirectory}
ExecStart=${nodePath} ${execPath}
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=${DEFAULT_PORT}
Environment=HOME=${home}
# Graceful shutdown timeout
TimeoutStopSec=30
# Kill remaining child processes (cloudflared, tailscaled) on stop
KillMode=control-group`;
  }

  const wantedBy = userMode ? "default.target" : "multi-user.target";

  return `[Unit]
Description=AxonRouter AI Router
After=network.target
StartLimitIntervalSec=300
StartLimitBurst=5

${serviceSection}

[Install]
WantedBy=${wantedBy}
`;
}

/**
 * Generate init.d script content (LSB format).
 * Uses absolute node path to avoid PATH issues in init environment.
 * Accepts an optional userInfo parameter to avoid repeated getInstallingUser() calls.
 */
export function generateInitdScript(execPath, userInfo) {
  const nodePath = getNodePath();
  const { user, group, home } = userInfo || getInstallingUser();
  return `#!/bin/sh
### BEGIN INIT INFO
# Provides:          ${SERVICE_NAME}
# Required-Start:    $network $remote_fs
# Required-Stop:     $network $remote_fs
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: AxonRouter AI Router
# Description:       AxonRouter AI Router service
### END INIT INFO

NODE="${nodePath}"
DAEMON="${execPath}"
PIDFILE="${PID_FILE}"
NAME="${SERVICE_NAME}"
LOG_FILE="/var/log/${SERVICE_NAME}.log"
USER="${user}"
GROUP="${group}"
export NODE_ENV=production
export PORT=${DEFAULT_PORT}
export HOME=${home}

start() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "$NAME is already running."
    return 1
  fi
  echo "Starting $NAME as user $USER..."
  # Start with auto-respawn: restart up to 10 times with 5s delay if process exits
  (
    RESTART_COUNT=0
    MAX_RESTARTS=10
    while [ $RESTART_COUNT -lt $MAX_RESTARTS ]; do
      su - "$USER" -c "HOME='${home}' NODE_ENV=production PORT=${DEFAULT_PORT} '${nodePath}' '${execPath}'" >> "$LOG_FILE" 2>&1
      EXIT_CODE=$?
      if [ $EXIT_CODE -eq 0 ]; then
        break
      fi
      RESTART_COUNT=$((RESTART_COUNT + 1))
      echo "$(date) - $NAME exited with code $EXIT_CODE, restarting ($RESTART_COUNT/$MAX_RESTARTS)..." >> "$LOG_FILE"
      sleep 5
    done
    rm -f "$PIDFILE"
  ) &
  echo $! > "$PIDFILE"
  echo "$NAME started."
}

stop() {
  if [ ! -f "$PIDFILE" ] || ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "$NAME is not running."
    return 1
  fi
  echo "Stopping $NAME..."
  kill "$(cat "$PIDFILE")"
  rm -f "$PIDFILE"
  echo "$NAME stopped."
}

restart() {
  stop
  sleep 1
  start
}

status() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "$NAME is running (PID: $(cat "$PIDFILE"))."
  else
    echo "$NAME is not running."
    return 1
  fi
}

case "$1" in
  start)   start ;;
  stop)    stop ;;
  restart) restart ;;
  status)  status ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac

exit 0
`;
}

/**
 * Check if the user session bus is available for systemctl --user commands.
 * Returns true if the session bus is accessible, false otherwise.
 */
export function isUserSessionAvailable() {
  if (process.env.XDG_RUNTIME_DIR || process.env.DBUS_SESSION_BUS_ADDRESS) {
    return true;
  }
  // Try running systemctl --user as a final check
  try {
    execSync("systemctl --user --no-pager status", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the user-level unit path for a specific user.
 * When running as root with SUDO_USER set, resolves to that user's home.
 */
export function getUserUnitPath(targetUser) {
  if (targetUser) {
    const home = getInstallingUserHome(targetUser);
    return path.join(home, ".config", "systemd", "user", `${SERVICE_NAME}.service`);
  }
  return USER_UNIT_PATH;
}

/**
 * Install the service (systemd or init.d).
 * Always installs as user-level systemd service, even when running as root.
 * When running as root, detects SUDO_USER and installs for that user's session.
 * For init.d, always uses sudo (no user-level support).
 */
export function installService() {
  const initSystem = detectInitSystem();
  const execPath = getExecPath();
  const { user, group } = getInstallingUser();

  console.log(`[AxonRouter] Detected init system: ${initSystem}`);
  console.log(`[AxonRouter] Executable path: ${execPath}`);
  console.log(`[AxonRouter] Service will run as user: ${user} (group: ${group})`);

  const userInfo = { user, group, home: getInstallingUserHome(user) };

  if (initSystem === "systemd") {
    // Always install user-level service, regardless of whether running as root
    const unitContent = generateSystemdUnit(execPath, userInfo, { userMode: true });
    const targetUnitPath = getUserUnitPath(user);
    const targetUnitDir = path.dirname(targetUnitPath);

    if (isRoot()) {
      // Running as root with SUDO_USER - install for that user
      // Create the directory as the target user
      execSync(`sudo -u ${user} mkdir -p ${targetUnitDir}`, { stdio: "inherit" });
      // Write the unit file
      const child = spawnSync("sudo", ["-u", user, "tee", targetUnitPath], {
        input: unitContent,
        stdio: ["pipe", "pipe", "inherit"],
      });
      if (child.status !== 0) {
        console.error("[AxonRouter] Failed to write user service file.");
        process.exit(1);
      }
      console.log(`[AxonRouter] Service file written to ${targetUnitPath}`);

      // Enable linger for the user
      try {
        execSync(`loginctl enable-linger ${user}`, { stdio: "inherit" });
        console.log(`[AxonRouter] Enabled linger for user ${user}`);
      } catch {
        console.warn(`[AxonRouter] Warning: Could not enable linger. Run: sudo loginctl enable-linger ${user}`);
      }

      // Reload and start as the user
      const uid = execSync(`id -u ${user}`, { encoding: "utf-8" }).trim();
      const xdgRuntime = `/run/user/${uid}`;
      const userSystemctl = `sudo -u ${user} XDG_RUNTIME_DIR=${xdgRuntime} systemctl --user`;

      execSync(`${userSystemctl} daemon-reload`, { stdio: "inherit" });
      execSync(`${userSystemctl} enable ${SERVICE_NAME}`, { stdio: "inherit" });
      execSync(`${userSystemctl} start ${SERVICE_NAME}`, { stdio: "inherit" });
    } else {
      // Running as the user directly
      if (!isUserSessionAvailable()) {
        console.error(`[AxonRouter] ERROR: User session bus is not available.`);
        console.error(`[AxonRouter] systemctl --user requires an active user session or lingering enabled.`);
        console.error(`[AxonRouter] To fix this, run: sudo loginctl enable-linger ${user}`);
        process.exit(1);
      }

      fs.mkdirSync(targetUnitDir, { recursive: true });
      fs.writeFileSync(targetUnitPath, unitContent);
      console.log(`[AxonRouter] Service file written to ${targetUnitPath}`);

      execSync("systemctl --user daemon-reload", { stdio: "inherit" });
      execSync(`systemctl --user enable ${SERVICE_NAME}`, { stdio: "inherit" });
      execSync(`systemctl --user start ${SERVICE_NAME}`, { stdio: "inherit" });

      // Try to enable linger
      try {
        execSync(`sudo loginctl enable-linger ${user}`, { stdio: "inherit" });
        console.log(`[AxonRouter] Enabled linger for user ${user}`);
      } catch {
        console.log(`[AxonRouter] To start at boot without login, run: sudo loginctl enable-linger ${user}`);
      }
    }

    console.log(`[AxonRouter] User-level service installed, enabled, and started.`);
  } else {
    // init.d has no user-level support, requires sudo
    console.log(`[AxonRouter] init.d does not support user-level services; sudo is required.`);
    const scriptContent = generateInitdScript(execPath, userInfo);
    const child = spawnSync("sudo", ["tee", INITD_SCRIPT_PATH], {
      input: scriptContent,
      stdio: ["pipe", "pipe", "inherit"],
    });
    if (child.status !== 0) {
      console.error("[AxonRouter] Failed to write init script. Sudo access required.");
      process.exit(1);
    }
    runWithSudo(`chmod 755 ${INITD_SCRIPT_PATH}`);
    console.log(`[AxonRouter] Init script written to ${INITD_SCRIPT_PATH}`);

    try {
      runWithSudo(`update-rc.d ${SERVICE_NAME} defaults`);
    } catch {
      try {
        runWithSudo(`chkconfig --add ${SERVICE_NAME}`);
      } catch {
        console.warn("[AxonRouter] Warning: Could not enable service at boot.");
      }
    }

    runWithSudo(`${INITD_SCRIPT_PATH} start`);
    console.log(`[AxonRouter] Service installed, enabled, and started.`);
  }
}

/**
 * Uninstall the service (stop, disable, remove).
 * Always targets user-level service. When running as root, checks SUDO_USER's unit path.
 * Also checks for old system-level installs and removes them for migration.
 */
export function uninstallService() {
  const initSystem = detectInitSystem();

  console.log(`[AxonRouter] Detected init system: ${initSystem}`);

  if (initSystem === "systemd") {
    // When running as root with SUDO_USER, check that user's unit path too
    const sudoUser = process.env.SUDO_USER;
    const effectiveUserUnitPath = (isRoot() && sudoUser)
      ? getUserUnitPath(sudoUser)
      : USER_UNIT_PATH;

    const userLevelExists = fs.existsSync(effectiveUserUnitPath);
    const systemLevelExists = fs.existsSync(SYSTEMD_UNIT_PATH);

    if (userLevelExists && !isRoot()) {
      // Uninstall user-level service (current user)
      try {
        execSync(`systemctl --user stop ${SERVICE_NAME}`, { stdio: "inherit" });
      } catch {
        // Service might not be running
      }
      try {
        execSync(`systemctl --user disable ${SERVICE_NAME}`, { stdio: "inherit" });
      } catch {
        // Service might not be enabled
      }
      try {
        fs.unlinkSync(USER_UNIT_PATH);
        console.log(`[AxonRouter] Removed ${USER_UNIT_PATH}`);
      } catch {
        // File might not exist
      }
      execSync("systemctl --user daemon-reload", { stdio: "inherit" });
      console.log(`[AxonRouter] User-level service uninstalled.`);
    } else if (userLevelExists && isRoot() && sudoUser) {
      // Root is uninstalling a user-level service owned by SUDO_USER
      const uid = execSync(`id -u ${sudoUser}`, { encoding: "utf-8" }).trim();
      const xdgRuntime = `/run/user/${uid}`;
      const userSystemctl = `sudo -u ${sudoUser} XDG_RUNTIME_DIR=${xdgRuntime} systemctl --user`;

      try {
        execSync(`${userSystemctl} stop ${SERVICE_NAME}`, { stdio: "inherit" });
      } catch {
        // Service might not be running
      }
      try {
        execSync(`${userSystemctl} disable ${SERVICE_NAME}`, { stdio: "inherit" });
      } catch {
        // Service might not be enabled
      }
      try {
        fs.unlinkSync(effectiveUserUnitPath);
        console.log(`[AxonRouter] Removed ${effectiveUserUnitPath}`);
      } catch {
        // File might not exist
      }
      try {
        execSync(`${userSystemctl} daemon-reload`, { stdio: "inherit" });
      } catch {
        // daemon-reload may fail if session not available, but file is already removed
      }
      console.log(`[AxonRouter] User-level service for ${sudoUser} uninstalled.`);
    } else if (!userLevelExists) {
      console.log(`[AxonRouter] No user-level service found to uninstall.`);
    }

    // Migration: also remove old system-level install if found
    if (systemLevelExists) {
      console.log(`[AxonRouter] Found old system-level service at ${SYSTEMD_UNIT_PATH}, removing...`);
      try {
        runWithSudo(`systemctl stop ${SERVICE_NAME}`);
      } catch {
        // Service might not be running
      }
      try {
        runWithSudo(`systemctl disable ${SERVICE_NAME}`);
      } catch {
        // Service might not be enabled
      }
      try {
        runWithSudo(`rm -f ${SYSTEMD_UNIT_PATH}`);
        console.log(`[AxonRouter] Removed ${SYSTEMD_UNIT_PATH}`);
      } catch {
        // File might not exist
      }
      runWithSudo("systemctl daemon-reload");
      console.log(`[AxonRouter] Old system-level service removed.`);
    }
  } else {
    try {
      runWithSudo(`${INITD_SCRIPT_PATH} stop`);
    } catch {
      // Service might not be running
    }
    try {
      runWithSudo(`update-rc.d -f ${SERVICE_NAME} remove`);
    } catch {
      try {
        runWithSudo(`chkconfig --del ${SERVICE_NAME}`);
      } catch {
        // Ignore
      }
    }
    try {
      runWithSudo(`rm -f ${INITD_SCRIPT_PATH}`);
      console.log(`[AxonRouter] Removed ${INITD_SCRIPT_PATH}`);
    } catch {
      // File might not exist
    }
    try {
      runWithSudo(`rm -f ${PID_FILE}`);
    } catch {
      // Ignore
    }
    console.log(`[AxonRouter] Service uninstalled.`);
  }
}

/**
 * Check the status of the service.
 * Primary target is user-level service. Also reports system-level if found (for migration visibility).
 */
export function checkService() {
  const initSystem = detectInitSystem();

  console.log(`[AxonRouter] Init system: ${initSystem}`);

  if (initSystem === "systemd") {
    const sudoUser = process.env.SUDO_USER;
    const effectiveUserUnitPath = (isRoot() && sudoUser)
      ? getUserUnitPath(sudoUser)
      : USER_UNIT_PATH;

    const userLevelExists = fs.existsSync(effectiveUserUnitPath);
    const systemLevelExists = fs.existsSync(SYSTEMD_UNIT_PATH);

    if (userLevelExists) {
      console.log(`[AxonRouter] User-level service installed: ${effectiveUserUnitPath}`);

      if (isRoot() && sudoUser) {
        const uid = execSync(`id -u ${sudoUser}`, { encoding: "utf-8" }).trim();
        const xdgRuntime = `/run/user/${uid}`;
        const userSystemctl = `sudo -u ${sudoUser} XDG_RUNTIME_DIR=${xdgRuntime} systemctl --user`;

        try {
          const status = execSync(`${userSystemctl} is-active ${SERVICE_NAME}`, { encoding: "utf-8" }).trim();
          console.log(`[AxonRouter] Service status: ${status}`);
        } catch {
          console.log(`[AxonRouter] Service status: inactive`);
        }
        try {
          const enabled = execSync(`${userSystemctl} is-enabled ${SERVICE_NAME}`, { encoding: "utf-8" }).trim();
          console.log(`[AxonRouter] Service enabled: ${enabled}`);
        } catch {
          console.log(`[AxonRouter] Service enabled: disabled`);
        }
      } else {
        try {
          const status = execSync(`systemctl --user is-active ${SERVICE_NAME}`, { encoding: "utf-8" }).trim();
          console.log(`[AxonRouter] Service status: ${status}`);
        } catch {
          console.log(`[AxonRouter] Service status: inactive`);
        }
        try {
          const enabled = execSync(`systemctl --user is-enabled ${SERVICE_NAME}`, { encoding: "utf-8" }).trim();
          console.log(`[AxonRouter] Service enabled: ${enabled}`);
        } catch {
          console.log(`[AxonRouter] Service enabled: disabled`);
        }
      }
    }

    if (systemLevelExists) {
      console.log(`[AxonRouter] (Legacy) System-level service found: ${SYSTEMD_UNIT_PATH}`);
      console.log(`[AxonRouter] Consider removing with: sudo systemctl disable --now axonrouter && sudo rm ${SYSTEMD_UNIT_PATH}`);
      try {
        const status = execSync(`systemctl is-active ${SERVICE_NAME}`, { encoding: "utf-8" }).trim();
        console.log(`[AxonRouter] System service status: ${status}`);
      } catch {
        console.log(`[AxonRouter] System service status: inactive`);
      }
    }

    if (!userLevelExists && !systemLevelExists) {
      console.log(`[AxonRouter] Service installed: false`);
    }
  } else {
    const installed = fs.existsSync(INITD_SCRIPT_PATH);
    console.log(`[AxonRouter] Service installed: ${installed}`);

    if (installed) {
      try {
        execSync(`${INITD_SCRIPT_PATH} status`, { stdio: "inherit" });
      } catch {
        console.log(`[AxonRouter] Service status: stopped`);
      }
    }
  }
}

/**
 * Start the service.
 * Always operates on user-level service.
 * When running as root with SUDO_USER, starts as that user.
 */
export function startService() {
  const initSystem = detectInitSystem();

  if (initSystem === "systemd") {
    const sudoUser = process.env.SUDO_USER;

    if (isRoot() && sudoUser) {
      const uid = execSync(`id -u ${sudoUser}`, { encoding: "utf-8" }).trim();
      const xdgRuntime = `/run/user/${uid}`;
      execSync(`sudo -u ${sudoUser} XDG_RUNTIME_DIR=${xdgRuntime} systemctl --user start ${SERVICE_NAME}`, { stdio: "inherit" });
    } else {
      execSync(`systemctl --user start ${SERVICE_NAME}`, { stdio: "inherit" });
    }
  } else {
    runWithSudo(`${INITD_SCRIPT_PATH} start`);
  }

  console.log(`[AxonRouter] Service started.`);
}

/**
 * Stop the service.
 * Always operates on user-level service.
 * When running as root with SUDO_USER, stops as that user.
 */
export function stopService() {
  const initSystem = detectInitSystem();

  if (initSystem === "systemd") {
    const sudoUser = process.env.SUDO_USER;

    if (isRoot() && sudoUser) {
      const uid = execSync(`id -u ${sudoUser}`, { encoding: "utf-8" }).trim();
      const xdgRuntime = `/run/user/${uid}`;
      execSync(`sudo -u ${sudoUser} XDG_RUNTIME_DIR=${xdgRuntime} systemctl --user stop ${SERVICE_NAME}`, { stdio: "inherit" });
    } else {
      execSync(`systemctl --user stop ${SERVICE_NAME}`, { stdio: "inherit" });
    }
  } else {
    runWithSudo(`${INITD_SCRIPT_PATH} stop`);
  }

  console.log(`[AxonRouter] Service stopped.`);
}

/**
 * Restart the service.
 * Always operates on user-level service.
 * When running as root with SUDO_USER, restarts as that user.
 */
export function restartService() {
  const initSystem = detectInitSystem();

  if (initSystem === "systemd") {
    const sudoUser = process.env.SUDO_USER;

    if (isRoot() && sudoUser) {
      const uid = execSync(`id -u ${sudoUser}`, { encoding: "utf-8" }).trim();
      const xdgRuntime = `/run/user/${uid}`;
      execSync(`sudo -u ${sudoUser} XDG_RUNTIME_DIR=${xdgRuntime} systemctl --user restart ${SERVICE_NAME}`, { stdio: "inherit" });
    } else {
      execSync(`systemctl --user restart ${SERVICE_NAME}`, { stdio: "inherit" });
    }
  } else {
    runWithSudo(`${INITD_SCRIPT_PATH} restart`);
  }

  console.log(`[AxonRouter] Service restarted.`);
}

/**
 * Show help message with available commands.
 */
export function showHelp() {
  let version = "unknown";
  try {
    const pkgUrl = new URL("../package.json", import.meta.url);
    version = JSON.parse(fs.readFileSync(pkgUrl, "utf8")).version;
  } catch {}

  console.log(`
\x1b[1mAxonRouter v${version} - AI Router\x1b[0m

\x1b[33mUsage:\x1b[0m
  axonrouter <command> [options]

\x1b[33mService Commands:\x1b[0m
  install-service    Install AxonRouter as a user-level systemd service
  uninstall-service  Stop and remove the service
  check-service      Check current service status
  start              Start the service
  stop               Stop the service
  restart            Restart the service

\x1b[33mOther Commands:\x1b[0m
  mcp                Start MCP stdio server
  help, --help       Show this help message

\x1b[33mOptions:\x1b[0m
  --port <port>      Set the listening port (default: 12711)
  --hostname <host>  Set the hostname to bind to

\x1b[33mExamples:\x1b[0m
  axonrouter                     Start in foreground
  axonrouter install-service     Install as user-level service
  axonrouter check-service       Check if service is running
  axonrouter --port 3000         Start on custom port

\x1b[33mNotes:\x1b[0m
  Service always installs as user-level systemd unit (~/.config/systemd/user/).
  Use installer.sh for system-level service installation (when run as root).
  The service auto-restarts on crash (systemd: always, init.d: up to 10 times).
`);
}

/**
 * Map of command names to handler functions.
 */
export const SERVICE_COMMANDS = {
  "install-service": installService,
  "uninstall-service": uninstallService,
  "check-service": checkService,
  "start": startService,
  "stop": stopService,
  "restart": restartService,
  "help": showHelp,
  "--help": showHelp,
};

/**
 * Handle a service command by name. Returns true if handled.
 */
export function handleServiceCommand(command) {
  const handler = SERVICE_COMMANDS[command];
  if (handler) {
    handler();
    return true;
  }
  return false;
}
