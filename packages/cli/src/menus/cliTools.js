import { showMenuWithBack } from "../utils/menuHelper.js";
import { selectMenu, pause, prompt } from "../utils/input.js";
import { showStatus, showBox, color, COLORS } from "../utils/display.js";
import * as api from "../api/client.js";

export async function showCliToolsMenu(port) {
  await showMenuWithBack({
    title: "CLI Tools",
    items: [
      {
        label: color("Claude Code", COLORS.cyan),
        action: () => showClaudeMenu(port),
      },
      {
        label: color("Codex", COLORS.cyan),
        action: () => showCodexMenu(port),
      },
    ],
  });
}

async function showClaudeMenu(port) {
  const endpointUrl = `http://localhost:${port}/v1`;
  const authToken = await getFirstApiKey();

  showBox("Claude Code Configuration", [
    `  ${color("ANTHROPIC_BASE_URL:", COLORS.bright)} ${endpointUrl}`,
    `  ${color("ANTHROPIC_AUTH_TOKEN:", COLORS.bright)} ${authToken ? "✓ configured" : color("✗ not configured", COLORS.warning)}`,
    "",
    "  Configure your environment:",
    `  ${color("  export ANTHROPIC_BASE_URL=" + endpointUrl, COLORS.dim)}`,
    `  ${color("  export ANTHROPIC_AUTH_TOKEN=<your-key>", COLORS.dim)}`,
  ].join("\n"));

  await pause();
}

async function showCodexMenu(port) {
  showBox("Codex Configuration", [
    "  Codex uses the standard OpenAI-compatible endpoint:",
    `  ${color("  Endpoint: http://localhost:" + port + "/v1", COLORS.bright)}`,
    "",
    "  Configure Codex with:",
    `  ${color("  codex use --base-url http://localhost:" + port + "/v1", COLORS.dim)}`,
  ].join("\n"));

  await pause();
}

async function getFirstApiKey() {
  try {
    const keys = await api.getApiKeys();
    if (Array.isArray(keys) && keys.length > 0) {
      return keys[0].key || null;
    }
  } catch { /* ignore */ }
  return null;
}
