#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATION="$ROOT/database/migrations/003_user_profile_image.sql"
[[ -f "$MIGRATION" ]] || { echo "Missing $MIGRATION" >&2; exit 1; }
CONTAINER_NAME="pos-postgres-dev"
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  CONTAINER_NAME="pos-postgres"
  if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Start Postgres first (e.g. make dev)." >&2
    exit 1
  fi
fi
DB_NAME="${DB_NAME:-pos_system}"
DB_USER="${DB_USER:-postgres}"
echo "Applying user profile_image_url migration → $CONTAINER_NAME / $DB_NAME"
docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$MIGRATION"
echo "Done."
