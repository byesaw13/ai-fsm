#!/usr/bin/env bash
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

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d postgres redis

while ! docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; do
  sleep 2
done

for file in db/migrations/*.sql; do
  if [[ "${file}" == *"seed"* ]]; then
    continue
  fi
  echo "applying migration: ${file}"
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${file}"
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
