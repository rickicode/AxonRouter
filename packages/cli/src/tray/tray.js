import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMenuItems, openBrowser } from "./trayShared.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICON_VARIANTS = ["icon.png", "icon.svg", "icon.ico"];

function resolveTrayIcon(baseDir) {
  for (const variant of ICON_VARIANTS) {
    const iconPath = join(baseDir, variant);
    if (existsSync(iconPath)) return iconPath;
  }
  return "";
}

let trayProcess = null;

// ── Tray initialization ─────────────────────────────────────────────────────

export async function initTray({ port, onToggleAutostart, autostartEnabled }) {
  const platform = process.platform;

  if (platform === "linux" && !process.env.DISPLAY) {
    console.info("[Tray] Headless Linux detected (no DISPLAY env). Skipping tray initialization.");
    return null;
  }

  if (platform === "win32") {
    const { initWindowsTray } = await import("./trayWin.js");
    return initWindowsTray({ port, onToggleAutostart, autostartEnabled });
  }

  // macOS / Linux — use systray2
  return initUnixTray({ port, onToggleAutostart, autostartEnabled });
}

async function initUnixTray({ port, onToggleAutostart, autostartEnabled }) {
  try {
    const systrayModule = await import("systray2");
    const Systray = systrayModule.default?.default || systrayModule.default || systrayModule.Systray || systrayModule;
    const iconPath = resolveTrayIcon(__dirname);

    const tray = new Systray({
      icon: iconPath || "",
      title: `AxonRouter (Port ${port})`,
      tooltip: "AxonRouter is running",
    });

    const menuItems = buildMenuItems({ port, onToggleAutostart, autostartEnabled });
    const itemMap = {};

    const items = menuItems.map((item) => {
      const isSeparator = item.title === "-";
      const systrayItem = {
        title: item.title,
        tooltip: item.tooltip || "",
        checked: false,
        enabled: !item.disabled && !isSeparator,
      };
      if (!isSeparator && item.click) {
        itemMap[systrayItem.title] = item.click;
      }
      return systrayItem;
    });

    tray.on("click", (action) => {
      if (action.sealed) return;
      const clickHandler = itemMap[action.item?.title];
      if (clickHandler) clickHandler();
    });

    tray.sendAction({
      type: "update-menu",
      items,
    });

    trayProcess = tray;
    return tray;
  } catch (err) {
    console.warn("[Tray] systray2 not available:", err.message);
    return null;
  }
}

export function killTray() {
  if (trayProcess) {
    try {
      trayProcess.kill();
    } catch { /* ignore */ }
    trayProcess = null;
  }
}
