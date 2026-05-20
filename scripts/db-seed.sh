#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

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

psql_cmd -v ON_ERROR_STOP=1 -f db/migrations/002_seed_dev.sql
psql_cmd -v ON_ERROR_STOP=1 -f db/seeds/price_book_enriched.sql

echo "seed complete"
