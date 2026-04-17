#!/usr/bin/env bash
# Apply database/migrations/001_store_suppliers_po_batches.sql to an existing Postgres.
# Fixes: pq: relation "suppliers" does not exist (volume created before those tables existed).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATION="$ROOT/database/migrations/001_store_suppliers_po_batches.sql"

if [[ ! -f "$MIGRATION" ]]; then
  echo "Migration file not found: $MIGRATION" >&2
  exit 1
fi

CONTAINER_NAME="pos-postgres-dev"
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  CONTAINER_NAME="pos-postgres"
  if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "No running container named pos-postgres-dev or pos-postgres." >&2
    echo "Start the stack first (e.g. make dev or docker compose -f docker-compose.dev.yml up -d postgres)." >&2
    exit 1
  fi
fi

DB_NAME="${DB_NAME:-pos_system}"
DB_USER="${DB_USER:-postgres}"

echo "Applying store purchasing migration via container: $CONTAINER_NAME database: $DB_NAME"
docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$MIGRATION"
echo "Done. You can create suppliers again in Store Inventory → Purchasing."
