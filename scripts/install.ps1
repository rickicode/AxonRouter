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
$DisplayPath = $Path.Replace($HOME, "~")

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
    if ($Url -notmatch '^postgres(ql)?://') { Write-Host "ERROR: URL harus diawali dengan postgres://" -ForegroundColor Red; return $false }
    Write-Host "==> Memverifikasi koneksi $($Url -replace '://([^/:]+):[^@]*@', '://\1:****@') ..." -ForegroundColor Cyan
    $out = docker run --rm -e PGCONNECT_TIMEOUT=15 postgres:17-alpine `
        psql $Url -tAc "SELECT 'PostgreSQL reachable, server_version=' || current_setting('server_version')" 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Host "    [ok] $out" -ForegroundColor Green; return $true }
    Write-Host "    [FAIL] Koneksi ditolak:" -ForegroundColor Red
    $out | Select-Object -First 6 | ForEach-Object { Write-Host "    $_" }
    return $false
}

Write-Host ""
Write-Host "  AxonRouter installer" -ForegroundColor Cyan
Write-Host "  Lokasi: $DisplayPath"
Write-Host ""

# ---------- 1. Docker ----------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $a = Read-Host "==> Docker tidak ditemukan. Install Docker Desktop via winget? (yes/no) [yes]"
    if ([string]::IsNullOrWhiteSpace($a)) { $a = "yes" }
    if ($a -notmatch '^(y|yes)$') { Write-Host "Docker diperlukan." -ForegroundColor Red; exit 1 }
    winget install --id Docker.DockerDesktop -e --accept-source-agreements --accept-package-agreements
    $dk = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dk) { Start-Process $dk }
    $ready = $false
    foreach ($i in 1..60) { Start-Sleep 5; docker info *> $null; if ($LASTEXITCODE -eq 0) { $ready = $true; break } }
    if (-not $ready) { Write-Host "Docker belum siap. Buka Docker Desktop dan jalankan ulang installer." -ForegroundColor Red; exit 1 }
}

# ---------- 2. Download compose files ----------
if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
Set-Location $Path
Write-Host "==> Mengunduh file docker compose ..." -ForegroundColor Cyan
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

# ---------- 3. Database backend selection ----------
$DbMode = ""
$DbUrl = $env:EXTERNAL_DATABASE_URL
if (-not [string]::IsNullOrWhiteSpace($DbUrl)) {
    $DbMode = "2"
} else {
    Write-Host ""
    Write-Host "==> Mau pakai PostgreSQL yang mana?" -ForegroundColor Cyan
    Write-Host "    [1] PostgreSQL bawaan (Docker container otomatis) [default]" -ForegroundColor Green
    Write-Host "    [2] PostgreSQL external (Neon / Supabase / RDS / server lain)" -ForegroundColor Yellow
    $choice = Read-Host "    Pilih [1/2] (tekan Enter untuk 1)"
    if ($choice -match '^(2|external|ext)$') {
        $DbMode = "2"
    } else {
        $DbMode = "1"
    }
}

if ($DbMode -eq "2") {
    if ([string]::IsNullOrWhiteSpace($DbUrl)) {
        Write-Host ""
        Write-Host "    Masukkan URL PostgreSQL external:"
        Write-Host "    (contoh: postgres://user:password@host:5432/db?sslmode=require)"
        $DbUrl = (Read-Host "    >").Trim()
    }
    if (-not (Test-PostgresUrl $DbUrl)) { exit 1 }
    Set-EnvKey "COMPOSE_FILE" "docker-compose.yml"
    Set-EnvKey "DATABASE_URL" $DbUrl
    Write-Host "==> PostgreSQL external terverifikasi & diterima! (Container PostgreSQL lokal dimatikan)" -ForegroundColor Green
    Write-Host "    (Pastikan user PostgreSQL memiliki hak CREATE untuk inisialisasi tabel)" -ForegroundColor Yellow
} else {
    Set-EnvKey "COMPOSE_FILE" "docker-compose.yml:docker-compose.postgres.yml"
    $pgPw = New-RandomHex 16
    Set-EnvKey "POSTGRES_PASSWORD" $pgPw
    Set-EnvKey "DATABASE_URL" "postgres://axonrouter:${pgPw}@postgres:5432/axonrouter"
    Write-Host "==> Menggunakan PostgreSQL bawaan (container postgres:17-alpine aktif)." -ForegroundColor Green
}

# ---------- 4. Gateway workers (dibatasi maksimal core CPU) ----------
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
    Write-Host "==> Gateway: standalone mode (1 proses, hemat RAM, 1 CPU core)" -ForegroundColor Green
} else {
    Set-EnvKey "GATEWAY_CLUSTER" "true"
    Set-EnvKey "GATEWAY_WORKERS" "$workers"
    Write-Host "==> Gateway: cluster mode ($workers workers, dibatasi maksimal $cores core CPU)" -ForegroundColor Green
}

# ---------- 5. Secrets ----------
Write-Host "==> Menyiapkan token keamanan & secrets otomatis ..." -ForegroundColor Cyan
Set-EnvKey "JWT_SECRET"       (New-RandomHex 32)
Set-EnvKey "API_KEY_SECRET"   (New-RandomHex 32)
Set-EnvKey "MACHINE_ID_SALT"  (New-RandomHex 16)
Set-EnvKey "ENCRYPTION_KEY"   (New-RandomHex 32)
$AdminPass = New-RandomHex 8
Set-EnvKey "INITIAL_PASSWORD" $AdminPass

# ---------- 6. Start ----------
Write-Host "==> Menjalankan container Docker (docker compose up -d) ..." -ForegroundColor Cyan
docker compose up -d

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "    Lokasi:      $DisplayPath"
Write-Host "    Dashboard:   http://localhost:3777"
Write-Host "    Password:    $AdminPass  (login hanya butuh password, tanpa username)" -ForegroundColor Green
Write-Host "    Gateway API: http://localhost:3778/v1"
Write-Host "    Kelola:      docker compose ps | logs -f | down"
Write-Host "====================================================" -ForegroundColor Cyan
