#!/usr/bin/env bash
# Load the Dovetails historical backfill (real clients/jobs/estimates/invoices)
# into the database at $DATABASE_URL. Idempotent — safe to re-run.
#
# This does NOT touch the dev test fixtures (002_seed_dev.sql). Run it after
# migrations are applied.
#
# Modes:
#   (default)   dev: seeds the owner user nick@mydovetails.com with a known dev
#               password ('password') so you can log in locally.
#   --prod      production: the owner user is created LOGIN-DISABLED. Set the
#               password afterward via the app's password-reset flow. No
#               guessable credential is ever written to a prod database.
#
# For production, point DATABASE_URL at garonhome.local and pass --prod.
set -euo pipefail

MODE="dev"
if [[ "${1:-}" == "--prod" ]]; then
  MODE="prod"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# bcrypt hash for the literal password 'password' — DEV ONLY.
DEV_OWNER_PW='$2b$10$1ficvwl3W6YEDiRk.ZPaPOX2YbkrutJKoDbhPpu9.nM6B1C1qU3Fm'

psql_args=(-v ON_ERROR_STOP=1 -f db/seeds/dovetails_historical_backfill.sql)
if [[ "$MODE" == "dev" ]]; then
  psql_args=(-v "owner_pw=${DEV_OWNER_PW}" "${psql_args[@]}")
fi

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

if [[ "$MODE" == "prod" ]]; then
  echo "Loading Dovetails backfill in PRODUCTION mode against: ${DATABASE_URL%%\?*}"
  echo "Owner user nick@mydovetails.com will be created LOGIN-DISABLED."
fi

psql_cmd "${psql_args[@]}"

echo "dovetails backfill complete (${MODE} mode)"
if [[ "$MODE" == "prod" ]]; then
  echo "NEXT: set nick@mydovetails.com's password via the app's reset flow before first login."
fi
