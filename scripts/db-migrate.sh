#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MIGRATIONS_DIR="${REPO_ROOT}/db/migrations"

psql_cmd() {
  if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" "$@"
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "psql is required (or install Docker so this script can use postgres:16 as a psql client)" >&2
    exit 1
  fi

  docker run --rm --network host -v "${REPO_ROOT}:${REPO_ROOT}" -w "${REPO_ROOT}" postgres:16 \
    psql "$DATABASE_URL" "$@"
}

# Ensure migration tracking table exists
psql_cmd -v ON_ERROR_STOP=1 -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT now()
  )
"

# Detect transition case: existing schema with no tracking history
MIGRATE_MODE="$(psql_cmd -tAc "
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
    psql_cmd -c "INSERT INTO schema_migrations (filename) VALUES ('$filename') ON CONFLICT DO NOTHING"
    continue
  fi

  applied="$(psql_cmd -tAc "SELECT COUNT(*) FROM schema_migrations WHERE filename = '$filename'" \
    | tr -d '[:space:]')"

  if [[ "$applied" == "1" ]]; then
    echo "skipping (already applied): $filename"
    continue
  fi

  echo "applying migration: $filename"
  psql_cmd -v ON_ERROR_STOP=1 -f "$file"
  psql_cmd -c "INSERT INTO schema_migrations (filename) VALUES ('$filename')"
done

echo "migrations complete"
