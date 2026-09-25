#!/bin/sh
# AxonRouter — Zero-Clone One-Command Installer (Docker Compose)
# Downloads docker-compose.yml + .env.example from GitHub (no git clone needed),
# asks for database backend (built-in container vs external managed Postgres),
# gateway worker topology, generates secrets, verifies DB connectivity, starts stack.
# Requires: curl, Docker Engine + Compose v2.20+.
set -e

INSTALL_DIR="${1:-$HOME/AxonRouter}"
BRANCH="${BRANCH:-main}"
RAW_BASE="${RAW_BASE:-https://raw.githubusercontent.com/rickicode/AxonRouter/$BRANCH}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"

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

# url_mask 'postgres://user:secret@host:5432/db' -> 'postgres://user:****@host:5432/db'
url_mask() {
  printf '%s' "$1" | sed -E 's#://([^/:]+):[^@]*@#://\1:****@#'
}

# verify_postgres_url URL -> runs psql SELECT 1 inside a throwaway container
verify_postgres_url() {
  _url="$1"
  case "$_url" in
    postgres://*|postgresql://*) ;;
    *)
      echo "    [FAIL] URL must start with postgres:// or postgresql://"
      return 1 ;;
  esac
  case "$_url" in
    *@*) ;;
    *)
      echo "    [FAIL] URL is missing credentials (expected postgres://user:password@host:port/dbname)"
      return 1 ;;
  esac
  if ! printf '%s' "$_url" | grep -qE '@[A-Za-z0-9._-]+(:[0-9]+)?/'; then
    echo "    [FAIL] URL is missing a host and/or database name"
    return 1
  fi

  echo "    Verifying connection (TLS + auth + SELECT 1)..."
  _tmpf="$(mktemp 2>/dev/null || echo .pgverify.$$)"
  if docker run --rm -i -e PGCONNECT_TIMEOUT=15 "$PG_IMAGE" \
      psql "$_url" -tAc "SELECT 'AXON_OK_' || current_setting('server_version')" > "$_tmpf" 2>&1; then
    _ver="$(tr -d '\r\n' < "$_tmpf")"
    rm -f "$_tmpf"
    echo "    [OK] Postgres reachable — $_ver"
    return 0
  fi
  echo "    [FAIL] Postgres rejected the connection:"
  sed 's/^/           /' "$_tmpf" | head -8
  rm -f "$_tmpf"
  return 1
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

# depends_on.required=false (external-DB mode) needs Compose v2.20+ / v3+
COMPOSE_VER="$(docker compose version --short 2>/dev/null | tr -d 'vV ' || echo "")"
COMPOSE_MAJOR="$(printf '%s' "$COMPOSE_VER" | cut -d. -f1 | tr -dc '0-9')"
COMPOSE_MINOR="$(printf '%s' "$COMPOSE_VER" | cut -d. -f2 | tr -dc '0-9')"
if [ -n "$COMPOSE_MAJOR" ] && [ "$COMPOSE_MAJOR" -lt 3 ] && { [ "$COMPOSE_MAJOR" -lt 2 ] || [ "${COMPOSE_MINOR:-0}" -lt 20 ]; }; then
  echo "ERROR: Docker Compose $COMPOSE_VER is too old. AxonRouter needs v2.20+ (optional depends_on)."
  echo "       Upgrade: https://docs.docker.com/compose/install/"
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

if [ ! -f .env ]; then
  if curl -fsSL "$RAW_BASE/.env.example" -o .env.example 2>/dev/null; then
    cp .env.example .env
  else
    touch .env
  fi
fi

# ---------- 3. Database backend selection ----------
echo ""
echo "==> Database Backend Selection:"
echo "    [1] Built-in PostgreSQL container (Recommended for single-server setups)"
echo "        Runs postgres:17-alpine as part of this stack; data in a Docker volume."
echo "    [2] External / Managed PostgreSQL (Neon, Supabase, RDS, existing server)"
echo "        The compose stack will NOT start a local Postgres container."
printf "    Choose database backend [1/2] (default: 1): "
IFS= read -r db_choice 2>/dev/null </dev/tty || db_choice=""
db_choice="${db_choice:-1}"

DB_MODE="builtin"
EXTERNAL_DATABASE_URL=""
case "$db_choice" in
  2|external|extern|ext)
    DB_MODE="external"
    ;;
esac

if [ "$DB_MODE" = "external" ]; then
  set_or_append_env "COMPOSE_PROFILES" ""
  attempt=1
  while : ; do
    printf "    External PostgreSQL connection string (attempt %s):\n    > " "$attempt"
    IFS= read -r ext_url 2>/dev/null </dev/tty || ext_url=""
    ext_url="$(printf '%s' "$ext_url" | tr -d ' \t')"
    if [ -z "$ext_url" ]; then
      echo "    [FAIL] Empty URL. Enter a full URI, e.g.:"
      echo "           postgres://user:password@host:5432/dbname?sslmode=require"
      attempt=$((attempt + 1))
      if [ "$attempt" -gt 5 ]; then echo "==> Too many failed attempts. Aborting."; exit 1; fi
      continue
    fi
    echo "    Target: $(url_mask "$ext_url")"
    if verify_postgres_url "$ext_url"; then
      EXTERNAL_DATABASE_URL="$ext_url"
      break
    fi
    printf "    Retry? (yes/no) [yes]: "
    IFS= read -r retry 2>/dev/null </dev/tty || retry=""
    retry="${retry:-yes}"
    case "$retry" in
      no|NO|No|n|N) echo "==> Aborted: external database not reachable."; exit 1 ;;
    esac
    attempt=$((attempt + 1))
    if [ "$attempt" -gt 5 ]; then echo "==> Too many failed attempts. Aborting."; exit 1; fi
  done
  set_or_append_env "DATABASE_URL" "$EXTERNAL_DATABASE_URL"
  echo "    -> External Postgres accepted. Local Postgres container disabled."
  echo "       NOTE: AxonRouter runs its own schema DDL on boot — the role needs CREATE rights."
else
  set_or_append_env "COMPOSE_PROFILES" "builtin-db"
  echo "    -> Built-in PostgreSQL container will run inside this stack."
fi

# ---------- 4. Gateway worker mode selection ----------
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
    if [ -n "$worker_num" ] && printf '%s' "$worker_num" | grep -q '^[0-9][0-9]*$'; then
      set_or_append_env "GATEWAY_WORKERS" "$worker_num"
      echo "    -> Selected: Cluster Mode with $worker_num worker(s)"
    else
      set_or_append_env "GATEWAY_WORKERS" "4"
      echo "    -> Selected: Cluster Mode (Auto: 4 workers / CPU cores)"
    fi
    ;;
esac

# ---------- 5. Secrets ----------
echo ""
echo "==> Configuring secrets in $INSTALL_DIR/.env"
echo "    Press Enter to accept each auto-generated value, or type your own:"

ask_secret JWT_SECRET      "Dashboard session secret (JWT_SECRET)"      "$(rand_hex 32)"
ask_secret API_KEY_SECRET  "Gateway token HMAC key (API_KEY_SECRET)"    "$(rand_hex 32)"
ask_secret MACHINE_ID_SALT "Machine ID salt (MACHINE_ID_SALT)"          "$(rand_hex 16)"
ask_secret ENCRYPTION_KEY  "Credential encryption key (ENCRYPTION_KEY)" "$(rand_hex 32)"
ask_secret INITIAL_PASSWORD "Dashboard admin password (INITIAL_PASSWORD)" "$(rand_hex 8)"

if [ "$DB_MODE" = "builtin" ]; then
  ask_secret POSTGRES_PASSWORD "Built-in PostgreSQL password (POSTGRES_PASSWORD)" "$(rand_hex 16)"
  PG_PW="$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)"
  set_or_append_env "DATABASE_URL" "postgres://axonrouter:${PG_PW}@postgres:5432/axonrouter"
  echo "    -> DATABASE_URL wired to the in-stack postgres service."
else
  echo "    -> Skipping POSTGRES_PASSWORD (external database in use)."
  echo "    -> DATABASE_URL kept as the verified external connection string."
fi

echo "==> Configuration complete in $INSTALL_DIR/.env"

# ---------- 6. Final config validation (compose must parse) ----------
if ! docker compose config -q; then
  echo "ERROR: docker compose rejected the generated configuration. Aborting."
  exit 1
fi

# ---------- 7. Start stack ----------
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
echo "    Database:     $DB_MODE  (COMPOSE_PROFILES=$(grep '^COMPOSE_PROFILES=' .env | cut -d= -f2-))"
echo "    Dashboard UI: http://localhost:3777"
echo "    Gateway API:  http://localhost:3778/v1"
echo "    Commands:     cd $INSTALL_DIR && docker compose ps | logs -f | down"
echo "=========================================================="
