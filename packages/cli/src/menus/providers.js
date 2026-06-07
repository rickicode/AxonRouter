import { showMenuWithBack } from "../utils/menuHelper.js";
import { selectMenu, pause, prompt, confirm } from "../utils/input.js";
import { showStatus, showTable, color, COLORS } from "../utils/display.js";
import * as api from "../api/client.js";

async function refreshProviders() {
  try {
    const providers = await api.getProviders();
    return { providers: Array.isArray(providers) ? providers : [] };
  } catch {
    return { providers: [] };
  }
}

function providerHeader(data) {
  if (!data || !data.providers) return "";
  const total = data.providers.length;
  const active = data.providers.filter((p) => p.isActive !== false).length;
  return `  ${color(`Providers: ${total} total, ${active} active`, COLORS.dim)}`;
}

export async function showProvidersMenu(port) {
  await showMenuWithBack({
    title: "Providers",
    refresh: refreshProviders,
    headerContent: providerHeader,
    items: [
      {
        label: (data) => color(`📋 List Providers (${data?.providers?.length || 0})`, COLORS.cyan),
        action: (data) => listProviders(data),
      },
    ],
  });
}

async function listProviders(data) {
  const providers = data?.providers || [];
  if (providers.length === 0) {
    showStatus("No providers configured yet.", "warning");
    await pause();
    return;
  }

  const rows = providers.map((p) => [
    p.provider || "?",
    p.displayName || p.connectionName || p.email || "—",
    p.routingStatus || "unknown",
    p.authState || "ok",
    p.lastCheckedAt ? new Date(p.lastCheckedAt).toLocaleDateString() : "—",
  ]);

  showTable(
    ["Provider", "Name", "Status", "Auth", "Last Check"],
    rows
  );

  const selected = await selectMenu("Provider Actions", [
    { label: color("Test Connection", COLORS.cyan) },
    { label: color("Refresh", COLORS.cyan) },
  ]);

  if (selected === 0) {
    await testConnection(providers);
  }
}

async function testConnection(providers) {
  const names = providers.map((p) => `${p.provider}: ${p.displayName || p.email || p.id}`);
  const picker = await selectMenu("Select provider to test", names.map((n) => ({ label: n })));
  if (picker < 0) return;

  const provider = providers[picker];
  showStatus(`Testing ${provider.provider}...`, "info");
  try {
    const res = await api.testProvider(provider.id);
    if (res.status === 200) {
      showStatus("Connection successful!", "success");
    } else {
      showStatus(`Test failed: ${res.data?.error || res.status}`, "error");
    }
  } catch (err) {
    showStatus(`Test error: ${err.message}`, "error");
  }
  await pause();
}
