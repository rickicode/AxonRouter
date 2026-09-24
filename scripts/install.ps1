# AxonRouter — One-command installer for Windows (PowerShell + Docker Desktop)
# Usage:
#   irm https://raw.githubusercontent.com/rickicode/AxonRouter/main/scripts/install.ps1 | iex
#   # custom location:
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/rickicode/AxonRouter/main/scripts/install.ps1))) -Path D:\AxonRouter
param(
    [string]$Path = (Join-Path $HOME "AxonRouter")
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/rickicode/AxonRouter.git"

Write-Host "==> AxonRouter installer (Docker Compose)"
Write-Host "    Compose file location: $Path\docker-compose.yml"

function New-RandomHex([int]$ByteCount) {
    $bytes = New-Object byte[] $ByteCount
    [System.Security.Cryptography.RandomNumberGenerator]::GetBytes($bytes)
    -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Set-EnvKey([string]$Key, [string]$Value) {
    $envFile = Join-Path $Path ".env"
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

function Get-EnvKey([string]$Key) {
    $line = Select-String -Path (Join-Path $Path ".env") -Pattern "^$Key=" | Select-Object -First 1
    if ($line) { return ($line.Line -replace "^$Key=", "") }
    return ""
}

function Ask-Secret([string]$Key, [string]$Label, [string]$Default) {
    $val = Read-Host "    $Label [$Default]"
    if ([string]::IsNullOrWhiteSpace($val)) { $val = $Default }
    Set-EnvKey -Key $Key -Value $val
}

# ---------- 1. Git check ----------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "==> Git is not installed on this system."
    $answer = Read-Host "    Install Git now via winget? (yes/no)"
    if ($answer -notmatch '^(y|yes)$') {
        Write-Host "    Git is required. Install: https://git-scm.com/download/win"
        exit 1
    }
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host "    winget not found. Install Git manually: https://git-scm.com/download/win"
        exit 1
    }
    winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}

# ---------- 2. Docker check with confirmation prompt ----------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "==> Docker is not installed on this system."
    $answer = Read-Host "    Install Docker Desktop now? (yes/no)"
    if ($answer -notmatch '^(y|yes)$') {
        Write-Host "    AxonRouter requires Docker Desktop. Install: https://docs.docker.com/get-docker/"
        exit 1
    }
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host "    winget not found. Install Docker Desktop manually: https://docs.docker.com/get-docker/"
        exit 1
    }
    winget install --id Docker.DockerDesktop -e --accept-source-agreements --accept-package-agreements
    Write-Host "    Starting Docker Desktop (this can take a minute)..."
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

# ---------- 3. Clone the repo ----------
if (-not (Test-Path (Join-Path $Path ".git"))) {
    Write-Host "==> Cloning AxonRouter to $Path ..."
    git clone --depth 1 $RepoUrl $Path
}
Set-Location $Path

# ---------- 4. Bootstrap .env ----------
if (-not (Test-Path (Join-Path $Path ".env"))) {
    Write-Host "==> Creating .env from .env.example ..."
    Copy-Item .env.example .env
}

# ---------- 5. Auto-generate secrets (press Enter to accept) ----------
Write-Host "==> Configuring secrets in $Path\.env"
Write-Host "    Press Enter to accept the auto-generated value, or type your own."

Ask-Secret -Key "JWT_SECRET"        -Label "Dashboard session secret (JWT_SECRET)"       -Default (New-RandomHex 32)
Ask-Secret -Key "API_KEY_SECRET"    -Label "Gateway token HMAC key (API_KEY_SECRET)"     -Default (New-RandomHex 32)
Ask-Secret -Key "MACHINE_ID_SALT"   -Label "Machine ID salt (MACHINE_ID_SALT)"          -Default (New-RandomHex 16)
Ask-Secret -Key "ENCRYPTION_KEY"    -Label "Credential encryption key (ENCRYPTION_KEY)"  -Default (New-RandomHex 32)
Ask-Secret -Key "POSTGRES_PASSWORD" -Label "PostgreSQL password (POSTGRES_PASSWORD)"     -Default (New-RandomHex 16)
Ask-Secret -Key "INITIAL_PASSWORD"  -Label "Dashboard admin password (INITIAL_PASSWORD)" -Default (New-RandomHex 8)

# Keep DATABASE_URL in sync with the chosen PostgreSQL password.
$pgPw = Get-EnvKey "POSTGRES_PASSWORD"
$envContent = Get-Content (Join-Path $Path ".env") -Raw
$envContent = $envContent -replace "DATABASE_URL=postgres://axonrouter:[^@]+@", "DATABASE_URL=postgres://axonrouter:$pgPw@"
Set-Content -Path (Join-Path $Path ".env") -Value $envContent -Encoding ascii -NoNewline

Write-Host "==> Secrets written to $Path\.env"

# ---------- 6. Start the stack ----------
$answer = Read-Host "    Start the stack now? (yes/no)"
if ($answer -match '^(y|yes)$') {
    Write-Host "==> docker compose up -d  (GHCR images)"
    docker compose up -d
    Write-Host "==> Stack started."
} else {
    Write-Host "==> Skipped. Start later with:"
    Write-Host "    cd `"$Path`"; docker compose up -d"
}

Write-Host "==> Done."
Write-Host "    Compose file: $Path\docker-compose.yml"
Write-Host "    Manage stack: cd `"$Path`"; docker compose ps / logs -f / down"
Write-Host "    Dashboard:    http://localhost:3777/dashboard"
Write-Host "    Gateway API:  http://localhost:3778/v1"
