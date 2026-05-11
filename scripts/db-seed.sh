#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/002_seed_dev.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seeds/price_book_enriched.sql

echo "seed complete"
