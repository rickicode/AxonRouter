#!/bin/sh
# AxonRouter — One-Command Installer (Docker Compose, no git clone)
#
#   curl -sSL https://raw.githubusercontent.com/rickicode/AxonRouter/main/scripts/install.sh | sh
#   # unattended, external Postgres:
#   EXTERNAL_DATABASE_URL='postgres://user:pass@host:5432/db?sslmode=require' \
#     curl -sSL .../install.sh | sh
set -e

TARGET_DIR="${1:-$HOME/AxonRouter}"
DISPLAY_DIR="$(printf '%s' "$TARGET_DIR" | sed "s|^$HOME|~|")"
RAW="${RAW:-https://raw.githubusercontent.com/rickicode/AxonRouter/main}"

# ---------- colors (off when stdout is not a TTY, or NO_COLOR is set) ----------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != "dumb" ]; then
  R="$(printf '\033[0m')";  B="$(printf '\033[1m')"
  RED="$(printf '\033[31m')";  GRN="$(printf '\033[32m')"
  YLW="$(printf '\033[33m')";  CYN="$(printf '\033[36m')"
else
  R=""; B=""; RED=""; GRN=""; YLW=""; CYN=""
fi
info() { printf '%s==>%s %s\n' "$CYN$B" "$R" "$*"; }
ok()   { printf '%s[ok]%s %s\n'  "$GRN$B" "$R" "$*"; }
warn() { printf '%s[!!]%s %s\n'  "$YLW$B" "$R" "$*" >&2; }
die()  { printf '%s[xx] ERROR:%s %s\n' "$RED$B" "$R" "$*" >&2; exit 1; }

printf '\n%s  AxonRouter installer%s\n  Location: %s\n\n' "$CYN$B" "$R" "$DISPLAY_DIR"

rand_hex() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "$1";
  else head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}

HAS_TTY=0
if [ -c /dev/tty ]; then
  if sh -c ": </dev/tty" 2>/dev/null; then HAS_TTY=1; fi
fi

read_input() {
  _val=""
  if [ "$HAS_TTY" = "1" ]; then
    IFS= read -r _val </dev/tty 2>/dev/null || _val=""
  fi
  printf '%s' "$_val"
}

# ---------- 1. Docker ----------
if ! command -v docker >/dev/null 2>&1; then
  printf '%s==>%s Docker not found. Install now? (yes/no) [yes]: ' "$CYN$B" "$R"
  a="$(read_input)"
  case "${a:-yes}" in
    y|Y|yes|YES)
      info "Installing Docker Engine via get.docker.com ..."
      curl -sSL https://get.docker.com | sh </dev/null ;;
    *) die "Docker is required." ;;
  esac
fi
docker compose version >/dev/null 2>&1 </dev/null || die "Docker Compose plugin is required."

# ---------- 2. Download compose files ----------
mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"
info "Downloading compose files ..."
curl -fsSL "$RAW/docker-compose.yml" -o docker-compose.yml </dev/null
curl -fsSL "$RAW/docker-compose.postgres.yml" -o docker-compose.postgres.yml </dev/null
curl -fsSL "$RAW/docker-compose.valkey.yml" -o docker-compose.valkey.yml </dev/null || warn "Could not download docker-compose.valkey.yml; the built-in Valkey option will fall back to memory-only."
if [ ! -f .env ]; then
  curl -fsSL "$RAW/.env.example" -o .env.example </dev/null && cp .env.example .env || : > .env
fi

set_env() {
  if grep -q "^$1=" .env 2>/dev/null; then
    awk -v k="$1" -v v="$2" '$0 ~ "^"k"=" {print k"="v; next} {print}' .env > .env.tmp && mv .env.tmp .env
  else
    echo "$1=$2" >> .env
  fi
}

# ---------- 3. Fast TCP Port ping (Zero apt-get / dnf / pacman overhead) ----------
# Ping host & port using built-in /dev/tcp, nc, python3, or perl (No package installation needed)
ping_db_port() {
  _url="$1"
  # Extract host and port (postgres://, postgresql://, redis://, rediss://, valkey://)
  _hp="$(printf '%s' "$_url" | sed -E 's#^(postgres(ql)?|redis(s)?|valkey)://([^@]+@)?([^/?#]+).*#\5#')"
  _host="$(printf '%s' "$_hp" | cut -d: -f1)"
  _port="$(printf '%s' "$_hp" | cut -s -d: -f2)"
  case "$_url" in
    redis://*|rediss://*|valkey://*) _port="${_port:-6379}" ;;
    *) _port="${_port:-5432}" ;;
  esac

  info "Testing TCP connection to $_host:$_port ..."

  # Method 1: bash /dev/tcp (if bash available)
  if command -v bash >/dev/null 2>&1; then
    if timeout 5 bash -c "(echo > /dev/tcp/$_host/$_port) >/dev/null 2>&1" 2>/dev/null; then
      ok "Port $_host:$_port is open and responding."
      return 0
    fi
  fi

  # Method 2: nc (netcat)
  if command -v nc >/dev/null 2>&1; then
    if nc -z -w 5 "$_host" "$_port" 2>/dev/null; then
      ok "Port $_host:$_port is open and responding."
      return 0
    fi
  fi

  # Method 3: python3 (pre-installed on Ubuntu, Debian, RHEL, Arch)
  if command -v python3 >/dev/null 2>&1; then
    if python3 -c "import socket; s = socket.socket(); s.settimeout(5); s.connect(('$_host', int('$_port'))); s.close()" 2>/dev/null; then
      ok "Port $_host:$_port is open and responding."
      return 0
    fi
  fi

  # Method 4: perl
  if command -v perl >/dev/null 2>&1; then
    if perl -MIO::Socket::INET -e "exit(!IO::Socket::INET->new(PeerAddr=>'$_host', PeerPort=>'$_port', Timeout=>5))" 2>/dev/null; then
      ok "Port $_host:$_port is open and responding."
      return 0
    fi
  fi

  # Method 5: node (if available)
  if command -v node >/dev/null 2>&1; then
    if node -e "const net = require('net'); const s = net.createConnection({host: '$_host', port: Number('$_port'), timeout: 5000}, () => { s.end(); process.exit(0); }); s.on('error', () => process.exit(1)); s.on('timeout', () => process.exit(1));" 2>/dev/null; then
      ok "Port $_host:$_port is open and responding."
      return 0
    fi
  fi

  warn "No TCP ping utility available (or the port is blocked by a firewall)."
  warn "Continuing anyway; the database connection will be verified when the container boots."
  return 0
}

# ---------- 4. Database backend selection ----------
DB_MODE="1"
DBURL="${EXTERNAL_DATABASE_URL:-}"
if [ -n "$DBURL" ]; then
  DB_MODE="2"
elif [ "$HAS_TTY" = "1" ]; then
  printf '%s==>%s Which PostgreSQL backend do you want to use?\n' "$CYN$B" "$R"
  printf '    %s[1]%s Built-in PostgreSQL (Docker container, automatic) %s[default]%s\n' "$GRN$B" "$R" "$CYN" "$R"
  printf '    %s[2]%s External PostgreSQL (Neon / Supabase / RDS / any server)\n' "$YLW$B" "$R"
  printf '    Choose [1/2] (Enter = 1): '
  case "$(read_input)" in
    2|external|ext) DB_MODE="2" ;;
    *) DB_MODE="1" ;;
  esac
fi

if [ "$DB_MODE" = "2" ]; then
  if [ -z "$DBURL" ]; then
    printf '\n    Enter your external PostgreSQL connection string:\n'
    printf '    (example: postgres://user:password@host:5432/db?sslmode=require)\n'
    printf '    %sNOTE: Must be a direct connection. DO NOT use transaction poolers / PgBouncer.%s\n' "$YLW$B" "$R"
    printf '    %s      (For Neon: select Direct connection without "-pooler"; Supabase: use port 5432)%s\n' "$YLW" "$R"
    printf '    > '
    DBURL="$(read_input)"
  fi
  DBURL="$(printf '%s' "$DBURL" | tr -d ' \t')"
  case "$DBURL" in
    postgres://*|postgresql://*) ;;
    *) die "Invalid URL, it must start with postgres:// or postgresql://" ;;
  esac

  # Neon pooler -> prefer direct compute (one less hop, no double pooling).
  # Generic transaction poolers (Supabase 6543 / PgBouncer) are SUPPORTED at
  # runtime: postgresAdapter sets prepare=false so prepared statements don't
  # collide across pooled sessions. We keep all locks as xact-scoped advisory
  # locks + row FOR UPDATE (no LISTEN/NOTIFY, temp tables, or session GUCs).
  if printf '%s' "$DBURL" | grep -qE 'neon\.tech' && printf '%s' "$DBURL" | grep -qE -- '-pooler'; then
    DBURL="$(printf '%s' "$DBURL" | sed -E 's/-pooler(\.[a-zA-Z0-9.-]+\.neon\.tech|\.neon\.tech)/\1/g')"
    warn "Detected Neon pooler URL. Automatically switched to the direct compute endpoint (faster, one less hop). Set NEON_FORCE_POOLER=true to keep the pooler."
  elif printf '%s' "$DBURL" | grep -qE 'pooler\.supabase\.com:6543|:6543/|\.pgbouncer\.'; then
    warn "Transaction pooler detected. AxonRouter supports it (prepared statements auto-disabled), but a direct/session endpoint is faster. Continuing with the pooler."
  fi

  # Fast lightweight TCP ping (instant, zero apt-get/dnf/pacman)
  ping_db_port "$DBURL"

  COMPOSE_OVERLAYS="docker-compose.yml"
  set_env DATABASE_URL "$DBURL"
  ok "External PostgreSQL selected (the local Postgres container will NOT run)."
  warn "Make sure the PostgreSQL role has CREATE rights (the schema is applied on boot)."
else
  COMPOSE_OVERLAYS="docker-compose.yml:docker-compose.postgres.yml"
  set_env POSTGRES_PASSWORD "$(rand_hex 16)"
  PG_PW="$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)"
  set_env DATABASE_URL "postgres://axonrouter:${PG_PW}@postgres:5432/axonrouter"
  ok "Using built-in PostgreSQL (postgres:17-alpine container enabled)."
fi

# ---------- 4b. Valkey speed layer (cross-process realtime state) ----------
# Valkey holds the shared active-request registry, recent-request ring, account
# cooldowns and rotation mutexes, and fans /api/usage/stream events to every
# worker. It is optional: with no Valkey reachable the app fails open to
# per-process memory, so the dashboard only sees its own worker's traffic.
VALKEY_MODE="1"
VALKEYURL="${EXTERNAL_VALKEY_URL:-${REDIS_URL:-}}"
if [ -n "$VALKEYURL" ]; then
  VALKEY_MODE="2"
elif [ "$HAS_TTY" = "1" ] && [ -f docker-compose.valkey.yml ]; then
  printf '\n%s==>%s Enable the Valkey speed layer for cross-worker realtime state?\n' "$CYN$B" "$R"
  printf '    %s[1]%s Built-in Valkey 8 (Docker container, recommended) %s[default]%s\n' "$GRN$B" "$R" "$CYN$R"
  printf '    %s[2]%s External Redis/Valkey (ElastiCache / Upstash / any server)\n' "$YLW$B" "$R"
  printf '    %s[3]%s None (memory-only; each worker keeps private state)\n' "$RED$B" "$R"
  printf '    Choose [1/2/3] (Enter = 1): '
  case "$(read_input)" in
    3|none|off|no) VALKEY_MODE="3" ;;
    2|external|ext) VALKEY_MODE="2" ;;
    *) VALKEY_MODE="1" ;;
  esac
elif [ ! -f docker-compose.valkey.yml ]; then
  warn "docker-compose.valkey.yml missing; skipping Valkey setup (memory-only speed layer)."
  VALKEY_MODE="3"
fi

if [ "$VALKEY_MODE" = "2" ]; then
  if [ -z "$VALKEYURL" ]; then
    printf '\n    Enter your Redis/Valkey connection URL:\n'
    printf '    (example: redis://user:password@host:6379/0  |  rediss:// for TLS)\n'
    printf '    > '
    VALKEYURL="$(read_input)"
  fi
  VALKEYURL="$(printf '%s' "$VALKEYURL" | tr -d ' \t')"
  case "$VALKEYURL" in
    redis://*|rediss://*) ;;
    # ioredis has no valkey:// scheme and would silently mis-parse it, so refuse it.
    valkey://*) die "Unsupported scheme 'valkey://'. ioredis does not recognise it and would connect to the wrong host. Use redis:// or rediss:// (Valkey speaks the Redis protocol)." ;;
    *) die "Invalid URL, it must start with redis:// or rediss://" ;;
  esac

  ping_db_port "$VALKEYURL"

  set_env VALKEY_URL "$VALKEYURL"
  ok "External Redis/Valkey selected (no local Valkey container will run)."
elif [ "$VALKEY_MODE" = "1" ]; then
  COMPOSE_OVERLAYS="$COMPOSE_OVERLAYS:docker-compose.valkey.yml"
  set_env VALKEY_URL "redis://valkey:6379"
  ok "Using built-in Valkey 8 (axonrouter-valkey container enabled)."
else
  # Keep any previously written VALKEY_URL from a prior run harmless: an empty
  # value makes the client use its 127.0.0.1 default and fail open to memory.
  set_env VALKEY_URL ""
  warn "No Valkey: realtime state stays per-process (memory-only speed layer)."
fi

set_env COMPOSE_FILE "$COMPOSE_OVERLAYS"

# ---------- 5. Gateway workers (max = CPU cores) ----------
CORES="$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1)"
REQ_WORKERS="${GATEWAY_WORKERS:-$CORES}"
if [ "$REQ_WORKERS" -gt "$CORES" ] 2>/dev/null; then
  WORKERS="$CORES"
elif [ "$REQ_WORKERS" -ge 1 ] 2>/dev/null; then
  WORKERS="$REQ_WORKERS"
else
  WORKERS="$CORES"
fi

if [ "$GATEWAY_CLUSTER" = "false" ] || [ "$WORKERS" -le 1 ]; then
  set_env GATEWAY_CLUSTER "false"
  set_env GATEWAY_WORKERS "1"
  ok "Gateway: standalone (single process, lowest memory footprint)"
else
  set_env GATEWAY_CLUSTER "true"
  set_env GATEWAY_WORKERS "$WORKERS"
  ok "Gateway: cluster ($WORKERS workers, capped at $CORES CPU cores)"
fi

# ---------- 6. Secrets & Base Configuration ----------
info "Configuring environment & generating secrets ..."
set_env BASE_URL         "${BASE_URL:-http://localhost:3777}"
set_env CLOUD_URL        "${CLOUD_URL:-}"
set_env JWT_SECRET       "$(rand_hex 32)"
set_env API_KEY_SECRET   "$(rand_hex 32)"
set_env MACHINE_ID_SALT  "$(rand_hex 16)"
set_env ENCRYPTION_KEY   "$(rand_hex 32)"
ADMIN_PASS="${INITIAL_PASSWORD:-12345677}"
set_env INITIAL_PASSWORD "$ADMIN_PASS"

# ---------- 7. Start ----------
info "Starting stack (docker compose up -d) ..."
docker compose up -d </dev/null

printf '\n%s========================================================================%s\n' "$CYN$B" "$R"
printf '  %s✓ AxonRouter installed successfully and running!%s\n' "$GRN$B" "$R"
printf '========================================================================\n'
printf '  • Stack directory : %s%s%s\n' "$B" "$DISPLAY_DIR" "$R"
printf '  • Database mode   : %s%s%s\n' "$B" "$([ "$DB_MODE" = "2" ] && echo "External PostgreSQL (Neon / managed)" || echo "Built-in PostgreSQL 17 container")" "$R"
case "$VALKEY_MODE" in
  2) SPEED_LAYER="External Redis/Valkey (shared realtime state across workers)" ;;
  3) SPEED_LAYER="memory-only (each worker keeps private realtime state)" ;;
  *) SPEED_LAYER="Built-in Valkey 8 container (shared realtime state across workers)" ;;
esac
printf '  • Speed layer     : %s%s%s\n' "$B" "$SPEED_LAYER" "$R"
printf '  • Dashboard       : %shttp://localhost:3777%s\n' "$CYN$B" "$R"
printf '  • Login password  : %s%s%s  (password only, no username)\n' "$GRN$B" "$ADMIN_PASS" "$R"
printf '\n  %s[PORTS & GATEWAY API]%s\n' "$YLW$B" "$R"
printf '  • Port 3777       : Dashboard control plane, web UI & admin settings\n'
printf '  • Port 3778       : Dedicated high-throughput Hono API gateway (/v1)\n'
printf '    - OpenAI API    : %shttp://localhost:3778/v1/chat/completions%s\n' "$B" "$R"
printf '    - Claude/Anthrop: %shttp://localhost:3778/v1/messages%s\n' "$B" "$R"
printf '    - Model list    : %shttp://localhost:3778/v1/models%s\n' "$B" "$R"
printf '    - Client base URL: %shttp://localhost:3778/v1%s  (use in Cursor, Claude Code, Cline, etc.)\n' "$CYN$B" "$R"
printf '\n  %s[RESET PASSWORD]%s\n' "$YLW$B" "$R"
printf '  • Run this one-liner anytime if you forget your password:\n'
printf '    %scurl -sSL https://raw.githubusercontent.com/rickicode/AxonRouter/main/scripts/reset-password.sh | sh%s\n' "$GRN" "$R"
printf '    (or change it in the dashboard: Settings -> Security)\n'
printf '\n  %s[MANAGE CONTAINERS]%s\n' "$CYN$B" "$R"
printf '  • Status          : cd %s && docker compose ps\n' "$DISPLAY_DIR"
printf '  • Logs            : cd %s && docker compose logs -f\n' "$DISPLAY_DIR"
printf '  • Stop the stack  : cd %s && docker compose down\n' "$DISPLAY_DIR"
printf '========================================================================%s\n' "$R"
