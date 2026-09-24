import { TOOL_TEMPLATES } from "../../shared/constants/cliToolTemplates.js";

/**
 * Generate POSIX Bash host setup script
 */
export function generateBashScript(toolId, params = {}) {
  const tpl = TOOL_TEMPLATES[toolId];
  if (!tpl) {
    return `#!/usr/bin/env bash
set -euo pipefail
echo "Error: Unknown tool '${toolId}'"
exit 1
`;
  }

  const toolName = tpl.name;
  let fileOperations = "";

  if (tpl.format === "multi_file") {
    fileOperations = tpl.files
      .map((f, idx) => {
        const pathStr = f.pathPosix;
        const contentStr = f.content(params);
        return generateSingleFileBash(pathStr, contentStr, "replace", idx);
      })
      .join("\n\n");
  } else {
    const targetPath = tpl.paths.posix[0] || tpl.paths.darwin?.[0];
    const raw = tpl.generateConfig(params);
    const contentStr = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
    fileOperations = generateSingleFileBash(targetPath, contentStr, tpl.format, 0);
  }

  const verifySection = tpl.verifyCmd
    ? `
# Verification check
if command -v ${tpl.verifyCmd.split(" ")[0]} >/dev/null 2>&1; then
  printf "\\033[0;32m[AxonRouter] Detected binary: %s\\033[0m\\n" "$(${tpl.verifyCmd} 2>/dev/null || true)"
else
  printf "\\033[0;33m[AxonRouter] Note: '${tpl.verifyCmd.split(" ")[0]}' binary not found in PATH on this host.\\033[0m\\n"
  printf "\\033[0;33m          Config written. Run after installing the tool.\\033[0m\\n"
fi`
    : "";

  return `#!/usr/bin/env bash
# ==============================================================================
# AxonRouter Host Setup Script: ${toolName}
# Generated automatically by AxonRouter Gateway
# ==============================================================================
set -euo pipefail

printf "\\033[0;36m[AxonRouter] Configuring %s for AxonRouter host gateway...\\033[0m\\n" "${toolName}"

${fileOperations}

${verifySection}

printf "\\033[0;32m[AxonRouter] ✓ Configuration for %s applied successfully!\\033[0m\\n" "${toolName}"
printf "\\033[0;32m[AxonRouter] Gateway Target: %s\\033[0m\\n" "${params.baseUrl || "http://localhost:3777"}"
`;
}

function generateSingleFileBash(rawPath, contentStr, format, index) {
  const isHome = rawPath.startsWith("~/");
  const targetExpr = isHome
    ? `"$HOME/${rawPath.slice(2)}"`
    : `"${rawPath}"`;

  const safeContent = contentStr.replace(/\\/g, "\\\\").replace(/'/g, "'\\''");

  if (format === "json_merge") {
    return `
# Target ${index + 1}: ${rawPath}
TARGET_${index}=${targetExpr}
DIR_${index}="$(dirname "$TARGET_${index}")"
mkdir -p "$DIR_${index}"

if [ -f "$TARGET_${index}" ]; then
  BAK_${index}="$TARGET_${index}.bak.$(date +%Y%m%d%H%M%S)"
  cp "$TARGET_${index}" "$BAK_${index}"
  printf "\\033[0;34m[AxonRouter] Backed up existing config to %s\\033[0m\\n" "$BAK_${index}"
fi

cat << 'EOF_AXON_JSON_${index}' > "$DIR_${index}/\.axonrouter_incoming_${index}.json"
${contentStr}
EOF_AXON_JSON_${index}

if command -v node >/dev/null 2>&1; then
  node -e '
    const fs = require("fs");
    const target = process.argv[1];
    const incoming = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    let existing = {};
    if (fs.existsSync(target)) {
      try { existing = JSON.parse(fs.readFileSync(target, "utf8")); } catch(e) {}
    }
    const merged = { ...existing, ...incoming };
    if (existing.env && incoming.env) {
      merged.env = { ...existing.env, ...incoming.env };
    }
    if (existing.agents && incoming.agents) {
      merged.agents = { ...existing.agents, ...incoming.agents };
    }
    if (existing.models && incoming.models) {
      merged.models = { ...existing.models, ...incoming.models };
    }
    fs.writeFileSync(target, JSON.stringify(merged, null, 2));
  ' "$TARGET_${index}" "$DIR_${index}/\.axonrouter_incoming_${index}.json"
  rm -f "$DIR_${index}/\.axonrouter_incoming_${index}.json"
elif command -v python3 >/dev/null 2>&1; then
  python3 -c '
import json, sys, os
target, incoming_file = sys.argv[1], sys.argv[2]
with open(incoming_file, "r") as f:
    incoming = json.load(f)
existing = {}
if os.path.exists(target):
    try:
        with open(target, "r") as f:
            existing = json.load(f)
    except Exception:
        pass
merged = {**existing, **incoming}
if "env" in existing and "env" in incoming:
    merged["env"] = {**existing["env"], **incoming["env"]}
with open(target, "w") as f:
    json.dump(merged, f, indent=2)
' "$TARGET_${index}" "$DIR_${index}/\.axonrouter_incoming_${index}.json"
  rm -f "$DIR_${index}/\.axonrouter_incoming_${index}.json"
else
  mv "$DIR_${index}/\.axonrouter_incoming_${index}.json" "$TARGET_${index}"
fi
printf "\\033[0;32m[AxonRouter] ✓ Updated %s\\033[0m\\n" "$TARGET_${index}"
`;
  }

  return `
# Target ${index + 1}: ${rawPath}
TARGET_${index}=${targetExpr}
DIR_${index}="$(dirname "$TARGET_${index}")"
mkdir -p "$DIR_${index}"

if [ -f "$TARGET_${index}" ]; then
  BAK_${index}="$TARGET_${index}.bak.$(date +%Y%m%d%H%M%S)"
  cp "$TARGET_${index}" "$BAK_${index}"
  printf "\\033[0;34m[AxonRouter] Backed up existing config to %s\\033[0m\\n" "$BAK_${index}"
fi

cat << 'EOF_AXON_RAW_${index}' > "$TARGET_${index}"
${contentStr}
EOF_AXON_RAW_${index}
printf "\\033[0;32m[AxonRouter] ✓ Written %s\\033[0m\\n" "$TARGET_${index}"
`;
}
