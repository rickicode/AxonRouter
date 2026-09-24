#!/bin/sh
# AxonRouter — One-command installer (Docker Compose)
# Requires: Docker + Docker Compose (prompted if missing), curl, git
set -e

REPO_URL="https://github.com/rickicode/AxonRouter.git"
INSTALL_DIR="${1:-$PWD/AxonRouter}"

echo "==> AxonRouter installer (Docker Compose)"
echo "    Target directory: $INSTALL_DIR"
echo "    Note: AxonRouter runs on Docker only. Manual (non-Docker) mode is supported only for local development."

# 1. Docker detection with confirmation prompt
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Docker is not installed on this system."
  printf "    Install Docker now? (yes/no): "
  read -r answer
  case "$answer" in
    yes|YES|Yes|y|Y)
      echo "==> Installing Docker Engine via https://get.docker.com ..."
      curl -sSL https://get.docker.com | sh
      ;;
    *)
      echo "==> Skipping Docker installation."
      echo "    AxonRouter requires Docker. To run manually (development only), see README 'Local Node.js Development'."
      exit 1
      ;;
  esac
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Docker Compose plugin is required. Install it: https://docs.docker.com/compose/install/"
  exit 1
fi

# 2. Clone the repo (skip if already inside one)
if [ ! -d "$INSTALL_DIR/.git" ]; then
  echo "==> Cloning AxonRouter..."
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# 3. Bootstrap .env from the example if missing
if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example..."
  cp .env.example .env
fi

echo "==> Done. Next steps:"
echo "    1. Edit secrets in $INSTALL_DIR/.env"
echo "    2. Start the stack:  docker compose up -d"
echo "    3. Open dashboard:   http://localhost:3777/dashboard"
echo "    4. Gateway API:      http://localhost:3778/v1"
