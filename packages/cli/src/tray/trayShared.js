import { exec } from "node:child_process";

/**
 * Cross-platform browser opener — extracted to break circular dep between
 * tray.js and trayWin.js.
 */
export function openBrowser(url) {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? "open" :
    platform === "win32" ? "start" :
    "xdg-open";
  try {
    exec(`${cmd} "${url}"`, { timeout: 5000 });
  } catch { /* ignore */ }
}

/**
 * Build common tray menu items — used by both Unix systray and Windows PowerShell tray.
 */
export function buildMenuItems({ port, onToggleAutostart, autostartEnabled }) {
  return [
    {
      title: `AxonRouter (Port ${port})`,
      disabled: true,
      tooltip: "AxonRouter is running",
    },
    { title: "-" }, // separator
    {
      title: "Open Dashboard",
      tooltip: "Open the AxonRouter dashboard in your browser",
      click: () => openBrowser(`http://localhost:${port}`),
    },
    {
      title: autostartEnabled ? "✓ Auto-start Enabled" : "  Auto-start Disabled",
      tooltip: autostartEnabled ? "Disable auto-start" : "Enable auto-start",
      click: () => onToggleAutostart?.(),
    },
    { title: "-" },
    {
      title: "Quit",
      tooltip: "Shut down AxonRouter",
      click: () => process.exit(0),
    },
  ];
}
