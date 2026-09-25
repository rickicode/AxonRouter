# AxonRouter — Zero-Clone One-Command Installer for Windows (PowerShell + Docker Desktop)
# Usage:
#   irm https://raw.githubusercontent.com/rickicode/AxonRouter/main/scripts/install.ps1 | iex
#   # custom location:
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/rickicode/AxonRouter/main/scripts/install.ps1))) -Path D:\AxonRouter
param(
    [string]$Path   = (Join-Path $HOME "AxonRouter"),
    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
$RawBase  = "https://raw.githubusercontent.com/rickicode/AxonRouter/$Branch"
$PgImage  = "postgres:17-alpine"

Write-Host "==> AxonRouter Installer (Docker Compose)"
Write-Host "    Target directory: $Path"
Write-Host "    Mode: Zero-clone automated Docker deployment"

function New-RandomHex([int]$ByteCount) {
    $bytes = New-Object byte[] $ByteCount
    [System.Security.Cryptography.RandomNumberGenerator]::GetBytes($bytes)
    -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Get-EnvFile { Join-Path $Path ".env" }

function Set-EnvKey([string]$Key, [string]$Value) {
    $envFile = Get-EnvFile
    if (-not (Test-Path $envFile)) { New-Item -ItemType File -Path $envFile -Force | Out-Null }
    $lines = @(Get-Content $envFile)
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^$Key=") { $lines[$i] = "$Key=$Value"; $found = $true; break }
    }
    if (-not $found) { $lines += "$Key=$Value" }
    Set-Content -Path $envFile -Value $lines -Encoding ascii
}

function Get-EnvKey([string]$Key) {
    $envFile = Get-EnvFile
    if (-not (Test-Path $envFile)) { return "" }
    $line = Select-String -Path $envFile -Pattern "^$Key=" | Select-Object -First 1
    if ($line) { return ($line.Line -replace "^$Key=", "") }
    return ""
}

function Ask-Secret([string]$Key, [string]$Label, [string]$Default) {
    $val = Read-Host "    $Label [$Default]"
    if ([string]::IsNullOrWhiteSpace($val)) { $val = $Default }
    Set-EnvKey -Key $Key -Value $val
}

function Get-MaskedUrl([string]$Url) {
    $Url -replace '://([^/:]+):[^@]*@', '://\1:****@'
}

function Test-PostgresUrl([string]$Url) {
    if ($Url -notmatch '^postgres(ql)?://') {
        Write-Host "    [FAIL] URL must start with postgres:// or postgresql://"
        return $false
    }
    if ($Url -notmatch '@') {
        Write-Host "    [FAIL] URL is missing credentials (expected postgres://user:password@host:port/dbname)"
        return $false
    }
    Write-Host "    Verifying connection (TLS + auth + SELECT 1)..."
    $tmpFile = [System.IO.Path]::GetTempFileName()
    try {
        $result = docker run --rm `
            -e PGCONNECT_TIMEOUT=15 `
            $PgImage `
            psql $Url -tAc "SELECT 'AXON_OK_' || current_setting('server_version')" 2>&1
        $result | Out-File -FilePath $tmpFile -Encoding utf8
        if ($LASTEXITCODE -eq 0) {
            $ver = (Get-Content $tmpFile -Raw).Trim()
            Write-Host "    [OK] Postgres reachable — $ver"
            return $true
        }
        Write-Host "    [FAIL] Postgres rejected the connection:"
        Get-Content $tmpFile | Select-Object -First 8 | ForEach-Object { Write-Host "           $_" }
        return $false
    } finally {
        Remove-Item $tmpFile -ErrorAction SilentlyContinue
    }
}

# ---------- 1. Docker check with confirmation prompt ----------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "==> Docker Desktop is not installed on this system."
    $answer = Read-Host "    Install Docker Desktop now via winget? (yes/no) [yes]"
    if ([string]::IsNullOrWhiteSpace($answer)) { $answer = "yes" }
    if ($answer -notmatch '^(y|yes)$') {
        Write-Host "    AxonRouter requires Docker Desktop. Install manually: https://docs.docker.com/get-docker/"
        exit 1
    }
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host "    winget not found. Please install Docker Desktop manually: https://docs.docker.com/get-docker/"
        exit 1
    }
    winget install --id Docker.DockerDesktop -e --accept-source-agreements --accept-package-agreements
    Write-Host "    Starting Docker Desktop..."
    $dockerExe = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) { Start-Process $dockerExe }
    $ready = $false
    foreach ($i in 1..60) {
        Start-Sleep -Seconds 5
        docker info *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    }
    if (-not $ready) {
        Write-Warning "Docker engine is not responding yet. Open Docker Desktop and re-run this installer."
        exit 1
    }
}

docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker Compose plugin is required: https://docs.docker.com/compose/install/"
    exit 1
}

# ---------- 2. Prepare directory & download compose files ----------
if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
Set-Location $Path

Write-Host "==> Fetching docker-compose.yml from GitHub ($Branch)..."
Invoke-WebRequest -Uri "$RawBase/docker-compose.yml" -OutFile (Join-Path $Path "docker-compose.yml")

if (-not (Test-Path (Join-Path $Path ".env"))) {
    try {
        Invoke-WebRequest -Uri "$RawBase/.env.example" -OutFile (Join-Path $Path ".env.example")
        Copy-Item (Join-Path $Path ".env.example") (Join-Path $Path ".env")
    } catch {
        New-Item -ItemType File -Path (Join-Path $Path ".env") -Force | Out-Null
    }
}

# ---------- 3. Database backend selection ----------
Write-Host ""
Write-Host "==> Database Backend Selection:"
Write-Host "    [1] Built-in PostgreSQL container (Recommended for single-server setups)"
Write-Host "        Runs postgres:17-alpine as part of this stack; data in a Docker volume."
Write-Host "    [2] External / Managed PostgreSQL (Neon, Supabase, RDS, existing server)"
Write-Host "        The compose stack will NOT start a local Postgres container."
$dbChoice = Read-Host "    Choose database backend [1/2] (default: 1)"
if ([string]::IsNullOrWhiteSpace($dbChoice)) { $dbChoice = "1" }

$DbMode = "builtin"
$ExternalDatabaseUrl = ""
if ($dbChoice -match '^(2|external|extern|ext)$') { $DbMode = "external" }

if ($DbMode -eq "external") {
    Set-EnvKey -Key "COMPOSE_PROFILES" -Value ""
    $attempt = 1
    while ($true) {
        $extUrl = (Read-Host "    External PostgreSQL connection string (attempt $attempt)`n    > ").Trim()
        if ([string]::IsNullOrWhiteSpace($extUrl)) {
            Write-Host "    [FAIL] Empty URL. Enter a full URI, e.g.:"
            Write-Host "           postgres://user:password@host:5432/dbname?sslmode=require"
        } else {
            Write-Host "    Target: $(Get-MaskedUrl $extUrl)"
            if (Test-PostgresUrl -Url $extUrl) {
                $ExternalDatabaseUrl = $extUrl
                break
            }
        }
        $attempt++
        if ($attempt -gt 5) { Write-Host "==> Too many failed attempts. Aborting."; exit 1 }
        $retry = Read-Host "    Retry? (yes/no) [yes]"
        if ([string]::IsNullOrWhiteSpace($retry)) { $retry = "yes" }
        if ($retry -notmatch '^(y|yes)$') { Write-Host "==> Aborted: external database not reachable."; exit 1 }
    }
    Set-EnvKey -Key "DATABASE_URL" -Value $ExternalDatabaseUrl
    Write-Host "    -> External Postgres accepted. Local Postgres container disabled."
    Write-Host "       NOTE: AxonRouter runs its own schema DDL on boot — the role needs CREATE rights."
} else {
    Set-EnvKey -Key "COMPOSE_PROFILES" -Value "builtin-db"
    Write-Host "    -> Built-in PostgreSQL container will run inside this stack."
}

# ---------- 4. Gateway worker mode selection ----------
Write-Host ""
Write-Host "==> Gateway Worker Mode Configuration (Port 3778 - Hono Gateway):"
Write-Host "    [1] Cluster Mode (Recommended) — Multi-worker processes across CPU cores."
Write-Host "        Best for heavy coding agent traffic (Claude Code, Cursor, Codex)."
Write-Host "    [2] Standalone Mode — Single process, lowest RAM footprint."
Write-Host "        Best for small 1 CPU / 1GB-2GB VPS or lightweight personal use."
$modeChoice = Read-Host "    Choose Gateway Mode [1/2] (default: 1)"
if ([string]::IsNullOrWhiteSpace($modeChoice)) { $modeChoice = "1" }

if ($modeChoice -match '^(2|standalone|single|false|no)$') {
    Set-EnvKey -Key "GATEWAY_CLUSTER" -Value "false"
    Set-EnvKey -Key "GATEWAY_WORKERS" -Value "1"
    Write-Host "    -> Selected: Standalone Mode (Single Process, Cluster OFF)"
} else {
    Set-EnvKey -Key "GATEWAY_CLUSTER" -Value "true"
    $workers = Read-Host "    Enter number of worker processes [press Enter for auto/all CPU cores]"
    if ($workers -match '^\d+$') {
        Set-EnvKey -Key "GATEWAY_WORKERS" -Value $workers
        Write-Host "    -> Selected: Cluster Mode with $workers worker(s)"
    } else {
        Set-EnvKey -Key "GATEWAY_WORKERS" -Value "4"
        Write-Host "    -> Selected: Cluster Mode (Auto: 4 workers / CPU cores)"
    }
}

# ---------- 5. Secrets ----------
Write-Host ""
Write-Host "==> Configuring secrets in $Path\.env"
Write-Host "    Press Enter to accept each auto-generated value, or type your own:"

Ask-Secret -Key "JWT_SECRET"       -Label "Dashboard session secret (JWT_SECRET)"      -Default (New-RandomHex 32)
Ask-Secret -Key "API_KEY_SECRET"   -Label "Gateway token HMAC key (API_KEY_SECRET)"    -Default (New-RandomHex 32)
Ask-Secret -Key "MACHINE_ID_SALT"  -Label "Machine ID salt (MACHINE_ID_SALT)"          -Default (New-RandomHex 16)
Ask-Secret -Key "ENCRYPTION_KEY"   -Label "Credential encryption key (ENCRYPTION_KEY)" -Default (New-RandomHex 32)
Ask-Secret -Key "INITIAL_PASSWORD" -Label "Dashboard admin password (INITIAL_PASSWORD)" -Default (New-RandomHex 8)

if ($DbMode -eq "builtin") {
    Ask-Secret -Key "POSTGRES_PASSWORD" -Label "Built-in PostgreSQL password (POSTGRES_PASSWORD)" -Default (New-RandomHex 16)
    $pgPw = Get-EnvKey "POSTGRES_PASSWORD"
    Set-EnvKey -Key "DATABASE_URL" -Value "postgres://axonrouter:${pgPw}@postgres:5432/axonrouter"
    Write-Host "    -> DATABASE_URL wired to the in-stack postgres service."
} else {
    Write-Host "    -> Skipping POSTGRES_PASSWORD (external database in use)."
    Write-Host "    -> DATABASE_URL kept as the verified external connection string."
}

Write-Host "==> Configuration complete in $Path\.env"

# ---------- 6. Start stack ----------
Write-Host ""
$startNow = Read-Host "    Start AxonRouter now? (yes/no) [yes]"
if ([string]::IsNullOrWhiteSpace($startNow)) { $startNow = "yes" }

if ($startNow -match '^(y|yes)$') {
    Write-Host "==> Pulling pre-built images from GHCR and starting stack..."
    docker compose up -d
    Write-Host "==> AxonRouter successfully started!"
} else {
    Write-Host "==> Skipped startup. You can start it anytime with:"
    Write-Host "    cd $Path; docker compose up -d"
}

$profiles = Get-EnvKey "COMPOSE_PROFILES"
Write-Host ""
Write-Host "=========================================================="
Write-Host "    Compose file: $Path\docker-compose.yml"
Write-Host "    Environment:  $Path\.env"
Write-Host "    Database:     $DbMode  (COMPOSE_PROFILES=$profiles)"
Write-Host "    Dashboard UI: http://localhost:3777"
Write-Host "    Gateway API:  http://localhost:3778/v1"
Write-Host "    Commands:     cd $Path; docker compose ps | logs -f | down"
Write-Host "=========================================================="
