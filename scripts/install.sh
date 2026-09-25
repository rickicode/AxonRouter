#!/bin/sh
# AxonRouter — One-command installer (Docker Compose)
# Detects Docker (offers install), clones the repo, generates secrets into .env,
# then optionally starts the stack. Requires: curl, git.
set -e

INSTALL_DIR="${1:-$HOME/AxonRouter}"
REPO_URL="${REPO_URL:-https://github.com/rickicode/AxonRouter.git}"

echo "==> AxonRouter installer (Docker Compose)"
echo "    Compose file location: $INSTALL_DIR/docker-compose.yml"
echo "    Note: AxonRouter runs on Docker only. Manual (non-Docker) mode is for local development only."

# ---------- helpers ----------
rand_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# ask_secret VAR "Label" "default_generated_value"
# Enter = accept generated default; typing a value overrides it.
ask_secret() {
  var="$1"; label="$2"; default="$3"
  printf "    %s [%s]: " "$label" "$default"
  IFS= read -r input 2>/dev/null </dev/tty || input=""
  value="${input:-$default}"
  if grep -q "^${var}=" .env; then
    awk -v k="$var" -v v="$value" 'BEGIN{d=0} $0 ~ "^"k"=" { if(!d){print k"="v; d=1; next} } {print}' .env > .env.tmp
    mv .env.tmp .env
  else
    printf '%s=%s\n' "$var" "$value" >> .env
  fi
}

# ---------- 1. Docker detection with confirmation prompt ----------
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Docker is not installed on this system."
  printf "    Install Docker now? (yes/no): "
  IFS= read -r answer 2>/dev/null </dev/tty || answer=""
  case "$answer" in
    yes|YES|Yes|y|Y)
      echo "==> Installing Docker Engine via https://get.docker.com ..."
      curl -sSL https://get.docker.com | sh
      if [ "$(id -u)" != "0" ] && ! docker info >/dev/null 2>&1; then
        echo "    NOTE: if you see 'permission denied' running docker, run:"
        echo "          sudo usermod -aG docker $(whoami)   # then log out and back in"
      fi
      ;;
    *)
      echo "==> Skipping Docker installation."
      echo "    AxonRouter requires Docker. Manual mode is documented in README 'Local Node.js Development'."
      exit 1
      ;;
  esac
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Docker Compose plugin is required. Install it: https://docs.docker.com/compose/install/"
  exit 1
fi

# ---------- 2. Clone the repo (skip if already inside one) ----------
if [ ! -d "$INSTALL_DIR/.git" ]; then
  echo "==> Cloning AxonRouter to $INSTALL_DIR ..."
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ---------- 3. Bootstrap .env ----------
if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example ..."
  cp .env.example .env
fi

# ---------- 4. Auto-generate secrets (press Enter to accept) ----------
echo "==> Configuring secrets in $INSTALL_DIR/.env"
echo "    Press Enter to accept the auto-generated value, or type your own."

JWT_SECRET_DEFAULT="$(rand_hex 32)"
API_KEY_SECRET_DEFAULT="$(rand_hex 32)"
MACHINE_ID_SALT_DEFAULT="$(rand_hex 16)"
ENCRYPTION_KEY_DEFAULT="$(rand_hex 32)"
POSTGRES_PASSWORD_DEFAULT="$(rand_hex 16)"
INITIAL_PASSWORD_DEFAULT="$(rand_hex 8)"

ask_secret JWT_SECRET      "Dashboard session secret (JWT_SECRET)"      "$JWT_SECRET_DEFAULT"
ask_secret API_KEY_SECRET  "Gateway token HMAC key (API_KEY_SECRET)"    "$API_KEY_SECRET_DEFAULT"
ask_secret MACHINE_ID_SALT "Machine ID salt (MACHINE_ID_SALT)"         "$MACHINE_ID_SALT_DEFAULT"
ask_secret ENCRYPTION_KEY  "Credential encryption key (ENCRYPTION_KEY)" "$ENCRYPTION_KEY_DEFAULT"
ask_secret POSTGRES_PASSWORD "PostgreSQL password (POSTGRES_PASSWORD)"  "$POSTGRES_PASSWORD_DEFAULT"
ask_secret INITIAL_PASSWORD  "Dashboard admin password (INITIAL_PASSWORD)" "$INITIAL_PASSWORD_DEFAULT"

# Keep DATABASE_URL in sync with the chosen PostgreSQL password.
PG_PW="$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)"
awk -v pw="$PG_PW" '{ sub(/^DATABASE_URL=postgres:\/\/axonrouter:[^@]*@/, "DATABASE_URL=postgres://axonrouter:" pw "@"); print }' .env > .env.tmp
mv .env.tmp .env

echo "==> Secrets written to $INSTALL_DIR/.env"

# ---------- 5. Start the stack ----------
printf "    Start the stack now? (yes/no): "
IFS= read -r start_now 2>/dev/null </dev/tty || start_now=""
case "$start_now" in
  yes|YES|Yes|y|Y)
    echo "==> docker compose up -d  (GHCR images)"
    docker compose up -d
    echo "==> Stack started."
    ;;
  *)
    echo "==> Skipped. Start later with:"
    echo "    cd $INSTALL_DIR && docker compose up -d"
    ;;
esac

echo "==> Done."
echo "    Compose file: $INSTALL_DIR/docker-compose.yml"
echo "    Manage stack: cd $INSTALL_DIR && docker compose ps | logs -f | down"
echo "    Dashboard:    http://localhost:3777/dashboard"
echo "    Gateway API:  http://localhost:3778/v1"
