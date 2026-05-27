#!/usr/bin/env node

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SERVICE_NAME = "axonrouter";
const SYSTEMD_UNIT_PATH = `/etc/systemd/system/${SERVICE_NAME}.service`;
const INITD_SCRIPT_PATH = `/etc/init.d/${SERVICE_NAME}`;
const PID_FILE = `/var/run/${SERVICE_NAME}.pid`;
const DEFAULT_PORT = 12711;

/**
 * Check if the current process is running as root (uid 0).
 */
export function isRoot() {
  return process.getuid() === 0;
}

/**
 * Require root privileges. Prints error and exits if not root.
 */
export function requireRoot() {
  if (!isRoot()) {
    console.error("\x1b[31m[AxonRouter] Error: Service management requires root privileges.\x1b[0m");
    console.error("\x1b[33mPlease run with sudo: sudo axonrouter install-service\x1b[0m");
    process.exit(1);
  }
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
 * Get the path to the axonrouter binary (via `which axonrouter`).
 */
export function getExecPath() {
  try {
    return execSync("which axonrouter", { encoding: "utf-8" }).trim();
  } catch {
    // Fallback to the current process argv
    return process.argv[1] || "/usr/local/bin/axonrouter";
  }
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

  const home = getInstallingUserHome(user);
  return { user, group, home };
}

/**
 * Generate systemd unit file content.
 * Uses absolute node path + script path to avoid shebang/PATH issues under systemd.
 */
export function generateSystemdUnit(execPath) {
  const nodePath = getNodePath();
  const { user, group, home } = getInstallingUser();
  const workingDirectory = path.resolve(path.dirname(execPath), "..");
  return `[Unit]
Description=AxonRouter AI Router
After=network.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
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
KillMode=control-group

[Install]
WantedBy=multi-user.target
`;
}

/**
 * Generate init.d script content (LSB format).
 * Uses absolute node path to avoid PATH issues in init environment.
 */
export function generateInitdScript(execPath) {
  const nodePath = getNodePath();
  const { user, group, home } = getInstallingUser();
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
      su - $USER -c "HOME=${home} NODE_ENV=production PORT=${DEFAULT_PORT} $NODE $DAEMON" >> "$LOG_FILE" 2>&1
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
 * Install the service (systemd or init.d).
 * Writes the service file, enables, and starts the service.
 */
export function installService() {
  const initSystem = detectInitSystem();
  const execPath = getExecPath();
  const { user, group } = getInstallingUser();

  console.log(`[AxonRouter] Detected init system: ${initSystem}`);
  console.log(`[AxonRouter] Executable path: ${execPath}`);
  console.log(`[AxonRouter] Service will run as user: ${user} (group: ${group})`);

  if (initSystem === "systemd") {
    const unitContent = generateSystemdUnit(execPath);
    // Write unit file via sudo tee (since we may not be root)
    const child = spawnSync("sudo", ["tee", SYSTEMD_UNIT_PATH], {
      input: unitContent,
      stdio: ["pipe", "pipe", "inherit"],
    });
    if (child.status !== 0) {
      console.error("[AxonRouter] Failed to write service file. Sudo access required.");
      process.exit(1);
    }
    console.log(`[AxonRouter] Service file written to ${SYSTEMD_UNIT_PATH}`);

    runWithSudo("systemctl daemon-reload");
    runWithSudo(`systemctl enable ${SERVICE_NAME}`);
    runWithSudo(`systemctl start ${SERVICE_NAME}`);
    console.log(`[AxonRouter] Service installed, enabled, and started.`);
  } else {
    const scriptContent = generateInitdScript(execPath);
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
 */
export function uninstallService() {
  const initSystem = detectInitSystem();

  console.log(`[AxonRouter] Detected init system: ${initSystem}`);

  if (initSystem === "systemd") {
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
    console.log(`[AxonRouter] Service uninstalled.`);
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
 */
export function checkService() {
  const initSystem = detectInitSystem();

  console.log(`[AxonRouter] Init system: ${initSystem}`);

  if (initSystem === "systemd") {
    const installed = fs.existsSync(SYSTEMD_UNIT_PATH);
    console.log(`[AxonRouter] Service installed: ${installed}`);

    if (installed) {
      try {
        const status = execSync(`systemctl is-active ${SERVICE_NAME}`, { encoding: "utf-8" }).trim();
        console.log(`[AxonRouter] Service status: ${status}`);
      } catch (err) {
        console.log(`[AxonRouter] Service status: inactive`);
      }

      try {
        const enabled = execSync(`systemctl is-enabled ${SERVICE_NAME}`, { encoding: "utf-8" }).trim();
        console.log(`[AxonRouter] Service enabled: ${enabled}`);
      } catch {
        console.log(`[AxonRouter] Service enabled: disabled`);
      }
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
 */
export function startService() {
  const initSystem = detectInitSystem();

  if (initSystem === "systemd") {
    runWithSudo(`systemctl start ${SERVICE_NAME}`);
  } else {
    runWithSudo(`${INITD_SCRIPT_PATH} start`);
  }

  console.log(`[AxonRouter] Service started.`);
}

/**
 * Stop the service.
 */
export function stopService() {
  const initSystem = detectInitSystem();

  if (initSystem === "systemd") {
    runWithSudo(`systemctl stop ${SERVICE_NAME}`);
  } else {
    runWithSudo(`${INITD_SCRIPT_PATH} stop`);
  }

  console.log(`[AxonRouter] Service stopped.`);
}

/**
 * Restart the service.
 */
export function restartService() {
  const initSystem = detectInitSystem();

  if (initSystem === "systemd") {
    runWithSudo(`systemctl restart ${SERVICE_NAME}`);
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
  install-service    Install and start AxonRouter as a system service
  uninstall-service  Stop and remove the system service
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
  axonrouter install-service     Install as system service (prompts for sudo)
  axonrouter check-service       Check if service is running
  axonrouter --port 3000         Start on custom port

\x1b[33mNotes:\x1b[0m
  Service commands will prompt for sudo password if not running as root.
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
