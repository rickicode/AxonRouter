import { showMenuWithBack } from "../utils/menuHelper.js";
import { selectMenu, pause, confirm } from "../utils/input.js";
import { showStatus, showTable, color, COLORS, showBox } from "../utils/display.js";
import * as api from "../api/client.js";

async function refreshCombos() {
  try {
    const combos = await api.getCombos();
    return { combos: Array.isArray(combos) ? combos : [] };
  } catch {
    return { combos: [] };
  }
}

function combosHeader(data) {
  if (!data?.combos) return "";
  return `  ${color(`${data.combos.length} combo(s)`, COLORS.dim)}`;
}

export async function showCombosMenu(port) {
  await showMenuWithBack({
    title: "Combos",
    refresh: refreshCombos,
    headerContent: combosHeader,
    items: [
      {
        label: (data) => color(`📋 List Combos (${data?.combos?.length || 0})`, COLORS.cyan),
        action: (data) => listCombos(data),
      },
    ],
  });
}

async function listCombos(data) {
  const combos = data?.combos || [];
  if (combos.length === 0) {
    showStatus("No combos configured.", "warning");
    await pause();
    return;
  }

  const rows = combos.map((c) => [
    c.name || c.id || "Unnamed",
    c.description || "—",
    c.model || c.models?.join(", ") || "—",
    c.isActive !== false ? color("active", COLORS.success) : color("inactive", COLORS.dim),
  ]);

  showTable(["Name", "Description", "Models", "Status"], rows);

  const confirmDelete = await confirm("Delete a combo?", false);
  if (confirmDelete) {
    const names = combos.map((c) => c.name || c.id || "Unnamed");
    const picker = await selectMenu("Select combo to delete", names.map((n) => ({ label: n })));
    if (picker >= 0) {
      try {
        await api.deleteCombo(combos[picker].id);
        showStatus("Combo deleted.", "success");
      } catch (err) {
        showStatus(`Delete failed: ${err.message}`, "error");
      }
      await pause();
    }
  }
}
