import { showMenuWithBack } from "./utils/menuHelper.js";
import { selectMenu, pause } from "./utils/input.js";
import { color, COLORS, showHeader } from "./utils/display.js";
import { getEndpoint, getEndpointColored } from "./utils/endpoint.js";
import * as api from "./api/client.js";
import { showProvidersMenu } from "./menus/providers.js";
import { showApiKeysMenu } from "./menus/apiKeys.js";
import { showCombosMenu } from "./menus/combos.js";
import { showCliToolsMenu } from "./menus/cliTools.js";
import { showSettingsMenu } from "./menus/settings.js";

let cachedHeader = "";
let lastHeaderRefresh = 0;

async function refreshHeader(port) {
  const now = Date.now();
  // Throttle refreshes to every 5s max
  if (cachedHeader && now - lastHeaderRefresh < 5000) return cachedHeader;

  try {
    const endpoint = await getEndpoint(port);
    const keysRes = await api.getApiKeys();
    const keysCount = Array.isArray(keysRes) ? keysRes.length : 0;
    const healthRes = await api.getHealth();
    const status = healthRes?.status === 200 ? color("● ON", COLORS.success) : color("● OFF", COLORS.error);

    const tunnelStr = endpoint.tunnelEnabled
      ? color("TUNNEL ON", COLORS.success)
      : color("TUNNEL OFF", COLORS.dim);

    const endpointStr = getEndpointColored(endpoint);
    cachedHeader = [
      `  ${color("AxonRouter", COLORS.bright)} ${status}`,
      `  ${color("Endpoint:", COLORS.dim)} ${endpointStr}`,
      `  ${color("Tunnel:", COLORS.dim)} ${tunnelStr}`,
      `  ${color("API Keys:", COLORS.dim)} ${keysCount}`,
    ].join("\n");
    lastHeaderRefresh = now;
  } catch {
    cachedHeader = [
      `  ${color("AxonRouter", COLORS.bright)} ${color("● waiting...", COLORS.yellow)}`,
      `  ${color("Server not reachable yet", COLORS.dim)}`,
    ].join("\n");
  }

  return cachedHeader;
}

export async function startTerminalUI(port) {
  showHeader("AxonRouter Terminal UI", `Port ${port}`);

  // Trigger background refresh immediately
  refreshHeader(port).catch(() => {});

  while (true) {
    const header = await refreshHeader(port);
    const waitForRefresh = new Promise((resolve) => setTimeout(resolve, 0));

    const selected = await selectMenu("📡 AxonRouter Terminal UI", [
      { label: color("Providers", COLORS.cyan), value: "providers" },
      { label: color("API Keys", COLORS.cyan), value: "apikeys" },
      { label: color("Combos", COLORS.cyan), value: "combos" },
      { label: color("CLI Tools", COLORS.cyan), value: "clitools" },
      { label: color("Settings", COLORS.cyan), value: "settings" },
    ], { header });

    await waitForRefresh;

    switch (selected) {
      case 0:
        await showProvidersMenu(port);
        break;
      case 1:
        await showApiKeysMenu(port);
        break;
      case 2:
        await showCombosMenu(port);
        break;
      case 3:
        await showCliToolsMenu(port);
        break;
      case 4:
        await showSettingsMenu(port);
        break;
      case -1:
        // User pressed q to quit — exit terminal UI
        console.log(`\n  ${color("Exiting Terminal UI...", COLORS.dim)}`);
        return;
      default:
        await pause();
    }
  }
}
