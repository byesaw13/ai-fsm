#!/usr/bin/env bash
# =============================================================================
# deploy-garonhome.sh — single entrypoint for all garonhome.local deployments
# =============================================================================
#
# What this script does (in order):
#   1. Validate repo and env file exist
#   2. git pull origin main
#   3. Start postgres + redis, wait for postgres healthy
#   4. Run SQL migrations (idempotent, tracked in schema_migrations table)
#   5. Build and start web + worker
#   6. Wait for web healthcheck to pass
#   7. Print service status + health endpoint response
#
# Pre-flight checks (run once before first deploy):
#   docker network inspect business_proxy >/dev/null
#   docker network inspect ai-fsm-internal >/dev/null || true
#   docker compose --env-file /opt/business/ai-fsm/env/.env \
#     -f infra/compose.garonhome.yml config >/dev/null
#
# Full deploy:
#   bash scripts/deploy-garonhome.sh
#
# Verify after deploy:
#   curl -sf http://fsm.garonhome.local/api/health
#   curl -I  http://fsm.garonhome.local/login
#   Expected: /api/health → {"status":"ok",...}   /login → HTTP 200
#
# Nginx Proxy Manager settings for fsm.garonhome.local:
#   Forward Hostname:  ai-fsm-web   (network alias on business_proxy — not container name)
#   Forward Port:      3000
#   Scheme:            http
#   Websockets:        On
#   Block Exploits:    On
#   Cache Assets:      Off
#   SSL Certificate:   None (plain HTTP for LAN .local)
#   Force SSL:         Off
#   HSTS:              Off
#   Advanced (optional):
#     proxy_set_header Host $host;
#     proxy_set_header X-Forwarded-Proto $scheme;
#     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#
# Connect NPM to the proxy network if not already done:
#   docker network connect business_proxy nginx-proxy-manager
# =============================================================================
set -euo pipefail

DEPLOY_ROOT="${FSM_DEPLOY_ROOT:-/opt/business/ai-fsm}"
REPO_ROOT="${FSM_REPO_ROOT:-${DEPLOY_ROOT}/repo}"
ENV_FILE="${FSM_ENV_FILE:-${DEPLOY_ROOT}/env/.env}"
COMPOSE_FILE="${FSM_COMPOSE_FILE:-${REPO_ROOT}/infra/compose.garonhome.yml}"

if [[ ! -d "${REPO_ROOT}" ]]; then
  echo "repo directory not found: ${REPO_ROOT}"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "env file not found: ${ENV_FILE}"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

cd "${REPO_ROOT}"

git pull origin main

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d postgres redis

while ! docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; do
  sleep 2
done

# Helper: run psql inside the postgres container
pg_exec() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" "$@"
}

# Ensure migration tracking table exists
pg_exec -v ON_ERROR_STOP=1 -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT now()
  )
"

# Detect transition case: existing schema with no tracking history
# If schema_migrations is empty AND the core schema already exists,
# seed every migration filename as applied (they ran before tracking was added).
MIGRATE_MODE="$(pg_exec -tAc "
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

for file in "${REPO_ROOT}"/db/migrations/*.sql; do
  filename="$(basename "${file}")"
  if [[ "${filename}" == *"seed"* ]]; then
    continue
  fi

  if [[ "${MIGRATE_MODE}" == "seed" ]]; then
    echo "seeding tracking record (pre-existing migration): ${filename}"
    pg_exec -c "INSERT INTO schema_migrations (filename) VALUES ('${filename}') ON CONFLICT DO NOTHING"
    continue
  fi

  applied="$(pg_exec -tAc "SELECT COUNT(*) FROM schema_migrations WHERE filename = '${filename}'" \
    | tr -d '[:space:]')"

  if [[ "${applied}" == "1" ]]; then
    echo "skipping (already applied): ${filename}"
    continue
  fi

  echo "applying migration: ${filename}"
  pg_exec -v ON_ERROR_STOP=1 < "${file}"
  pg_exec -c "INSERT INTO schema_migrations (filename) VALUES ('${filename}')"
done

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" build web worker
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d web worker

WEB_CONTAINER_ID="$(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps -q web)"
if [[ -z "${WEB_CONTAINER_ID}" ]]; then
  echo "web container ID not found after deploy"
  exit 1
fi

until [[ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "${WEB_CONTAINER_ID}")" == "healthy" ]]; do
  sleep 2
done

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T web \
  wget -qO- http://localhost:3000/api/health
