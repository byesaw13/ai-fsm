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
#   --prod      production: you MUST supply the owner's initial password (the
#               app has no self-service password-reset flow, so a login-disabled
#               owner would be permanently inaccessible). Provide ONE of:
#                 OWNER_PASSWORD='<plaintext>'      # hashed here via bcryptjs
#                 OWNER_PASSWORD_HASH='<bcrypt>'    # pre-hashed (cost 10)
#               If neither is set, the owner is created LOGIN-DISABLED and the
#               script prints the exact recovery command to set a password later.
#
# For production, point DATABASE_URL at garonhome.local and pass --prod, e.g.:
#   OWNER_PASSWORD='choose-a-strong-one' DATABASE_URL=... scripts/db-seed-dovetails.sh --prod
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

# Hash a plaintext password with the same bcryptjs (cost 10) the app uses.
hash_password() {
  node -e 'process.stdout.write(require("bcryptjs").hashSync(process.argv[1], 10))' "$1"
}

# Resolve the owner password hash to seed (empty string => leave login-disabled).
OWNER_PW=""
if [[ "$MODE" == "dev" ]]; then
  OWNER_PW="$DEV_OWNER_PW"
else
  if [[ -n "${OWNER_PASSWORD_HASH:-}" ]]; then
    OWNER_PW="$OWNER_PASSWORD_HASH"
  elif [[ -n "${OWNER_PASSWORD:-}" ]]; then
    OWNER_PW="$(cd "${REPO_ROOT}/apps/web" && hash_password "$OWNER_PASSWORD")"
  fi
fi

psql_args=(-v ON_ERROR_STOP=1 -f db/seeds/dovetails_historical_backfill.sql)
if [[ -n "$OWNER_PW" ]]; then
  psql_args=(-v "owner_pw=${OWNER_PW}" "${psql_args[@]}")
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
  if [[ -n "$OWNER_PW" ]]; then
    echo "Owner user nick@mydovetails.com will be seeded WITH the supplied password."
  else
    echo "WARNING: no OWNER_PASSWORD / OWNER_PASSWORD_HASH supplied."
    echo "         nick@mydovetails.com will be LOGIN-DISABLED (inaccessible until recovered)."
  fi
fi

psql_cmd "${psql_args[@]}"

echo "dovetails backfill complete (${MODE} mode)"

if [[ "$MODE" == "prod" && -z "$OWNER_PW" ]]; then
  cat <<'EOF'

RECOVERY: the owner has no usable password. Set one with:
  HASH=$(cd apps/web && node -e 'process.stdout.write(require("bcryptjs").hashSync(process.argv[1],10))' 'your-strong-password')
  psql "$DATABASE_URL" -c "update users set password_hash='$HASH' where email='nick@mydovetails.com';"
Then log in and rotate it from the account settings if desired.
EOF
fi
