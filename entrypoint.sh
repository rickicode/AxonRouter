#!/bin/sh
set -e

# Fix permissions for data directories
chown -R node:node /app/data /app/data-home 2>/dev/null || true

# Hand over to application process
exec gosu node "$@"
