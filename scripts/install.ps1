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
    # Extract host and port using regex (postgres://, postgresql://, redis://, rediss://)
    if ($Url -match '^(?:postgres(ql)?|redis(s)?|valkey)://(?:[^@]+@)?(?<host>[^:/]+)(?::(?<port>\d+))?') {
        $targetHost = $Matches['host']
        $defaultPort = if ($Url -match '^redis(s)?://') { 6379 } else { 5432 }
        $targetPort = if ($Matches['port']) { [int]$Matches['port'] } else { $defaultPort }
        Write-Host "==> Testing TCP connection to $targetHost`:$targetPort ..." -ForegroundColor Cyan
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $connect = $tcp.BeginConnect($targetHost, $targetPort, $null, $null)
            $wait = $connect.AsyncWaitHandle.WaitOne(5000, $false)
            if ($wait -and $tcp.Connected) {
                $tcp.EndConnect($connect)
                $tcp.Close()
                Write-Host "    [ok] Port $targetHost`:$targetPort is open and responding." -ForegroundColor Green
                return $true
            } else {
                $tcp.Close()
                Write-Host "    [FAIL] Port $targetHost`:$targetPort did not respond (5s timeout)." -ForegroundColor Red
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
Write-Host "  Location: $DisplayPath"
Write-Host ""

# ---------- 1. Docker ----------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $a = Read-Host "==> Docker not found. Install Docker Desktop via winget? (yes/no) [yes]"
    if ([string]::IsNullOrWhiteSpace($a)) { $a = "yes" }
    if ($a -notmatch '^(y|yes)$') { Write-Host "Docker diperlukan." -ForegroundColor Red; exit 1 }
    winget install --id Docker.DockerDesktop -e --accept-source-agreements --accept-package-agreements
    $dk = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dk) { Start-Process $dk }
    $ready = $false
    foreach ($i in 1..60) { Start-Sleep 5; docker info *> $null; if ($LASTEXITCODE -eq 0) { $ready = $true; break } }
    if (-not $ready) { Write-Host "Docker is not ready yet. Open Docker Desktop and re-run the installer." -ForegroundColor Red; exit 1 }
}

# ---------- 2. Download compose files ----------
if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
Set-Location $Path
Write-Host "==> Downloading docker compose files ..." -ForegroundColor Cyan
Invoke-WebRequest -Uri "$Raw/docker-compose.yml"          -OutFile "docker-compose.yml"
Invoke-WebRequest -Uri "$Raw/docker-compose.postgres.yml" -OutFile "docker-compose.postgres.yml"
try { Invoke-WebRequest -Uri "$Raw/docker-compose.valkey.yml" -OutFile "docker-compose.valkey.yml" }
catch { Write-Host "    [!!] Could not download docker-compose.valkey.yml; the built-in Valkey option will fall back to memory-only." -ForegroundColor Yellow }
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
    Write-Host "==> Which PostgreSQL backend do you want to use?" -ForegroundColor Cyan
    Write-Host "    [1] Built-in PostgreSQL (Docker container, automatic) [default]" -ForegroundColor Green
    Write-Host "    [2] External PostgreSQL (Neon / Supabase / RDS / any server)" -ForegroundColor Yellow
    if ((Read-Host "    Choose [1/2] (Enter = 1)") -match '^(2|external|ext)$') { $DbMode = "2" }
}

if ($DbMode -eq "2") {
    if ([string]::IsNullOrWhiteSpace($DbUrl)) {
        Write-Host ""
        Write-Host "    Enter your external PostgreSQL connection string:"
        Write-Host "    (example: postgres://user:password@host:5432/db?sslmode=require)"
        Write-Host "    TIP: Prefer a DIRECT connection (fastest). Transaction poolers are supported" -ForegroundColor Yellow
        Write-Host "          but add a hop (Neon: omit '-pooler'; Supabase: session pooler or port 5432)." -ForegroundColor Yellow
        $DbUrl = (Read-Host "    >").Trim()
    }
    if ($DbUrl -notmatch '^postgres(ql)?://') { Write-Host "ERROR: URL must start with postgres://" -ForegroundColor Red; exit 1 }

    # Neon pooler -> prefer direct compute (one less hop, no double pooling).
    # Generic transaction poolers (Supabase 6543 / PgBouncer) are SUPPORTED at
    # runtime: postgresAdapter sets prepare=false so prepared statements don't
    # collide across pooled sessions. Locks stay xact-scoped advisory + row
    # FOR UPDATE (no LISTEN/NOTIFY, temp tables, or session GUCs).
    if ($DbUrl -match 'neon\.tech' -and $DbUrl -match '-pooler') {
        $DbUrl = $DbUrl -replace '-pooler(\.[a-zA-Z0-9.-]+\.neon\.tech|\.neon\.tech)', '$1'
        Write-Host "==> Detected Neon pooler URL. Automatically switched to the direct compute endpoint (faster, one less hop). Set NEON_FORCE_POOLER=true to keep the pooler." -ForegroundColor Yellow
    } elseif ($DbUrl -match 'pooler\.supabase\.com:6543|:6543/|\.pgbouncer\.') {
        Write-Host "==> Transaction pooler detected. AxonRouter supports it (prepared statements auto-disabled), but a direct/session endpoint is faster. Continuing with the pooler." -ForegroundColor Yellow
    }

    # Ping port
    if (-not (Test-PortPing $DbUrl)) {
        Write-Host "ERROR: Database host/port is unreachable. Check your network." -ForegroundColor Red
        exit 1
    }

    $ComposeOverlays = "docker-compose.yml"
    Set-EnvKey "DATABASE_URL" $DbUrl
    Write-Host "==> External PostgreSQL selected (the local Postgres container will NOT run)." -ForegroundColor Green
    Write-Host "    (Connection & schema are validated by the container on first boot)" -ForegroundColor Yellow
} else {
    $ComposeOverlays = "docker-compose.yml:docker-compose.postgres.yml"
    $pgPw = New-RandomHex 16
    Set-EnvKey "POSTGRES_PASSWORD" $pgPw
    Set-EnvKey "DATABASE_URL" "postgres://axonrouter:${pgPw}@postgres:5432/axonrouter"
    Write-Host "==> Using built-in PostgreSQL (postgres:17-alpine container enabled)." -ForegroundColor Green
}

# ---------- 3b. Valkey speed layer (cross-process realtime state) ----------
# Valkey holds the shared active-request registry, recent-request ring, account
# cooldowns and rotation mutexes, and fans /api/usage/stream events to every
# worker. It is optional: with no Valkey reachable the app fails open to
# per-process memory, so the dashboard only sees its own worker's traffic.
$ValkeyMode = "1"
$ValkeyUrl = if ($env:EXTERNAL_VALKEY_URL) { $env:EXTERNAL_VALKEY_URL } else { $env:REDIS_URL }
if (-not [string]::IsNullOrWhiteSpace($ValkeyUrl)) {
    $ValkeyMode = "2"
} elseif (-not (Test-Path "docker-compose.valkey.yml")) {
    Write-Host "==> docker-compose.valkey.yml missing; skipping Valkey setup (memory-only speed layer)." -ForegroundColor Yellow
    $ValkeyMode = "3"
} else {
    Write-Host ""
    Write-Host "==> Enable the Valkey speed layer for cross-worker realtime state?" -ForegroundColor Cyan
    Write-Host "    [1] Built-in Valkey 8 (Docker container, recommended) [default]" -ForegroundColor Green
    Write-Host "    [2] External Redis/Valkey (ElastiCache / Upstash / any server)" -ForegroundColor Yellow
    Write-Host "    [3] None (memory-only; each worker keeps private state)" -ForegroundColor Red
    switch ((Read-Host "    Choose [1/2/3] (Enter = 1)").Trim().ToLower()) {
        { $_ -in @("3", "none", "off", "no") } { $ValkeyMode = "3" }
        { $_ -in @("2", "external", "ext") }   { $ValkeyMode = "2" }
        default { $ValkeyMode = "1" }
    }
}

if ($ValkeyMode -eq "2") {
    if ([string]::IsNullOrWhiteSpace($ValkeyUrl)) {
        Write-Host ""
        Write-Host "    Enter your Redis/Valkey connection URL:"
        Write-Host "    (example: redis://user:password@host:6379/0  |  rediss:// for TLS)"
        $ValkeyUrl = (Read-Host "    >").Trim()
    }
    if ($ValkeyUrl -match '^valkeys?://') {
        # ioredis has no valkey:// scheme and would silently mis-parse it, so refuse it.
        Write-Host "ERROR: Unsupported scheme 'valkey://'. ioredis does not recognise it and would connect to the wrong host." -ForegroundColor Red
        Write-Host "       Use redis:// or rediss:// (Valkey speaks the Redis protocol)." -ForegroundColor Red
        exit 1
    }
    if ($ValkeyUrl -notmatch '^rediss?://') {
        Write-Host "ERROR: Valkey URL must start with redis:// or rediss://" -ForegroundColor Red
        exit 1
    }
    Test-PortPing $ValkeyUrl | Out-Null
    Set-EnvKey "VALKEY_URL" $ValkeyUrl
    Write-Host "==> External Redis/Valkey selected (no local Valkey container will run)." -ForegroundColor Green
} elseif ($ValkeyMode -eq "1") {
    $ComposeOverlays = "${ComposeOverlays}:docker-compose.valkey.yml"
    Set-EnvKey "VALKEY_URL" "redis://valkey:6379"
    Write-Host "==> Using built-in Valkey 8 (axonrouter-valkey container enabled)." -ForegroundColor Green
} else {
    # Empty value makes the client use its 127.0.0.1 default and fail open to memory.
    Set-EnvKey "VALKEY_URL" ""
    Write-Host "==> No Valkey: realtime state stays per-process (memory-only speed layer)." -ForegroundColor Yellow
}

Set-EnvKey "COMPOSE_FILE" $ComposeOverlays

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
    Write-Host "==> Gateway: standalone (single process, lowest memory footprint)" -ForegroundColor Green
} else {
    Set-EnvKey "GATEWAY_CLUSTER" "true"
    Set-EnvKey "GATEWAY_WORKERS" "$workers"
    Write-Host "==> Gateway: cluster ($workers workers, capped at $cores CPU cores)" -ForegroundColor Green
}

# ---------- 5. Secrets & Base Configuration ----------
Write-Host "==> Generating secrets & environment ..." -ForegroundColor Cyan
$baseUrl = if ($env:BASE_URL) { $env:BASE_URL } else { "http://localhost:3777" }
Set-EnvKey "BASE_URL"         $baseUrl
Set-EnvKey "CLOUD_URL"        (if ($env:CLOUD_URL) { $env:CLOUD_URL } else { "" })
Set-EnvKey "JWT_SECRET"       (New-RandomHex 32)
Set-EnvKey "API_KEY_SECRET"   (New-RandomHex 32)
Set-EnvKey "MACHINE_ID_SALT"  (New-RandomHex 16)
Set-EnvKey "ENCRYPTION_KEY"   (New-RandomHex 32)
$AdminPass = if ($env:INITIAL_PASSWORD) { $env:INITIAL_PASSWORD } else { "12345677" }
Set-EnvKey "INITIAL_PASSWORD" $AdminPass

# ---------- 6. Start ----------
Write-Host "==> Starting stack (docker compose up -d) ..." -ForegroundColor Cyan
docker compose up -d

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  ✓ AxonRouter installed successfully and running!" -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  • Stack directory : $DisplayPath"
Write-Host "  • Database mode   : $(if ($DbMode -eq '2') { 'External PostgreSQL (Neon / managed)' } else { 'Built-in PostgreSQL 17 container' })"
Write-Host "  • Speed layer     : $(if ($ValkeyMode -eq '2') { 'External Redis/Valkey (shared realtime state across workers)' } elseif ($ValkeyMode -eq '3') { 'memory-only (each worker keeps private realtime state)' } else { 'Built-in Valkey 8 container (shared realtime state across workers)' })"
Write-Host "  • Dashboard       : http://localhost:3777" -ForegroundColor Cyan
Write-Host "  • Login password  : $AdminPass  (password only, no username)" -ForegroundColor Green
Write-Host ""
Write-Host "  [PORTS & GATEWAY API]" -ForegroundColor Yellow
Write-Host "  • Port 3777       : Dashboard control plane, web UI & admin settings"
Write-Host "  • Port 3778       : Dedicated high-throughput Hono API gateway (/v1)"
Write-Host "    - OpenAI API    : http://localhost:3778/v1/chat/completions"
Write-Host "    - Claude/Anthrop: http://localhost:3778/v1/messages"
Write-Host "    - Model list    : http://localhost:3778/v1/models"
Write-Host "    - Client base URL: http://localhost:3778/v1  (use in Cursor, Claude Code, Cline, etc.)" -ForegroundColor Cyan
Write-Host ""
Write-Host "  [RESET PASSWORD]" -ForegroundColor Yellow
Write-Host "  • Run this one-liner anytime if you forget your password:"
Write-Host "    irm https://raw.githubusercontent.com/rickicode/AxonRouter/main/scripts/reset-password.ps1 | iex" -ForegroundColor Green
Write-Host "    (or change it in the dashboard: Settings -> Security)"
Write-Host ""
Write-Host "  [MANAGE CONTAINERS]" -ForegroundColor Cyan
Write-Host "  • Status          : cd $DisplayPath; docker compose ps"
Write-Host "  • Logs            : cd $DisplayPath; docker compose logs -f"
Write-Host "  • Stop the stack  : cd $DisplayPath; docker compose down"
Write-Host "========================================================================" -ForegroundColor Cyan
