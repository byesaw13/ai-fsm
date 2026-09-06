#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${FSM_DEPLOY_ROOT:-/opt/business/ai-fsm}"
REPO_ROOT="${FSM_REPO_ROOT:-${DEPLOY_ROOT}/repo}"
ENV_FILE="${FSM_ENV_FILE:-${DEPLOY_ROOT}/env/.env}"
COMPOSE_FILE="${FSM_COMPOSE_FILE:-${REPO_ROOT}/infra/compose.garonhome.yml}"
BACKUP_DIR="${FSM_BACKUP_DIR:-${DEPLOY_ROOT}/backups}"
DATA_ROOT="${FSM_DATA_ROOT:-${DEPLOY_ROOT}/data}"
PASSPHRASE_FILE="${FSM_BACKUP_PASSPHRASE_FILE:-${DEPLOY_ROOT}/env/backup.passphrase}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_FILE="${BACKUP_DIR}/ai_fsm_${TIMESTAMP}.dump"
UPLOADS_FILE="${BACKUP_DIR}/ai_fsm_uploads_${TIMESTAMP}.tar.gz"
ENV_FILE_BACKUP="${BACKUP_DIR}/ai_fsm_env_${TIMESTAMP}.gpg"

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

mkdir -p "${BACKUP_DIR}"

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --format=custom --compress=9 \
  > "${DB_FILE}"
echo "backup written: ${DB_FILE}"

# Uploaded files (receipts, job photos) — not covered by the DB dump
if [[ -d "${DATA_ROOT}/uploads" ]]; then
  tar -czf "${UPLOADS_FILE}" -C "${DATA_ROOT}" uploads
  echo "backup written: ${UPLOADS_FILE}"
else
  UPLOADS_FILE=""
  echo "WARNING: ${DATA_ROOT}/uploads not found; skipping uploads backup" >&2
fi

# Encrypted copy of .env — needed to decrypt APP_ENCRYPTION_KEY-protected data
# (e.g. Square tokens) after a restore. Keep the passphrase file itself out of
# git and out of this backup (chmod 600, store its value in a password manager).
if [[ -f "${PASSPHRASE_FILE}" ]]; then
  gpg --batch --yes --symmetric --cipher-algo AES256 \
    --passphrase-file "${PASSPHRASE_FILE}" \
    -o "${ENV_FILE_BACKUP}" "${ENV_FILE}"
  echo "backup written: ${ENV_FILE_BACKUP}"
else
  ENV_FILE_BACKUP=""
  echo "WARNING: ${PASSPHRASE_FILE} not found; skipping encrypted .env backup" >&2
fi

# Offsite copy to Google Drive (non-fatal — pruning must still run)
RCLONE_REMOTE="${FSM_RCLONE_REMOTE:-googledrive}"
RCLONE_DEST="${RCLONE_REMOTE}:ai-fsm-backups"
for f in "${DB_FILE}" "${UPLOADS_FILE}" "${ENV_FILE_BACKUP}"; do
  [[ -z "${f}" ]] && continue
  if rclone copy "${f}" "${RCLONE_DEST}/" --log-level INFO; then
    echo "offsite copy complete: ${RCLONE_DEST}/$(basename "${f}")"
  else
    echo "WARNING: offsite copy failed for $(basename "${f}") (rclone exit $?); local backup retained" >&2
  fi
done

# Prune local backups older than 7 days (runs regardless of offsite result)
find "${BACKUP_DIR}" \( -name "ai_fsm_*.dump" -o -name "ai_fsm_uploads_*.tar.gz" -o -name "ai_fsm_env_*.gpg" \) -mtime +7 -delete
echo "old local backups pruned"

# Prune offsite copies older than 30 days (best-effort; local retention is authoritative)
REMOTE_RETENTION_DAYS="${FSM_BACKUP_REMOTE_RETENTION_DAYS:-30}"
if rclone delete "${RCLONE_DEST}" --min-age "${REMOTE_RETENTION_DAYS}d" --log-level INFO; then
  echo "old offsite backups pruned (older than ${REMOTE_RETENTION_DAYS}d)"
else
  echo "WARNING: offsite prune failed (rclone exit $?)" >&2
fi
