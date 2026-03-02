#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${SCRIPT_DIR}/../db/migrations"

# Ensure migration tracking table exists
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT now()
  )
"

# Detect transition case: existing schema with no tracking history
MIGRATE_MODE="$(psql "$DATABASE_URL" -tAc "
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM schema_migrations) = 0
         AND EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'clients'
         )
    THEN 'seed'
    ELSE 'migrate'
  END
" 2>/dev/null | tr -d '[:space:]' || echo 'migrate')"

echo "migration mode: ${MIGRATE_MODE}"

for file in "${MIGRATIONS_DIR}"/*.sql; do
  filename="$(basename "$file")"
  if [[ "$file" == *"seed"* ]]; then
    continue
  fi

  if [[ "${MIGRATE_MODE}" == "seed" ]]; then
    echo "seeding tracking record (pre-existing migration): $filename"
    psql "$DATABASE_URL" -c "INSERT INTO schema_migrations (filename) VALUES ('$filename') ON CONFLICT DO NOTHING"
    continue
  fi

  applied="$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM schema_migrations WHERE filename = '$filename'" \
    | tr -d '[:space:]')"

  if [[ "$applied" == "1" ]]; then
    echo "skipping (already applied): $filename"
    continue
  fi

  echo "applying migration: $filename"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
  psql "$DATABASE_URL" -c "INSERT INTO schema_migrations (filename) VALUES ('$filename')"
done

echo "migrations complete"
