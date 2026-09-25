# AxonRouter — Zero-Clone One-Command Installer for Windows (PowerShell + Docker Desktop)
# Usage:
#   irm https://raw.githubusercontent.com/rickicode/AxonRouter/main/scripts/install.ps1 | iex
#   # custom location:
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/rickicode/AxonRouter/main/scripts/install.ps1))) -Path D:\AxonRouter
param(
    [string]$Path = (Join-Path $HOME "AxonRouter"),
    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
$RawBase = "https://raw.githubusercontent.com/rickicode/AxonRouter/$Branch"

Write-Host "==> AxonRouter Installer (Docker Compose)"
Write-Host "    Target directory: $Path"
Write-Host "    Mode: Zero-clone automated Docker deployment"

function New-RandomHex([int]$ByteCount) {
    $bytes = New-Object byte[] $ByteCount
    [System.Security.Cryptography.RandomNumberGenerator]::GetBytes($bytes)
    -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Set-EnvKey([string]$Key, [string]$Value) {
    $envFile = Join-Path $Path ".env"
    if (-not (Test-Path $envFile)) { New-Item -ItemType File -Path $envFile -Force | Out-Null }
    $lines = Get-Content $envFile
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^$Key=") {
            $lines[$i] = "$Key=$Value"
            $found = $true
            break
        }
    }
    if (-not $found) { $lines += "$Key=$Value" }
    Set-Content -Path $envFile -Value $lines -Encoding ascii
}

function Ask-Secret([string]$Key, [string]$Label, [string]$Default) {
    $val = Read-Host "    $Label [$Default]"
    if ([string]::IsNullOrWhiteSpace($val)) { $val = $Default }
    Set-EnvKey -Key $Key -Value $val
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

# ---------- 2. Prepare directory & download compose files (NO GIT CLONE) ----------
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

# ---------- 3. Gateway Worker Mode Selection ----------
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

# ---------- 4. Configure cryptographic secrets into .env ----------
Write-Host ""
Write-Host "==> Configuring secrets in $Path\.env"
Write-Host "    Press Enter to accept each auto-generated value, or type your own:"

Ask-Secret -Key "JWT_SECRET"        -Label "Dashboard session secret (JWT_SECRET)"       -Default (New-RandomHex 32)
Ask-Secret -Key "API_KEY_SECRET"    -Label "Gateway token HMAC key (API_KEY_SECRET)"     -Default (New-RandomHex 32)
Ask-Secret -Key "MACHINE_ID_SALT"   -Label "Machine ID salt (MACHINE_ID_SALT)"          -Default (New-RandomHex 16)
Ask-Secret -Key "ENCRYPTION_KEY"    -Label "Credential encryption key (ENCRYPTION_KEY)"  -Default (New-RandomHex 32)
Ask-Secret -Key "POSTGRES_PASSWORD" -Label "PostgreSQL password (POSTGRES_PASSWORD)"     -Default (New-RandomHex 16)
Ask-Secret -Key "INITIAL_PASSWORD"  -Label "Dashboard admin password (INITIAL_PASSWORD)" -Default (New-RandomHex 8)

# Keep DATABASE_URL in sync with chosen POSTGRES_PASSWORD
$envFile = Join-Path $Path ".env"
$pgPw = (Select-String -Path $envFile -Pattern "^POSTGRES_PASSWORD=" | Select-Object -First 1).Line -replace "^POSTGRES_PASSWORD=", ""
$content = (Get-Content $envFile) -replace "^DATABASE_URL=postgres://axonrouter:[^@]*@", "DATABASE_URL=postgres://axonrouter:$pgPw@"
Set-Content -Path $envFile -Value $content -Encoding ascii

Write-Host "==> Configuration complete in $Path\.env"

# ---------- 5. Start Docker stack ----------
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

Write-Host ""
Write-Host "=========================================================="
Write-Host "    Compose file: $Path\docker-compose.yml"
Write-Host "    Environment:  $Path\.env"
Write-Host "    Dashboard UI: http://localhost:3777"
Write-Host "    Gateway API:  http://localhost:3778/v1"
Write-Host "    Commands:     cd $Path; docker compose ps | logs -f | down"
Write-Host "=========================================================="
