#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${FSM_DEPLOY_ROOT:-/opt/business/ai-fsm}"
REPO_ROOT="${FSM_REPO_ROOT:-${DEPLOY_ROOT}/repo}"
ENV_FILE="${FSM_ENV_FILE:-${DEPLOY_ROOT}/env/.env}"
COMPOSE_FILE="${FSM_COMPOSE_FILE:-${REPO_ROOT}/infra/compose.garonhome.yml}"
BACKUP_DIR="${FSM_BACKUP_DIR:-${DEPLOY_ROOT}/backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${BACKUP_DIR}/ai_fsm_${TIMESTAMP}.dump"

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

mkdir -p "${BACKUP_DIR}"

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --format=custom --compress=9 \
  > "${FILE}"

echo "backup written: ${FILE}"

# Offsite copy to Google Drive (non-fatal — pruning must still run)
RCLONE_REMOTE="${FSM_RCLONE_REMOTE:-googledrive}"
RCLONE_DEST="${RCLONE_REMOTE}:ai-fsm-backups"
if rclone copy "${FILE}" "${RCLONE_DEST}/" --log-level INFO; then
  echo "offsite copy complete: ${RCLONE_DEST}/$(basename "${FILE}")"
else
  echo "WARNING: offsite copy failed (rclone exit $?); local backup retained" >&2
fi

# Prune local backups older than 7 days (runs regardless of offsite result)
find "${BACKUP_DIR}" -name "ai_fsm_*.dump" -mtime +7 -delete
echo "old local backups pruned"
