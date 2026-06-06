#!/usr/bin/env bash
# Full quality gate.
#
# Usage:
#   pnpm gate            # all phases: lint → typecheck → build → unit → integration → e2e
#   pnpm gate:fast       # fast phases only: lint → typecheck → build → unit
#
# Flags:
#   --fast               skip integration and e2e phases
#
# Skip individual phases without --fast:
#   SKIP_BUILD=1         skip next build (saves ~2 min when iterating on tests)
#   SKIP_INTEGRATION=1   skip integration tests (but still run e2e)
#   SKIP_E2E=1           skip playwright e2e tests
#
# Requirements (full gate only):
#   - Docker running (spins up ephemeral postgres + redis on high ports)
#   - A free local web port (defaults to 3000, falls forward when occupied)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

FAST=false
for arg in "$@"; do [[ "$arg" == "--fast" ]] && FAST=true; done

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "==> $*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

wait_tcp() {
  local host="$1" port="$2" label="$3" retries="${4:-30}"
  for i in $(seq 1 "$retries"); do
    nc -z "$host" "$port" 2>/dev/null && return 0
    sleep 1
  done
  fail "timed out waiting for $label ($host:$port)"
}


port_in_use() {
  local port="$1"
  # Prefer ss: it is available on lean hosts and reliably sees listeners owned
  # by containers or other users. lsof can miss those without elevated access.
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :${port}" | awk 'NR > 1 { found = 1 } END { exit found ? 0 : 1 }'
    return $?
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -i:"${port}" -sTCP:LISTEN -t &>/dev/null 2>&1
    return $?
  fi
  return 1
}

choose_port() {
  local preferred="${1:-3000}"
  local port
  for port in $(seq "${preferred}" $((preferred + 50))); do
    if ! port_in_use "${port}"; then
      echo "${port}"
      return 0
    fi
  done
  fail "no free web test port found in range ${preferred}-$((preferred + 50))"
}

wait_http() {
  local url="$1" label="$2" retries="${3:-60}"
  for i in $(seq 1 "$retries"); do
    if [[ -n "${SERVER_PID:-}" ]] && ! kill -0 "$SERVER_PID" 2>/dev/null; then
      fail "test server exited unexpectedly — see /tmp/ai-fsm-gate-server.log"
    fi
    curl -sf "$url" &>/dev/null && return 0
    sleep 2
  done
  fail "timed out waiting for $label ($url)"
}

# ── Phase 1: Static checks (always run) ──────────────────────────────────────
log "lint"
pnpm lint

log "typecheck"
pnpm typecheck

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  log "build"
  pnpm build
fi

log "unit tests"
pnpm test:unit

if [[ "$FAST" == "true" ]]; then
  echo ""
  echo "✓ gate:fast passed"
  exit 0
fi

# ── Phase 2 & 3: Integration + E2E ───────────────────────────────────────────
# Spin up ephemeral postgres and redis on non-standard ports to avoid
# conflicting with any running dev services.
TEST_PG_NAME="ai-fsm-gate-pg-$$"
TEST_REDIS_NAME="ai-fsm-gate-redis-$$"
TEST_PG_PORT="15432"
TEST_REDIS_PORT="16379"
TEST_DB="ai_fsm_test"
TEST_USER="ai_fsm_test"
TEST_PASS="ai_fsm_gate_pw"
TEST_DATABASE_URL="postgresql://${TEST_USER}:${TEST_PASS}@localhost:${TEST_PG_PORT}/${TEST_DB}"
TEST_REDIS_URL="redis://localhost:${TEST_REDIS_PORT}/0"
TEST_AUTH_SECRET="gate-test-auth-secret-min-32-chars!!"
TEST_WEB_PORT="${TEST_WEB_PORT:-$(choose_port 3000)}"
TEST_BASE_URL="http://localhost:${TEST_WEB_PORT}"
SERVER_PID=""

cleanup() {
  log "cleanup"
  [[ -n "${SERVER_PID:-}" ]] && kill "$SERVER_PID" 2>/dev/null || true
  docker rm -f "$TEST_PG_NAME" "$TEST_REDIS_NAME" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

log "using web test port ${TEST_WEB_PORT}"

log "starting ephemeral postgres (port ${TEST_PG_PORT})"
docker run -d --name "$TEST_PG_NAME" \
  -e POSTGRES_DB="$TEST_DB" \
  -e POSTGRES_USER="$TEST_USER" \
  -e POSTGRES_PASSWORD="$TEST_PASS" \
  -p "${TEST_PG_PORT}:5432" \
  postgres:16 >/dev/null

log "starting ephemeral redis (port ${TEST_REDIS_PORT})"
docker run -d --name "$TEST_REDIS_NAME" \
  -p "${TEST_REDIS_PORT}:6379" \
  redis:7 >/dev/null

log "waiting for postgres"
wait_tcp localhost "$TEST_PG_PORT" postgres 30
# Give postgres a moment to finish initialising after the port is open
sleep 2

log "migrations + seed"
DATABASE_URL="$TEST_DATABASE_URL" bash scripts/db-migrate.sh
DATABASE_URL="$TEST_DATABASE_URL" bash scripts/db-seed.sh

if [[ "${SKIP_INTEGRATION:-}" != "1" ]]; then
  log "starting test server"
  DATABASE_URL="$TEST_DATABASE_URL" \
  REDIS_URL="$TEST_REDIS_URL" \
  AUTH_SECRET="$TEST_AUTH_SECRET" \
  E2E_DISABLE_LOGIN_RATE_LIMIT=1 \
  E2E_SKIP_EMAIL_DELIVERY=1 \
  NODE_ENV=development \
    pnpm --filter @ai-fsm/web exec next dev --port "${TEST_WEB_PORT}" >/tmp/ai-fsm-gate-server.log 2>&1 &
  SERVER_PID=$!
  sleep 2
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    fail "test server exited unexpectedly — see /tmp/ai-fsm-gate-server.log"
  fi

  log "waiting for test server"
  wait_http "$TEST_BASE_URL/api/health" "test server" 60

  log "integration tests"
  TEST_DATABASE_URL="$TEST_DATABASE_URL" \
  TEST_BASE_URL="$TEST_BASE_URL" \
    pnpm test:integration
fi

if [[ "${SKIP_E2E:-}" != "1" ]]; then
  log "e2e tests"
  # Playwright reuses the already-running gate server. Pass the same port and
  # database settings in case Playwright needs to start its own server in CI.
  DATABASE_URL="$TEST_DATABASE_URL" \
  REDIS_URL="$TEST_REDIS_URL" \
  AUTH_SECRET="$TEST_AUTH_SECRET" \
  E2E_SKIP_EMAIL_DELIVERY=1 \
  PORT="$TEST_WEB_PORT" \
  TEST_BASE_URL="$TEST_BASE_URL" \
    pnpm test:e2e
fi

echo ""
echo "✓ full gate passed"
