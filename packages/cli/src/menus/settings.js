import { showMenuWithBack } from "../utils/menuHelper.js";
import { selectMenu, pause, confirm } from "../utils/input.js";
import { showStatus, showBox, color, COLORS } from "../utils/display.js";
import { getEndpoint } from "../utils/endpoint.js";
import * as api from "../api/client.js";

async function refreshSettings(port) {
  try {
    const endpoint = await getEndpoint(port);
    const health = await api.getHealth();
    const tunnelStatus = await api.getTunnelStatus();
    return {
      port,
      endpoint,
      health: health?.status === 200,
      tunnelStatus,
    };
  } catch {
    return { port, health: false, tunnelStatus: null };
  }
}

function settingsHeader(data) {
  if (!data) return "";
  const healthStr = data.health
    ? color("● Server ON", COLORS.success)
    : color("● Server OFF", COLORS.error);
  const tunnelStr = data.tunnelStatus?.enabled
    ? color("Tunnel ON", COLORS.success)
    : color("Tunnel OFF", COLORS.dim);
  return [
    `  ${healthStr}`,
    `  ${color("Port:", COLORS.dim)} ${data.port}`,
    `  ${tunnelStr}`,
  ].join("\n");
}

export async function showSettingsMenu(port) {
  await showMenuWithBack({
    title: "Settings",
    refresh: () => refreshSettings(port),
    headerContent: settingsHeader,
    items: [
      {
        label: color("🔄 Toggle Tunnel", COLORS.cyan),
        action: (data) => toggleTunnel(data),
      },
      {
        label: color("🔑 Reset Dashboard Password", COLORS.yellow),
        action: () => resetPassword(),
      },
      {
        label: color("🔌 Server Status", COLORS.cyan),
        action: (data) => showServerStatus(data),
      },
    ],
  });
}

async function toggleTunnel(data) {
  const isEnabled = data?.tunnelStatus?.enabled;
  const action = isEnabled ? "disable" : "enable";
  const confirmed = await confirm(`${action === "enable" ? "Enable" : "Disable"} public tunnel?`);

  if (!confirmed) return;

  try {
    if (isEnabled) {
      await api.disableTunnel();
      showStatus("Tunnel disabled.", "success");
    } else {
      await api.enableTunnel();
      showStatus("Tunnel enabled. Public URL may take a moment.", "success");
    }
  } catch (err) {
    showStatus(`Failed to ${action} tunnel: ${err.message}`, "error");
  }
  await pause();
}

async function resetPassword() {
  const confirmed = await confirm(
    "Reset dashboard password to default?",
    false
  );

  if (!confirmed) return;

  try {
    await api.resetPassword();
    showStatus("Password reset to default. Restart server to apply.", "success");
  } catch (err) {
    showStatus(`Failed to reset password: ${err.message}`, "error");
  }
  await pause();
}

async function showServerStatus(data) {
  try {
    const version = await api.getVersion();
    showBox("Server Status", [
      `  ${color("Status:", COLORS.bright)} ${data.health ? "Running" : "Not reachable"}`,
      `  ${color("Port:", COLORS.bright)} ${data.port}`,
      `  ${color("Version:", COLORS.bright)} ${version?.data?.version || "—"}`,
      `  ${color("Tunnel:", COLORS.bright)} ${data.tunnelStatus?.enabled ? data.tunnelStatus.publicUrl || "Enabled" : "Disabled"}`,
    ].join("\n"));
  } catch {
    showStatus("Cannot reach server.", "error");
  }
  await pause();
}
