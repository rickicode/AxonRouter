import { TOOL_TEMPLATES } from "../../shared/constants/cliToolTemplates.js";

/**
 * Generate Windows PowerShell host setup script
 */
export function generatePowerShellScript(toolId, params = {}) {
  const tpl = TOOL_TEMPLATES[toolId];
  if (!tpl) {
    return `# AxonRouter Host Setup Script
$ErrorActionPreference = "Stop"
Write-Error "Unknown tool '${toolId}'"
`;
  }

  const toolName = tpl.name;
  let fileOperations = "";

  if (tpl.format === "multi_file") {
    fileOperations = tpl.files
      .map((f, idx) => {
        const pathStr = f.pathWin;
        const contentStr = f.content(params);
        return generateSingleFilePowerShell(pathStr, contentStr, "replace", idx);
      })
      .join("\n\n");
  } else {
    const targetPath = tpl.paths.windows[0];
    const raw = tpl.generateConfig(params);
    const contentStr = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
    fileOperations = generateSingleFilePowerShell(targetPath, contentStr, tpl.format, 0);
  }

  return `# ==============================================================================
# AxonRouter Host Setup Script (PowerShell): ${toolName}
# Generated automatically by AxonRouter Gateway
# ==============================================================================
$ErrorActionPreference = "Stop"

Write-Host "[AxonRouter] Configuring ${toolName} for AxonRouter host gateway..." -ForegroundColor Cyan

${fileOperations}

Write-Host "[AxonRouter] ✓ Configuration for ${toolName} applied successfully!" -ForegroundColor Green
Write-Host "[AxonRouter] Gateway Target: ${params.baseUrl || "http://localhost:3777"}" -ForegroundColor Green
`;
}

function generateSingleFilePowerShell(rawPath, contentStr, format, index) {
  const isEnvUserProfile = rawPath.startsWith("$env:USERPROFILE\\");
  const isEnvAppData = rawPath.startsWith("$env:APPDATA\\");
  const isEnvLocalAppData = rawPath.startsWith("$env:LOCALAPPDATA\\");

  let pathExpr;
  if (isEnvUserProfile) {
    pathExpr = `Join-Path $env:USERPROFILE "${rawPath.slice("$env:USERPROFILE\\".length)}"`;
  } else if (isEnvAppData) {
    pathExpr = `Join-Path $env:APPDATA "${rawPath.slice("$env:APPDATA\\".length)}"`;
  } else if (isEnvLocalAppData) {
    pathExpr = `Join-Path $env:LOCALAPPDATA "${rawPath.slice("$env:LOCALAPPDATA\\".length)}"`;
  } else {
    pathExpr = `"${rawPath}"`;
  }

  // Escape single quotes for PowerShell here-string or content
  const escapedContent = contentStr.replace(/'/g, "''");

  if (format === "json_merge") {
    return `
# Target ${index + 1}: ${rawPath}
$target_${index} = ${pathExpr}
$dir_${index} = Split-Path -Parent $target_${index}
if (-not (Test-Path $dir_${index})) {
    New-Item -ItemType Directory -Force -Path $dir_${index} | Out-Null
}

if (Test-Path $target_${index}) {
    $bak_${index} = "$target_${index}.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item -Path $target_${index} -Destination $bak_${index}
    Write-Host "[AxonRouter] Backed up existing config to $bak_${index}" -ForegroundColor DarkCyan
}

$rawJson_${index} = @'
${contentStr}
'@

$incoming_${index} = $rawJson_${index} | ConvertFrom-Json

if (Test-Path $target_${index}) {
    try {
        $existing_${index} = Get-Content -Raw -Path $target_${index} | ConvertFrom-Json
        # Merge top-level properties
        $incoming_${index}.PSObject.Properties | ForEach-Object {
            if ($_.Name -eq "env" -and $existing_${index}.env) {
                $_.Value.PSObject.Properties | ForEach-Object {
                    $existing_${index}.env.$($_.Name) = $_.Value
                }
            } else {
                $existing_${index} | Add-Member -MemberType NoteProperty -Name $_.Name -Value $_.Value -Force
            }
        }
        $existing_${index} | ConvertTo-Json -Depth 10 | Set-Content -Path $target_${index} -Encoding UTF8
    } catch {
        $rawJson_${index} | Set-Content -Path $target_${index} -Encoding UTF8
    }
} else {
    $rawJson_${index} | Set-Content -Path $target_${index} -Encoding UTF8
}
Write-Host "[AxonRouter] ✓ Updated $target_${index}" -ForegroundColor Green
`;
  }

  return `
# Target ${index + 1}: ${rawPath}
$target_${index} = ${pathExpr}
$dir_${index} = Split-Path -Parent $target_${index}
if (-not (Test-Path $dir_${index})) {
    New-Item -ItemType Directory -Force -Path $dir_${index} | Out-Null
}

if (Test-Path $target_${index}) {
    $bak_${index} = "$target_${index}.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item -Path $target_${index} -Destination $bak_${index}
    Write-Host "[AxonRouter] Backed up existing config to $bak_${index}" -ForegroundColor DarkCyan
}

@'
${contentStr}
'@ | Set-Content -Path $target_${index} -Encoding UTF8
Write-Host "[AxonRouter] ✓ Written $target_${index}" -ForegroundColor Green
`;
}
