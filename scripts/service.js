#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";
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
 * Generate systemd unit file content.
 */
export function generateSystemdUnit(execPath) {
  return `[Unit]
Description=AxonRouter AI Router
After=network.target

[Service]
Type=simple
ExecStart=${execPath}
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=${DEFAULT_PORT}

[Install]
WantedBy=multi-user.target
`;
}

/**
 * Generate init.d script content (LSB format).
 */
export function generateInitdScript(execPath) {
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

DAEMON="${execPath}"
PIDFILE="${PID_FILE}"
NAME="${SERVICE_NAME}"
export NODE_ENV=production
export PORT=${DEFAULT_PORT}

start() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "$NAME is already running."
    return 1
  fi
  echo "Starting $NAME..."
  nohup "$DAEMON" > /var/log/${SERVICE_NAME}.log 2>&1 &
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
  requireRoot();

  const initSystem = detectInitSystem();
  const execPath = getExecPath();

  console.log(`[AxonRouter] Detected init system: ${initSystem}`);
  console.log(`[AxonRouter] Executable path: ${execPath}`);

  if (initSystem === "systemd") {
    const unitContent = generateSystemdUnit(execPath);
    fs.writeFileSync(SYSTEMD_UNIT_PATH, unitContent, { mode: 0o644 });
    console.log(`[AxonRouter] Service file written to ${SYSTEMD_UNIT_PATH}`);

    execSync("systemctl daemon-reload", { stdio: "inherit" });
    execSync(`systemctl enable ${SERVICE_NAME}`, { stdio: "inherit" });
    execSync(`systemctl start ${SERVICE_NAME}`, { stdio: "inherit" });
    console.log(`[AxonRouter] Service installed, enabled, and started.`);
  } else {
    const scriptContent = generateInitdScript(execPath);
    fs.writeFileSync(INITD_SCRIPT_PATH, scriptContent, { mode: 0o755 });
    console.log(`[AxonRouter] Init script written to ${INITD_SCRIPT_PATH}`);

    try {
      execSync(`update-rc.d ${SERVICE_NAME} defaults`, { stdio: "inherit" });
    } catch {
      // Some systems use chkconfig instead
      try {
        execSync(`chkconfig --add ${SERVICE_NAME}`, { stdio: "inherit" });
      } catch {
        console.warn("[AxonRouter] Warning: Could not enable service at boot. Please enable it manually.");
      }
    }

    execSync(`${INITD_SCRIPT_PATH} start`, { stdio: "inherit" });
    console.log(`[AxonRouter] Service installed, enabled, and started.`);
  }
}

/**
 * Uninstall the service (stop, disable, remove).
 */
export function uninstallService() {
  requireRoot();

  const initSystem = detectInitSystem();

  console.log(`[AxonRouter] Detected init system: ${initSystem}`);

  if (initSystem === "systemd") {
    try {
      execSync(`systemctl stop ${SERVICE_NAME}`, { stdio: "inherit" });
    } catch {
      // Service might not be running
    }
    try {
      execSync(`systemctl disable ${SERVICE_NAME}`, { stdio: "inherit" });
    } catch {
      // Service might not be enabled
    }
    if (fs.existsSync(SYSTEMD_UNIT_PATH)) {
      fs.unlinkSync(SYSTEMD_UNIT_PATH);
      console.log(`[AxonRouter] Removed ${SYSTEMD_UNIT_PATH}`);
    }
    execSync("systemctl daemon-reload", { stdio: "inherit" });
    console.log(`[AxonRouter] Service uninstalled.`);
  } else {
    try {
      execSync(`${INITD_SCRIPT_PATH} stop`, { stdio: "inherit" });
    } catch {
      // Service might not be running
    }
    try {
      execSync(`update-rc.d -f ${SERVICE_NAME} remove`, { stdio: "inherit" });
    } catch {
      try {
        execSync(`chkconfig --del ${SERVICE_NAME}`, { stdio: "inherit" });
      } catch {
        // Ignore
      }
    }
    if (fs.existsSync(INITD_SCRIPT_PATH)) {
      fs.unlinkSync(INITD_SCRIPT_PATH);
      console.log(`[AxonRouter] Removed ${INITD_SCRIPT_PATH}`);
    }
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
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
  requireRoot();

  const initSystem = detectInitSystem();

  if (initSystem === "systemd") {
    execSync(`systemctl start ${SERVICE_NAME}`, { stdio: "inherit" });
  } else {
    execSync(`${INITD_SCRIPT_PATH} start`, { stdio: "inherit" });
  }

  console.log(`[AxonRouter] Service started.`);
}

/**
 * Stop the service.
 */
export function stopService() {
  requireRoot();

  const initSystem = detectInitSystem();

  if (initSystem === "systemd") {
    execSync(`systemctl stop ${SERVICE_NAME}`, { stdio: "inherit" });
  } else {
    execSync(`${INITD_SCRIPT_PATH} stop`, { stdio: "inherit" });
  }

  console.log(`[AxonRouter] Service stopped.`);
}

/**
 * Restart the service.
 */
export function restartService() {
  requireRoot();

  const initSystem = detectInitSystem();

  if (initSystem === "systemd") {
    execSync(`systemctl restart ${SERVICE_NAME}`, { stdio: "inherit" });
  } else {
    execSync(`${INITD_SCRIPT_PATH} restart`, { stdio: "inherit" });
  }

  console.log(`[AxonRouter] Service restarted.`);
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
