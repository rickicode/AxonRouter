import { showMenuWithBack } from "../utils/menuHelper.js";
import { selectMenu, pause, prompt, confirm } from "../utils/input.js";
import { showStatus, showTable, color, COLORS } from "../utils/display.js";
import { maskKey, formatDate } from "../utils/format.js";
import { copyToClipboard } from "../utils/clipboard.js";
import * as api from "../api/client.js";

async function refreshKeys() {
  try {
    const keys = await api.getApiKeys();
    return { keys: Array.isArray(keys) ? keys : [] };
  } catch {
    return { keys: [] };
  }
}

function keysHeader(data) {
  if (!data?.keys) return "";
  return `  ${color(`${data.keys.length} API key(s)`, COLORS.dim)}`;
}

export async function showApiKeysMenu(port) {
  await showMenuWithBack({
    title: "API Keys",
    refresh: refreshKeys,
    headerContent: keysHeader,
    items: [
      {
        label: (data) => color(`📋 List Keys (${data?.keys?.length || 0})`, COLORS.cyan),
        action: (data) => listKeys(data),
      },
      {
        label: color("➕ Create New Key", COLORS.success),
        action: () => createKey(),
      },
    ],
  });
}

async function listKeys(data) {
  const keys = data?.keys || [];
  if (keys.length === 0) {
    showStatus("No API keys found.", "warning");
    await pause();
    return;
  }

  const rows = keys.map((k) => [
    k.name || "Unnamed",
    maskKey(k.key || k.id || ""),
    formatDate(k.createdAt),
    k.lastUsedAt ? formatDate(k.lastUsedAt) : "—",
  ]);

  showTable(["Name", "Key", "Created", "Last Used"], rows);

  const selected = await selectMenu("Key Actions", [
    { label: color("Delete a Key", COLORS.red) },
  ]);

  if (selected === 0) {
    const names = keys.map((k) => `${k.name || "Unnamed"}: ${maskKey(k.key || k.id || "")}`);
    const picker = await selectMenu("Select key to delete", names.map((n) => ({ label: n })));
    if (picker < 0) return;

    const confirmed = await confirm(`Delete key "${keys[picker].name || "Unnamed"}"?`, false);
    if (confirmed) {
      try {
        await api.deleteApiKey(keys[picker].id);
        showStatus("Key deleted.", "success");
      } catch (err) {
        showStatus(`Delete failed: ${err.message}`, "error");
      }
      await pause();
    }
  }
}

async function createKey() {
  const name = await prompt("Key name", `cli-key-${Date.now()}`);
  if (!name) return;

  try {
    const result = await api.createApiKey(name);
    const keyValue = result.key || result.apiKey || "";
    showStatus("Key created!", "success");
    console.log(`  ${color("Key:", COLORS.bright)} ${keyValue}`);

    if (keyValue) {
      const copied = copyToClipboard(keyValue);
      if (copied) showStatus("Copied to clipboard!", "success");
    }
  } catch (err) {
    showStatus(`Failed to create key: ${err.message}`, "error");
  }
  await pause();
}
