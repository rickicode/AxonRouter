# AxonRouter — One-Command Installer for Windows (PowerShell + Docker Desktop)
#
#   irm https://raw.githubusercontent.com/rickicode/AxonRouter/main/scripts/install.ps1 | iex
#   # unattended, external Postgres:
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

function Test-PortPing([string]$Url) {
    # Extract host and port using regex
    if ($Url -match '^postgres(ql)?://(?:[^@]+@)?(?<host>[^:/]+)(?::(?<port>\d+))?') {
        $targetHost = $Matches['host']
        $targetPort = if ($Matches['port']) { [int]$Matches['port'] } else { 5432 }
        Write-Host "==> Mengetes koneksi TCP ke $targetHost`:$targetPort ..." -ForegroundColor Cyan
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $connect = $tcp.BeginConnect($targetHost, $targetPort, $null, $null)
            $wait = $connect.AsyncWaitHandle.WaitOne(5000, $false)
            if ($wait -and $tcp.Connected) {
                $tcp.EndConnect($connect)
                $tcp.Close()
                Write-Host "    [ok] Port $targetHost`:$targetPort terbuka dan merespons." -ForegroundColor Green
                return $true
            } else {
                $tcp.Close()
                Write-Host "    [FAIL] Port $targetHost`:$targetPort tidak merespons (Timeout 5s)." -ForegroundColor Red
                return $false
            }
        } catch {
            Write-Host "    [FAIL] Gagal menghubungi $targetHost`:$targetPort : $($_.Exception.Message)" -ForegroundColor Red
            return $false
        }
    }
    return $true
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
Invoke-WebRequest -Uri "$Raw/docker-compose.yml"          -OutFile "docker-compose.yml"
Invoke-WebRequest -Uri "$Raw/docker-compose.postgres.yml" -OutFile "docker-compose.postgres.yml"
if (-not (Test-Path ".env")) {
    try {
        Invoke-WebRequest -Uri "$Raw/.env.example" -OutFile ".env.example"
        Copy-Item ".env.example" ".env"
    } catch {
        New-Item -ItemType File -Path ".env" | Out-Null
    }
}

# ---------- 3. Database backend ----------
$DbMode = "1"
$DbUrl = $env:EXTERNAL_DATABASE_URL
if (-not [string]::IsNullOrWhiteSpace($DbUrl)) {
    $DbMode = "2"
} else {
    Write-Host ""
    Write-Host "==> Mau pakai PostgreSQL yang mana?" -ForegroundColor Cyan
    Write-Host "    [1] PostgreSQL bawaan (container Docker, otomatis) [default]" -ForegroundColor Green
    Write-Host "    [2] PostgreSQL external (Neon / Supabase / RDS / server lain)" -ForegroundColor Yellow
    if ((Read-Host "    Pilih [1/2] (Enter = 1)") -match '^(2|external|ext)$') { $DbMode = "2" }
}

if ($DbMode -eq "2") {
    if ([string]::IsNullOrWhiteSpace($DbUrl)) {
        Write-Host ""
        Write-Host "    Masukkan URL PostgreSQL external:"
        Write-Host "    (contoh: postgres://user:password@host:5432/db?sslmode=require)"
        $DbUrl = (Read-Host "    >").Trim()
    }
    if ($DbUrl -notmatch '^postgres(ql)?://') { Write-Host "ERROR: URL harus diawali postgres://" -ForegroundColor Red; exit 1 }

    # Ping port
    if (-not (Test-PortPing $DbUrl)) {
        Write-Host "ERROR: Host/port database tidak dapat dijangkau. Cek koneksi Anda." -ForegroundColor Red
        exit 1
    }

    Set-EnvKey "COMPOSE_FILE" "docker-compose.yml"
    Set-EnvKey "DATABASE_URL" $DbUrl
    Write-Host "==> PostgreSQL external dipakai (container PostgreSQL lokal TIDAK dijalankan)." -ForegroundColor Green
    Write-Host "    (Koneksi & skema divalidasi container saat pertama kali start)" -ForegroundColor Yellow
} else {
    Set-EnvKey "COMPOSE_FILE" "docker-compose.yml:docker-compose.postgres.yml"
    $pgPw = New-RandomHex 16
    Set-EnvKey "POSTGRES_PASSWORD" $pgPw
    Set-EnvKey "DATABASE_URL" "postgres://axonrouter:${pgPw}@postgres:5432/axonrouter"
    Write-Host "==> Menggunakan PostgreSQL bawaan (container postgres:17-alpine aktif)." -ForegroundColor Green
}

# ---------- 4. Gateway workers (max = CPU cores) ----------
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
    Write-Host "==> Gateway: standalone (1 proses, hemat RAM)" -ForegroundColor Green
} else {
    Set-EnvKey "GATEWAY_CLUSTER" "true"
    Set-EnvKey "GATEWAY_WORKERS" "$workers"
    Write-Host "==> Gateway: cluster ($workers workers, maksimum $cores core CPU)" -ForegroundColor Green
}

# ---------- 5. Secrets ----------
Write-Host "==> Menyiapkan secrets ..." -ForegroundColor Cyan
Set-EnvKey "JWT_SECRET"       (New-RandomHex 32)
Set-EnvKey "API_KEY_SECRET"   (New-RandomHex 32)
Set-EnvKey "MACHINE_ID_SALT"  (New-RandomHex 16)
Set-EnvKey "ENCRYPTION_KEY"   (New-RandomHex 32)
$AdminPass = if ($env:INITIAL_PASSWORD) { $env:INITIAL_PASSWORD } else { "12345677" }
Set-EnvKey "INITIAL_PASSWORD" $AdminPass

# ---------- 6. Start ----------
Write-Host "==> Menjalankan stack (docker compose up -d) ..." -ForegroundColor Cyan
docker compose up -d

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  ✓ AxonRouter Berhasil Terpasang & Berjalan!" -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  • Direktori Stack : $DisplayPath"
Write-Host "  • Mode Database   : $(if ($DbMode -eq '2') { 'External PostgreSQL (Neon / Managed)' } else { 'Built-in PostgreSQL 17 Container' })"
Write-Host "  • Dashboard Web   : http://localhost:3777" -ForegroundColor Cyan
Write-Host "  • Password Login  : $AdminPass  (login hanya perlu password, tanpa username)" -ForegroundColor Green
Write-Host ""
Write-Host "  [INFO PORT & GATEWAY API]" -ForegroundColor Yellow
Write-Host "  • Port 3777       : Dashboard Control Plane, Web UI, & Admin Settings"
Write-Host "  • Port 3778       : Dedicated High-Throughput Hono API Gateway (/v1)"
Write-Host "    - OpenAI API    : http://localhost:3778/v1/chat/completions"
Write-Host "    - Claude / Anth : http://localhost:3778/v1/messages"
Write-Host "    - Model List    : http://localhost:3778/v1/models"
Write-Host "    - Base URL Klien: http://localhost:3778/v1  (masukkan ke Cursor, Claude Code, Cline, dll)" -ForegroundColor Cyan
Write-Host ""
Write-Host "  [CARA RESET PASSWORD]" -ForegroundColor Yellow
Write-Host "  • Jalankan perintah ini kapan saja jika lupa password:"
Write-Host "    irm https://raw.githubusercontent.com/rickicode/AxonRouter/main/scripts/reset-password.ps1 | iex" -ForegroundColor Green
Write-Host "    (atau ganti password di Dashboard: Settings -> Security)"
Write-Host ""
Write-Host "  [MANAJEMEN CONTAINER]" -ForegroundColor Cyan
Write-Host "  • Cek status      : cd $DisplayPath; docker compose ps"
Write-Host "  • Lihat log       : cd $DisplayPath; docker compose logs -f"
Write-Host "  • Matikan stack   : cd $DisplayPath; docker compose down"
Write-Host "========================================================================" -ForegroundColor Cyan
