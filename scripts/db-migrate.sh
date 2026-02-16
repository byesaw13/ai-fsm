#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

for file in db/migrations/*.sql; do
  if [[ "$file" == *"seed"* ]]; then
    continue
  fi
  echo "applying migration: $file"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
done

echo "migrations complete"
