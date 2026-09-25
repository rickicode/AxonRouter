#!/bin/sh
# AxonRouter — Reset Dashboard Password CLI
# Usage:
#   ./scripts/reset-password.sh [new_password]
# If no password is provided, resets to default: 12345677
set -e

NEW_PASS="${1:-12345677}"

echo "==> AxonRouter Password Reset"

# Check if running inside project directory
if [ ! -f .env ] && [ -f "$HOME/AxonRouter/.env" ]; then
  cd "$HOME/AxonRouter"
fi

if [ ! -f .env ]; then
  echo "ERROR: File .env tidak ditemukan. Jalankan script ini dari folder AxonRouter." >&2
  exit 1
fi

# 1. Update INITIAL_PASSWORD in .env
if grep -q "^INITIAL_PASSWORD=" .env 2>/dev/null; then
  awk -v p="$NEW_PASS" '$0 ~ "^INITIAL_PASSWORD=" {print "INITIAL_PASSWORD="p; next} {print}' .env > .env.tmp && mv .env.tmp .env
else
  echo "INITIAL_PASSWORD=$NEW_PASS" >> .env
fi

# 2. Reset stored password in database (clearing password hash so INITIAL_PASSWORD takes effect immediately)
if command -v docker >/dev/null 2>&1; then
  echo "==> Mereset password hash di database..."
  # Execute reset via docker exec into web container
  if docker ps --format '{{.Names}}' | grep -q "axonrouter-web"; then
    docker exec -e NEW_PASS="$NEW_PASS" axonrouter-web node -e "
      (async () => {
        try {
          const { getAdapter } = await import('./src/lib/db/driver.js');
          const bcrypt = (await import('bcryptjs')).default;
          const adapter = await getAdapter();
          const hash = await bcrypt.hash(process.env.NEW_PASS, 10);
          await adapter.run('UPDATE settings SET password = \$1 WHERE id = 1', [hash]);
          console.log('[OK] Password berhasil diupdate di database.');
          process.exit(0);
        } catch(e) {
          console.error('[WARN] Gagal update via driver langsung:', e.message);
          process.exit(1);
        }
      })()
    " 2>/dev/null || true
  fi
fi

echo ""
echo "===================================================="
echo "    Password dashboard berhasil di-reset!"
echo "    Password baru : $NEW_PASS"
echo "    Dashboard URL : http://localhost:3777"
echo "===================================================="
