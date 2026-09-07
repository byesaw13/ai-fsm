#!/usr/bin/env bash
# =============================================================================
# dev-stack.sh — one-command local dev/test stack (TASK-123)
#
# Brings up the dev Postgres + Redis (infra/compose.dev.yml), applies migrations
# and seed, and optionally runs the Tier-3 integration tests — the sequence
# otherwise hand-assembled every time you need the real (non-mocked) DB.
#
#   bash scripts/dev-stack.sh up           # DB+redis up, migrated, seeded
#   bash scripts/dev-stack.sh integration  # up, then run integration tests
#   bash scripts/dev-stack.sh down         # stop containers (keeps volumes)
#   bash scripts/dev-stack.sh reset        # down + delete volumes (fresh DB)
#
# Direct-DB integration suites run with just the DB. HTTP-tier suites also need a
# running server — in another shell: `pnpm dev:web` (they read TEST_BASE_URL and
# skipIf it's absent).
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

# ALWAYS target the local compose DB over loopback — never an ambient
# DATABASE_URL. `db:seed` inserts demo users with a known password, so a stray
# prod/remote URL in the environment must not be able to migrate or seed it.
# (Constructed from 127.0.0.1, so it can only ever reach the local container.)
DEV_DB_PORT="${POSTGRES_PORT:-5432}"
export DATABASE_URL="postgresql://ai_fsm:ai_fsm_dev_password@127.0.0.1:${DEV_DB_PORT}/ai_fsm"
export REDIS_URL="redis://127.0.0.1:6379/0"
COMPOSE=(docker compose -f infra/compose.dev.yml)

wait_for_pg() {
  for _ in $(seq 1 30); do
    if docker exec ai-fsm-postgres-dev pg_isready -U ai_fsm -d ai_fsm >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "postgres did not become ready in time" >&2
  exit 1
}

up() {
  "${COMPOSE[@]}" up -d postgres redis
  wait_for_pg
  pnpm db:migrate
  pnpm db:seed
  echo "✓ dev stack up + migrated + seeded  (DATABASE_URL=$DATABASE_URL)"
}

case "${1:-up}" in
  up)
    up
    ;;
  integration)
    up
    echo "→ running integration tests (direct-DB; HTTP suites skip without TEST_BASE_URL)"
    TEST_DATABASE_URL="$DATABASE_URL" pnpm --filter @ai-fsm/web test:integration
    ;;
  down)
    "${COMPOSE[@]}" down
    echo "✓ dev stack down (volumes kept)"
    ;;
  reset)
    "${COMPOSE[@]}" down -v
    echo "✓ dev stack down + volumes removed"
    ;;
  *)
    echo "usage: $0 [up|integration|down|reset]" >&2
    exit 1
    ;;
esac
