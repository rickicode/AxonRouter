# AxonRouter — One-Command Installer for Windows (PowerShell + Docker Desktop)
#
#   irm https://raw.githubusercontent.com/rickicode/AxonRouter/main/scripts/install.ps1 | iex
#   # or external Postgres:
#   $env:EXTERNAL_DATABASE_URL='postgres://u:p@host:5432/db?sslmode=require'; irm .../install.ps1 | iex
param(
    [string]$Path = (Join-Path $HOME "AxonRouter"),
    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
$Raw = "https://raw.githubusercontent.com/rickicode/AxonRouter/$Branch"

function New-RandomHex([int]$N) {
    $b = New-Object byte[] $N
    [System.Security.Cryptography.RandomNumberGenerator]::GetBytes($b)
    -join ($b | ForEach-Object { $_.ToString("x2") })
}

function Set-EnvKey([string]$Key, [string]$Value) {
    $envFile = Join-Path $Path ".env"
    $lines = @(Get-Content $envFile -ErrorAction SilentlyContinue)
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^$Key=") { $lines[$i] = "$Key=$Value"; $found = $true; break }
    }
    if (-not $found) { $lines += "$Key=$Value" }
    Set-Content -Path $envFile -Value $lines -Encoding ascii
}

function Test-PostgresUrl([string]$Url) {
    if ($Url -notmatch '^postgres(ql)?://') { Write-Host "ERROR: URL must start with postgres://"; return $false }
    Write-Host "==> Verifying $($Url -replace '://([^/:]+):[^@]*@', '://\1:****@') ..." -ForegroundColor Cyan
    $out = docker run --rm -e PGCONNECT_TIMEOUT=15 postgres:17-alpine `
        psql $Url -tAc "SELECT 'OK server_version=' || current_setting('server_version')" 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Host "    [ok] $out" -ForegroundColor Green; return $true }
    Write-Host "    [FAIL] connection rejected:" -ForegroundColor Red
    $out | Select-Object -First 6 | ForEach-Object { Write-Host "    $_" }
    return $false
}

Write-Host ""
Write-Host "  AxonRouter installer" -ForegroundColor Cyan
Write-Host "  Location: $Path"
Write-Host ""

# ---------- 1. Docker ----------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $a = Read-Host "==> Docker not found. Install Docker Desktop via winget? (yes/no) [yes]"
    if ([string]::IsNullOrWhiteSpace($a)) { $a = "yes" }
    if ($a -notmatch '^(y|yes)$') { Write-Host "Docker is required." -ForegroundColor Red; exit 1 }
    winget install --id Docker.DockerDesktop -e --accept-source-agreements --accept-package-agreements
    $dk = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dk) { Start-Process $dk }
    $ready = $false
    foreach ($i in 1..60) { Start-Sleep 5; docker info *> $null; if ($LASTEXITCODE -eq 0) { $ready = $true; break } }
    if (-not $ready) { Write-Host "Docker did not become ready. Open Docker Desktop and re-run." -ForegroundColor Red; exit 1 }
}

# ---------- 2. Download compose files ----------
if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
Set-Location $Path
Write-Host "==> Downloading compose files ..." -ForegroundColor Cyan
Invoke-WebRequest -Uri "$Raw/docker-compose.yml"           -OutFile "docker-compose.yml"
Invoke-WebRequest -Uri "$Raw/docker-compose.postgres.yml"  -OutFile "docker-compose.postgres.yml"
if (-not (Test-Path ".env")) {
    try {
        Invoke-WebRequest -Uri "$Raw/.env.example" -OutFile ".env.example"
        Copy-Item ".env.example" ".env"
    } catch {
        New-Item -ItemType File -Path ".env" | Out-Null
    }
}

# ---------- 3. Database — the only question ----------
$DbUrl = $env:EXTERNAL_DATABASE_URL
if ([string]::IsNullOrWhiteSpace($DbUrl)) {
    Write-Host ""
    Write-Host "==> Database backend:" -ForegroundColor Cyan
    Write-Host "    [Enter] built-in postgres:17-alpine container" -ForegroundColor Green
    Write-Host "    [paste] external Postgres (Neon/Supabase/RDS), e.g.:" -ForegroundColor Yellow
    Write-Host "            postgres://user:password@host:5432/db?sslmode=require"
    $DbUrl = (Read-Host "    >").Trim()
}

if (-not [string]::IsNullOrWhiteSpace($DbUrl)) {
    if (-not (Test-PostgresUrl $DbUrl)) { exit 1 }
    Set-EnvKey "COMPOSE_FILE" "docker-compose.yml"
    Set-EnvKey "DATABASE_URL" $DbUrl
    Write-Host "==> External Postgres accepted. Local container disabled." -ForegroundColor Green
    Write-Host "    (the role needs CREATE rights — AxonRouter applies its schema on boot)" -ForegroundColor Yellow
} else {
    Set-EnvKey "COMPOSE_FILE" "docker-compose.yml:docker-compose.postgres.yml"
    $pgPw = New-RandomHex 16
    Set-EnvKey "POSTGRES_PASSWORD" $pgPw
    Set-EnvKey "DATABASE_URL" "postgres://axonrouter:${pgPw}@postgres:5432/axonrouter"
    Write-Host "==> Built-in Postgres selected." -ForegroundColor Green
}

# ---------- 4. Gateway workers (capped to CPU cores) ----------
$cores = [System.Environment]::ProcessorCount
$reqWorkers = $env:GATEWAY_WORKERS
if ([string]::IsNullOrWhiteSpace($reqWorkers) -or ($reqWorkers -notmatch '^\d+$')) {
    $workers = $cores
} else {
    $workers = [Math]::Min([int]$reqWorkers, $cores)
}
if ($workers -lt 1) { $workers = 1 }

if ($env:GATEWAY_CLUSTER -eq "false" -or $workers -le 1) {
    Set-EnvKey "GATEWAY_CLUSTER" "false"
    Set-EnvKey "GATEWAY_WORKERS" "1"
    Write-Host "==> Gateway: standalone mode (1 process, 1 CPU core)" -ForegroundColor Green
} else {
    Set-EnvKey "GATEWAY_CLUSTER" "true"
    Set-EnvKey "GATEWAY_WORKERS" "$workers"
    Write-Host "==> Gateway: cluster mode ($workers workers, max $cores CPU cores)" -ForegroundColor Green
}

# ---------- 5. Secrets ----------
Write-Host "==> Generating secrets ..." -ForegroundColor Cyan
Set-EnvKey "JWT_SECRET"       (New-RandomHex 32)
Set-EnvKey "API_KEY_SECRET"   (New-RandomHex 32)
Set-EnvKey "MACHINE_ID_SALT"  (New-RandomHex 16)
Set-EnvKey "ENCRYPTION_KEY"   (New-RandomHex 32)
$AdminPass = New-RandomHex 8
Set-EnvKey "INITIAL_PASSWORD" $AdminPass

# ---------- 6. Start ----------
Write-Host "==> Starting stack (docker compose up -d) ..." -ForegroundColor Cyan
docker compose up -d

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "    Directory:   $Path"
Write-Host "    Dashboard:   http://localhost:3777"
Write-Host "    Password:    $AdminPass  (login uses password only, no username)" -ForegroundColor Green
Write-Host "    Gateway API: http://localhost:3778/v1"
Write-Host "    Manage:      docker compose ps | logs -f | down"
Write-Host "====================================================" -ForegroundColor Cyan
