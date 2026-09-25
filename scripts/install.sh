#!/bin/sh
# AxonRouter — Zero-Clone One-Command Installer (Docker Compose)
# Downloads docker-compose.yml and .env.example directly from GitHub,
# asks interactive configuration (including Gateway Worker Mode),
# auto-generates cryptographic secrets, and runs the stack.
# No git clone required!
set -e

INSTALL_DIR="${1:-$HOME/AxonRouter}"
BRANCH="${BRANCH:-main}"
RAW_BASE="${RAW_BASE:-https://raw.githubusercontent.com/rickicode/AxonRouter/$BRANCH}"

echo "==> AxonRouter Installer (Docker Compose)"
echo "    Target directory: $INSTALL_DIR"
echo "    Mode: Zero-clone automated Docker deployment"

# ---------- helpers ----------
rand_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

set_or_append_env() {
  var="$1"; val="$2"
  if [ -f .env ] && grep -q "^${var}=" .env; then
    awk -v k="$var" -v v="$val" 'BEGIN{d=0} $0 ~ "^"k"=" { if(!d){print k"="v; d=1; next} } {print}' .env > .env.tmp
    mv .env.tmp .env
  else
    printf '%s=%s\n' "$var" "$val" >> .env
  fi
}

ask_secret() {
  var="$1"; label="$2"; default="$3"
  printf "    %s [%s]: " "$label" "$default"
  IFS= read -r input 2>/dev/null </dev/tty || input=""
  value="${input:-$default}"
  set_or_append_env "$var" "$value"
}

# ---------- 1. Docker check & auto-install ----------
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Docker is not installed on this system."
  printf "    Install Docker now? (yes/no) [yes]: "
  IFS= read -r answer 2>/dev/null </dev/tty || answer=""
  answer="${answer:-yes}"
  case "$answer" in
    yes|YES|Yes|y|Y)
      echo "==> Installing Docker Engine via https://get.docker.com ..."
      curl -sSL https://get.docker.com | sh
      if [ "$(id -u)" != "0" ] && ! docker info >/dev/null 2>&1; then
        echo "    NOTE: If docker fails with permission denied, run:"
        echo "          sudo usermod -aG docker $(whoami)   # then log out and back in"
      fi
      ;;
    *)
      echo "==> Docker installation skipped. AxonRouter requires Docker."
      exit 1
      ;;
  esac
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Docker Compose plugin is required. Install it: https://docs.docker.com/compose/install/"
  exit 1
fi

# ---------- 2. Prepare directory & download compose files (NO GIT CLONE) ----------
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo "==> Fetching docker-compose.yml from GitHub ($BRANCH) ..."
curl -fsSL "$RAW_BASE/docker-compose.yml" -o docker-compose.yml || {
  echo "ERROR: Failed to download docker-compose.yml from $RAW_BASE"
  exit 1
}

# Download .env.example as baseline template if .env does not exist yet
if [ ! -f .env ]; then
  if curl -fsSL "$RAW_BASE/.env.example" -o .env.example 2>/dev/null; then
    cp .env.example .env
  else
    touch .env
  fi
fi

# ---------- 3. Gateway Worker Mode Selection ----------
echo ""
echo "==> Gateway Worker Mode Configuration (Port 3778 - Hono Gateway):"
echo "    [1] Cluster Mode (Recommended) — Multiple worker processes (auto CPU cores)."
echo "        Best for heavy coding agent traffic (Claude Code, Cursor, Codex)."
echo "    [2] Standalone Mode — Single process, lowest RAM footprint."
echo "        Best for small 1 CPU / 1GB-2GB VPS or lightweight personal use."
printf "    Choose Gateway Mode [1/2] (default: 1): "
IFS= read -r mode_choice 2>/dev/null </dev/tty || mode_choice=""
mode_choice="${mode_choice:-1}"

case "$mode_choice" in
  2|standalone|single|false|no)
    set_or_append_env "GATEWAY_CLUSTER" "false"
    set_or_append_env "GATEWAY_WORKERS" "1"
    echo "    -> Selected: Standalone Mode (Single Process, Cluster OFF)"
    ;;
  *)
    set_or_append_env "GATEWAY_CLUSTER" "true"
    printf "    Enter number of worker processes [press Enter for auto/all CPU cores]: "
    IFS= read -r worker_num 2>/dev/null </dev/tty || worker_num=""
    if [ -n "$worker_num" ] && echo "$worker_num" | grep -q '^[0-9]\+$'; then
      set_or_append_env "GATEWAY_WORKERS" "$worker_num"
      echo "    -> Selected: Cluster Mode with $worker_num worker(s)"
    else
      set_or_append_env "GATEWAY_WORKERS" "4"
      echo "    -> Selected: Cluster Mode (Auto: 4 workers / CPU cores)"
    fi
    ;;
esac

# ---------- 4. Configure cryptographic secrets into .env ----------
echo ""
echo "==> Configuring secrets in $INSTALL_DIR/.env"
echo "    Press Enter to accept each auto-generated value, or type your own:"

JWT_SECRET_DEFAULT="$(rand_hex 32)"
API_KEY_SECRET_DEFAULT="$(rand_hex 32)"
MACHINE_ID_SALT_DEFAULT="$(rand_hex 16)"
ENCRYPTION_KEY_DEFAULT="$(rand_hex 32)"
POSTGRES_PASSWORD_DEFAULT="$(rand_hex 16)"
INITIAL_PASSWORD_DEFAULT="$(rand_hex 8)"

ask_secret JWT_SECRET        "Dashboard session secret (JWT_SECRET)"       "$JWT_SECRET_DEFAULT"
ask_secret API_KEY_SECRET    "Gateway token HMAC key (API_KEY_SECRET)"     "$API_KEY_SECRET_DEFAULT"
ask_secret MACHINE_ID_SALT   "Machine ID salt (MACHINE_ID_SALT)"           "$MACHINE_ID_SALT_DEFAULT"
ask_secret ENCRYPTION_KEY    "Credential encryption key (ENCRYPTION_KEY)"   "$ENCRYPTION_KEY_DEFAULT"
ask_secret POSTGRES_PASSWORD "PostgreSQL password (POSTGRES_PASSWORD)"     "$POSTGRES_PASSWORD_DEFAULT"
ask_secret INITIAL_PASSWORD  "Dashboard admin password (INITIAL_PASSWORD)"  "$INITIAL_PASSWORD_DEFAULT"

# Keep DATABASE_URL in sync with chosen POSTGRES_PASSWORD
PG_PW="$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)"
awk -v pw="$PG_PW" '{ sub(/^DATABASE_URL=postgres:\/\/axonrouter:[^@]*@/, "DATABASE_URL=postgres://axonrouter:" pw "@"); print }' .env > .env.tmp
mv .env.tmp .env

echo "==> Configuration complete in $INSTALL_DIR/.env"

# ---------- 5. Start Docker stack ----------
echo ""
printf "    Start AxonRouter now? (yes/no) [yes]: "
IFS= read -r start_now 2>/dev/null </dev/tty || start_now=""
start_now="${start_now:-yes}"

case "$start_now" in
  yes|YES|Yes|y|Y)
    echo "==> Pulling pre-built images from GHCR and starting stack..."
    docker compose up -d
    echo ""
    echo "==> AxonRouter successfully started!"
    ;;
  *)
    echo "==> Skipped startup. You can start it anytime with:"
    echo "    cd $INSTALL_DIR && docker compose up -d"
    ;;
esac

echo ""
echo "=========================================================="
echo "    Compose file: $INSTALL_DIR/docker-compose.yml"
echo "    Environment:  $INSTALL_DIR/.env"
echo "    Dashboard UI: http://localhost:3777"
echo "    Gateway API:  http://localhost:3778/v1"
echo "    Commands:     cd $INSTALL_DIR && docker compose ps | logs -f | down"
echo "=========================================================="
