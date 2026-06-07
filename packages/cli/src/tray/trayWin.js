import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMenuItems } from "./trayShared.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICON_VARIANTS = ["icon.ico", "icon.png", "icon.svg"];

function resolveTrayIcon(baseDir) {
  for (const variant of ICON_VARIANTS) {
    const iconPath = join(baseDir, variant);
    if (existsSync(iconPath)) return iconPath;
  }
  return "";
}

let psProcess = null;
let itemIdCounter = 0;
let clickHandlers = {};

export async function initWindowsTray({ port, onToggleAutostart, autostartEnabled }) {
  const psScript = join(__dirname, "tray.ps1");
  const iconPath = resolveTrayIcon(__dirname);

  psProcess = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", psScript,
    `-IconPath "${iconPath}"`,
    `-Tooltip "AxonRouter (Port ${port})"`,
  ], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const menuItems = buildMenuItems({ port, onToggleAutostart, autostartEnabled });

  function sendCommand(cmd) {
    if (psProcess?.stdin?.writable) {
      psProcess.stdin.write(JSON.stringify(cmd) + "\n");
    }
  }

  // Listen for events from PowerShell
  let buffer = "";
  psProcess.stdout?.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === "clicked" && event.id) {
          const handler = clickHandlers[event.id];
          if (handler) handler();
        }
      } catch { /* ignore */ }
    }
  });

  // Wait for ready
  await new Promise((resolve) => {
    const onData = (chunk) => {
      if (chunk.toString().includes("ready")) {
        psProcess.stdout?.removeListener("data", onData);
        resolve();
      }
    };
    psProcess.stdout?.on("data", onData);
    // Fallback timeout
    setTimeout(resolve, 2000);
  });

  // Add menu items
  for (const item of menuItems) {
    if (item.title === "-") continue;
    const id = ++itemIdCounter;
    const action = item.click ? "none" : "none";
    sendCommand({
      type: "add-item",
      id,
      title: item.title,
      tooltip: item.tooltip || "",
      enabled: !item.disabled,
    });
    if (item.click) {
      clickHandlers[id] = item.click;
    }
  }

  // Add Quit item at the end
  const quitId = ++itemIdCounter;
  sendCommand({
    type: "add-item",
    id: quitId,
    title: "Quit",
    tooltip: "Shut down AxonRouter",
    enabled: true,
  });
  clickHandlers[quitId] = () => process.exit(0);

  sendCommand({ type: "ready" });

  return {
    sendCommand,
    updateItem: (id, updates) => sendCommand({ type: "update-item", id, ...updates }),
    setTooltip: (tooltip) => sendCommand({ type: "set-tooltip", tooltip }),
    kill: () => sendCommand({ type: "kill" }),
  };
}
