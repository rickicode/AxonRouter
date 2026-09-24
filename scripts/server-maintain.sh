#!/bin/bash
# axonrouter disk auto-maintenance — hourly cron on prod (192.168.90.101).
# Installed at /usr/local/bin/axonrouter-maintain.sh, cron: 15 * * * *.
# Prunes: docker build cache (>24h), dangling images, old /app/logs
# session dirs (age >24h + 1500-dir cap, oldest first).
# Never touches: running containers, named volumes, prod images in use.
#
# History: Sep 2026 — disk hit 100% (35G). Build cache 14.4GB + /app/logs
# 7.7GB (6351 dirs, ~2GB/hour) in container writable layer. Request logging
# is enabled (ENABLE_REQUEST_LOGS=true) and the app has no retention.
set -u
LOG=/root/axonrouter-web-maintain.log
exec >>"$LOG" 2>&1
echo "=== $(date -u +%FT%TZ) maintain start ==="
echo "disk before: $(df -h / | awk 'NR==2{print $3" used, "$4" free"}')"

# 1. Build cache older than 24h
docker builder prune -af --filter "until=24h" 2>&1 | tail -1
# 2. Dangling images (safe: not used by any container/tag)
docker image prune -f 2>&1 | tail -1
# 3. Per-request log dirs: age-based (>24h) + 1500-dir cap (~2GB), oldest first.
#    Logs go to container writable layer, NOT a volume; app writes ~2GB/hour.
CONTAINER=$(docker ps --format '{{.Names}}' | grep -E "^(axonrouter-web|axonrouter-web|axonrouter-web)$" | head -1)
[ -n "$CONTAINER" ] && docker exec "$CONTAINER" sh -c '
  [ -d /app/logs ] || exit 0
  OLD=$(find /app/logs -mindepth 1 -maxdepth 1 -type d -mtime +1 2>/dev/null | wc -l)
  [ "$OLD" -gt 0 ] && find /app/logs -mindepth 1 -maxdepth 1 -type d -mtime +1 -exec rm -rf {} + 2>/dev/null && echo "purged ${OLD} old dirs (>24h)"
  N=$(ls /app/logs 2>/dev/null | wc -l)
  if [ "$N" -gt 1500 ]; then
    DROP=$((N - 1500))
    echo "capping: $N dirs -> dropping $DROP oldest"
    ls -tr /app/logs 2>/dev/null | head -n "$DROP" | while IFS= read -r d; do rm -rf "/app/logs/$d"; done
  fi
  echo "logs now: $(ls /app/logs 2>/dev/null | wc -l) dirs"
' 2>/dev/null
# 4. Root-owned junk from repo checkouts
rm -rf /root/axonrouter-web/benchmarks /root/axonrouter-web/db.sqlite3 2>/dev/null

echo "disk after:  $(df -h / | awk 'NR==2{print $3" used, "$4" free"}')"
echo "=== $(date -u +%FT%TZ) maintain end ==="
