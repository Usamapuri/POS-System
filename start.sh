#!/bin/bash
set -e

# Database initialization script for Railway DB-Init service
# Connects to the database via DATABASE_URL and runs schema + seed SQL files

echo "Starting database initialization..."

# Verify DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set."
  exit 1
fi

echo "Running schema: database/init/01_schema.sql"
psql "$DATABASE_URL" -f database/init/01_schema.sql

echo "Running seed data: database/init/02_seed_data.sql"
psql "$DATABASE_URL" -f database/init/02_seed_data.sql

echo "Database initialization complete."
exit 0
