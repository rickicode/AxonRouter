# AxonRouter — Reset Dashboard Password CLI for Windows
# Usage:
#   .\scripts\reset-password.ps1 [new_password]
param(
    [string]$NewPassword = "12345677",
    [string]$Path = (Join-Path $HOME "AxonRouter")
)

$ErrorActionPreference = "Stop"

Write-Host "==> AxonRouter Password Reset" -ForegroundColor Cyan

$envFile = Join-Path $Path ".env"
if (-not (Test-Path $envFile)) {
    if (Test-Path ".env") { $envFile = ".env" }
    else {
        Write-Host "ERROR: File .env tidak ditemukan. Jalankan dari direktori AxonRouter." -ForegroundColor Red
        exit 1
    }
}

# Update INITIAL_PASSWORD in .env
$lines = @(Get-Content $envFile -ErrorAction SilentlyContinue)
$found = $false
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^INITIAL_PASSWORD=") {
        $lines[$i] = "INITIAL_PASSWORD=$NewPassword"
        $found = $true
        break
    }
}
if (-not $found) { $lines += "INITIAL_PASSWORD=$NewPassword" }
Set-Content -Path $envFile -Value $lines -Encoding ascii

# Update database hash via docker container if running
if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker exec -e NEW_PASS="$NewPassword" axonrouter-web node -e @"
      (async () => {
        try {
          const { getAdapter } = await import('./src/lib/db/driver.js');
          const bcrypt = (await import('bcryptjs')).default;
          const adapter = await getAdapter();
          const hash = await bcrypt.hash(process.env.NEW_PASS, 10);
          await adapter.run('UPDATE settings SET password = \$1 WHERE id = 1', [hash]);
          console.log('[OK] Password berhasil diupdate di database.');
          process.exit(0);
        } catch(e) {
          process.exit(0);
        }
      })()
"@ *>$null
}

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "    Password dashboard berhasil di-reset!" -ForegroundColor Green
Write-Host "    Password baru : $NewPassword" -ForegroundColor Yellow
Write-Host "    Dashboard URL : http://localhost:3777"
Write-Host "====================================================" -ForegroundColor Cyan
