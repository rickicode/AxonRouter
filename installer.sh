#!/bin/bash
# AxonRouter Installer
# Automates the installation of AxonRouter with proper path detection.
# Usage: bash installer.sh
#
# This script detects nvm/node/npm paths automatically since sudo
# does not inherit nvm PATH. It uses absolute paths throughout.

set -e
# Note: set -u is intentionally not used here. Several variables ($NVM_DIR,
# $SUDO_USER, etc.) may be unset in minimal environments, and adding ${VAR:-}
# guards throughout would reduce readability without meaningful safety gain.

# ===================================
# Banner
# ===================================
echo ""
echo "==================================="
echo " AxonRouter Installer"
echo "==================================="
echo ""

# ===================================
# Detect Node.js and npm paths
# ===================================
NODE_PATH=""
NPM_PATH=""

# Try to find node in current PATH
if command -v node &>/dev/null; then
  NODE_PATH="$(which node)"
fi

# If node not found, try to source nvm
if [ -z "$NODE_PATH" ]; then
  echo "Node.js not found in PATH. Trying to source nvm..."

  NVM_SCRIPT=""
  if [ -n "$NVM_DIR" ] && [ -f "$NVM_DIR/nvm.sh" ]; then
    NVM_SCRIPT="$NVM_DIR/nvm.sh"
  elif [ -f "$HOME/.nvm/nvm.sh" ]; then
    NVM_SCRIPT="$HOME/.nvm/nvm.sh"
  elif [ -f "/usr/local/nvm/nvm.sh" ]; then
    NVM_SCRIPT="/usr/local/nvm/nvm.sh"
  fi

  if [ -n "$NVM_SCRIPT" ]; then
    echo "  Sourcing nvm from: $NVM_SCRIPT"
    # shellcheck source=/dev/null
    source "$NVM_SCRIPT"
    if command -v node &>/dev/null; then
      NODE_PATH="$(which node)"
    fi
  fi
fi

# Final check for node
if [ -z "$NODE_PATH" ]; then
  echo ""
  echo "ERROR: Node.js not found!"
  echo ""
  echo "Please install Node.js >= 22.6.0 before running this installer."
  echo "Recommended: Install via nvm (https://github.com/nvm-sh/nvm)"
  echo ""
  echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  echo "  source ~/.bashrc"
  echo "  nvm install 22"
  echo ""
  exit 1
fi

# Resolve npm path
if command -v npm &>/dev/null; then
  NPM_PATH="$(which npm)"
fi

if [ -z "$NPM_PATH" ]; then
  echo ""
  echo "ERROR: npm not found!"
  echo ""
  echo "npm should be installed alongside Node.js."
  echo "If using nvm, run: nvm install 22"
  echo ""
  exit 1
fi

# ===================================
# Print detected paths
# ===================================
echo "Detected paths:"
echo "  Node: $NODE_PATH"
echo "  npm:  $NPM_PATH"
echo ""

# ===================================
# Check Node.js version
# ===================================
NODE_VERSION=$("$NODE_PATH" -v | sed 's/^v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
NODE_MINOR=$(echo "$NODE_VERSION" | cut -d. -f2)

if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 6 ]; }; then
  echo "WARNING: Node.js version $NODE_VERSION detected."
  echo "AxonRouter requires Node.js >= 22.6.0"
  echo "Please upgrade your Node.js installation."
  echo ""
  echo "Continuing anyway, but AxonRouter may not work correctly."
  echo ""
fi

# ===================================
# Confirm installation
# ===================================
echo "This will install axonrouter globally via npm."
read -rp "Continue? [Y/n] " CONFIRM_INSTALL
if [[ "$CONFIRM_INSTALL" =~ ^[Nn]$ ]]; then
  echo "Aborted."
  exit 0
fi
echo ""

# ===================================
# Determine if sudo is needed for global install
# ===================================
NPM_PREFIX="$("$NPM_PATH" prefix -g)"
NEED_SUDO=false

# If npm global prefix is outside user home (e.g., /usr/local), sudo is needed
if [[ "$NPM_PREFIX" != "$HOME"* ]] && [[ -z "$NVM_DIR" || "$NPM_PREFIX" != "$NVM_DIR"* ]]; then
  # Check if the prefix directory is writable without sudo
  if [ ! -w "$NPM_PREFIX/lib" ] 2>/dev/null; then
    NEED_SUDO=true
  fi
fi

# ===================================
# Install axonrouter globally
# ===================================
echo "Installing axonrouter globally..."
echo ""

if [ "$NEED_SUDO" = true ]; then
  echo "  (System npm detected - using sudo for global install)"
  sudo "$NPM_PATH" install -g axonrouter
else
  "$NPM_PATH" install -g axonrouter
fi

echo ""
echo "axonrouter installed successfully!"
echo ""

# ===================================
# Resolve installed axonrouter path
# ===================================
AXONROUTER_PATH="$("$NPM_PATH" prefix -g)/bin/axonrouter"

if [ ! -f "$AXONROUTER_PATH" ]; then
  echo "WARNING: Could not find axonrouter at expected path: $AXONROUTER_PATH"
  echo "Trying to locate via which..."
  if command -v axonrouter &>/dev/null; then
    AXONROUTER_PATH="$(which axonrouter)"
  else
    echo "ERROR: axonrouter binary not found after installation."
    echo "Try running 'axonrouter' manually to verify the installation."
    exit 1
  fi
fi

echo "AxonRouter installed at: $AXONROUTER_PATH"
echo ""

# ===================================
# Ask about service installation
# ===================================
read -rp "Install AxonRouter as a service? [Y/n] " INSTALL_SERVICE
if [[ "$INSTALL_SERVICE" =~ ^[Nn]$ ]]; then
  echo ""
  echo "Skipping service installation."
  echo "You can install it later with: axonrouter install-service"
  echo ""
else
  echo ""
  echo "Installing service..."
  # install-service will automatically detect root vs non-root
  # and install system-level or user-level service accordingly
  "$NODE_PATH" "$AXONROUTER_PATH" install-service
  echo ""
fi

# ===================================
# Success message
# ===================================
echo "==================================="
echo " Installation Complete!"
echo "==================================="
echo ""
echo "AxonRouter is installed and running."
echo ""
echo "Dashboard: http://localhost:12711/dashboard"
echo "API:       http://localhost:12711/v1"
echo ""
echo "If this is a fresh install, the default password is 12345677"
echo "(Change it immediately in Settings -> Security)"
echo ""
echo "Commands:"
echo "  axonrouter                  Start in foreground"
echo "  axonrouter check-service    Check service status"
echo "  axonrouter stop             Stop service"
echo "  axonrouter restart          Restart service"
echo ""
