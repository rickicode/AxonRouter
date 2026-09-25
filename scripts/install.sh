#!/bin/sh
# AxonRouter — One-Command Installer (Docker Compose, no git clone)
#
#   curl -sSL https://raw.githubusercontent.com/rickicode/AxonRouter/main/scripts/install.sh | sh
#   # or unattended external Postgres:
#   EXTERNAL_DATABASE_URL='postgres://user:pass@host:5432/db?sslmode=require' \
#     curl -sSL .../install.sh | sh
set -e

# Default directory: use ~/AxonRouter format for display, resolve for cd
TARGET_DIR="${1:-$HOME/AxonRouter}"
DISPLAY_DIR="$(printf '%s' "$TARGET_DIR" | sed "s|^$HOME|~|")"
RAW="https://raw.githubusercontent.com/rickicode/AxonRouter/main"

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

# Helper to read from /dev/tty reliably even inside a pipe
read_input() {
  _val=""
  if [ -c /dev/tty ]; then
    IFS= read -r _val </dev/tty 2>/dev/null || _val=""
  else
    IFS= read -r _val 2>/dev/null || _val=""
  fi
  printf '%s' "$_val"
}

# ---------- 1. Docker ----------
if ! command -v docker >/dev/null 2>&1; then
  printf '%s==>%s Docker not found. Install now? (yes/no) [yes]: ' "$CYN$B" "$R"
  a="$(read_input)"
  case "${a:-yes}" in
    y|Y|yes|YES) info "Installing Docker Engine via get.docker.com ..."; curl -sSL https://get.docker.com | sh ;;
    *) die "Docker is required." ;;
  esac
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin is required."

# ---------- 2. Download compose files ----------
mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"
info "Downloading compose files ..."
curl -fsSL "$RAW/docker-compose.yml" -o docker-compose.yml
curl -fsSL "$RAW/docker-compose.postgres.yml" -o docker-compose.postgres.yml
if [ ! -f .env ]; then
  curl -fsSL "$RAW/.env.example" -o .env.example && cp .env.example .env || : > .env
fi

set_env() {
  if grep -q "^$1=" .env 2>/dev/null; then
    awk -v k="$1" -v v="$2" '$0 ~ "^"k"=" {print k"="v; next} {print}' .env > .env.tmp && mv .env.tmp .env
  else
    echo "$1=$2" >> .env
  fi
}

# ---------- 3. Database backend selection ----------
DB_MODE=""
if [ -n "$EXTERNAL_DATABASE_URL" ]; then
  DB_MODE="2"
  DBURL="$EXTERNAL_DATABASE_URL"
else
  printf '%s==>%s Mau pakai PostgreSQL yang mana?\n' "$CYN$B" "$R"
  printf '    %s[1]%s PostgreSQL bawaan (Docker container otomatis) %s[default]%s\n' "$GRN$B" "$R" "$CYN" "$R"
  printf '    %s[2]%s PostgreSQL external (Neon / Supabase / RDS / server lain)\n' "$YLW$B" "$R"
  printf '    Pilih [1/2] (tekan Enter untuk 1): '
  db_choice="$(read_input)"
  case "${db_choice:-1}" in
    2|external|ext) DB_MODE="2" ;;
    *) DB_MODE="1" ;;
  esac
fi

if [ "$DB_MODE" = "2" ]; then
  if [ -z "$DBURL" ]; then
    printf '\n    Masukkan URL PostgreSQL external:\n'
    printf '    (contoh: postgres://user:password@host:5432/db?sslmode=require)\n'
    printf '    > '
    DBURL="$(read_input)"
  fi
  DBURL="$(printf '%s' "$DBURL" | tr -d ' \t')"

  case "$DBURL" in
    postgres://*|postgresql://*) ;;
    *) die "URL tidak valid, harus diawali dengan postgres:// atau postgresql://" ;;
  esac

  info "Memverifikasi koneksi $(printf '%s' "$DBURL" | sed -E 's#://([^/:]+):[^@]*@#://\1:****@#') ..."
  if docker run --rm -i -e PGCONNECT_TIMEOUT=15 postgres:17-alpine \
       psql "$DBURL" -tAc "SELECT 'PostgreSQL reachable, server_version=' || current_setting('server_version')"; then
    set_env COMPOSE_FILE "docker-compose.yml"
    set_env DATABASE_URL "$DBURL"
    ok "PostgreSQL external terverifikasi & diterima! (Container PostgreSQL lokal dimatikan)"
    warn "Pastikan user PostgreSQL memiliki hak CREATE (tabel akan dibuat otomatis)."
  else
    die "Koneksi ke PostgreSQL external gagal. Cek kembali URL, credential, dan firewall Anda."
  fi
else
  set_env COMPOSE_FILE "docker-compose.yml:docker-compose.postgres.yml"
  set_env POSTGRES_PASSWORD "$(rand_hex 16)"
  PG_PW="$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)"
  set_env DATABASE_URL "postgres://axonrouter:${PG_PW}@postgres:5432/axonrouter"
  ok "Menggunakan PostgreSQL bawaan (container postgres:17-alpine aktif)."
fi

# ---------- 4. Gateway workers (dibatasi maksimal core CPU) ----------
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
  ok "Gateway: standalone mode (1 proses, hemat RAM, 1 CPU core)"
else
  set_env GATEWAY_CLUSTER "true"
  set_env GATEWAY_WORKERS "$WORKERS"
  ok "Gateway: cluster mode ($WORKERS workers, dibatasi maksimal $CORES core CPU)"
fi

# ---------- 5. Secrets (auto-generated) ----------
info "Menyiapkan token keamanan & secrets otomatis ..."
set_env JWT_SECRET       "$(rand_hex 32)"
set_env API_KEY_SECRET   "$(rand_hex 32)"
set_env MACHINE_ID_SALT  "$(rand_hex 16)"
set_env ENCRYPTION_KEY   "$(rand_hex 32)"
ADMIN_PASS="$(rand_hex 8)"
set_env INITIAL_PASSWORD "$ADMIN_PASS"

# ---------- 6. Start ----------
info "Menjalankan container Docker (docker compose up -d) ..."
docker compose up -d

printf '\n%s====================================================%s\n' "$CYN$B" "$R"
printf '    Lokasi:      %s\n' "$DISPLAY_DIR"
printf '    Dashboard:   %shttp://localhost:3777%s\n' "$B" "$R"
printf '    Password:    %s%s%s  (login hanya butuh password, tanpa username)\n' "$GRN$B" "$ADMIN_PASS" "$R"
printf '    Gateway API: %shttp://localhost:3778/v1%s\n' "$B" "$R"
printf '    Kelola:      docker compose ps | logs -f | down\n'
printf '%s====================================================%s\n' "$CYN$B" "$R"
