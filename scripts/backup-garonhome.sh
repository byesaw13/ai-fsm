#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${FSM_DEPLOY_ROOT:-/opt/business/ai-fsm}"
REPO_ROOT="${FSM_REPO_ROOT:-${DEPLOY_ROOT}/repo}"
ENV_FILE="${FSM_ENV_FILE:-${DEPLOY_ROOT}/env/.env}"
COMPOSE_FILE="${FSM_COMPOSE_FILE:-${REPO_ROOT}/infra/compose.garonhome.yml}"
BACKUP_DIR="${FSM_BACKUP_DIR:-${DEPLOY_ROOT}/backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_FILE="${BACKUP_DIR}/ai_fsm_${TIMESTAMP}.dump"
UPLOADS_FILE="${BACKUP_DIR}/ai_fsm_uploads_${TIMESTAMP}.tar.gz"
ENV_FILE_BACKUP="${BACKUP_DIR}/ai_fsm_env_${TIMESTAMP}.gpg"

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

# Resolve AFTER sourcing .env so FSM_DATA_ROOT / FSM_BACKUP_PASSPHRASE_FILE set
# only in the env file are honored (they would otherwise fall back to defaults
# and silently skip the uploads / encrypted-.env backups).
DATA_ROOT="${FSM_DATA_ROOT:-${DEPLOY_ROOT}/data}"
PASSPHRASE_FILE="${FSM_BACKUP_PASSPHRASE_FILE:-${DEPLOY_ROOT}/env/backup.passphrase}"

# ponytail: DB dump and the uploads tar are taken sequentially while web/worker
# stay live, so an upload deleted between the two can leave a dump row whose file
# is missing from the archive. Acceptable for a solo nightly backup run at a
# low-activity hour; upgrade to a coordinated filesystem snapshot only if
# concurrent write volume during the backup window ever makes this real.

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

# Offsite copy to Google Drive (non-fatal — pruning must still run).
# Dumps and .env gpg stay dated: they are tiny, and 30 days of them fit.
# Uploads are one replaced object. A new ~1GB tarball every night filled
# the Drive quota and then blocked the dump upload too.
RCLONE_REMOTE="${FSM_RCLONE_REMOTE:-googledrive}"
RCLONE_DEST="${RCLONE_REMOTE}:ai-fsm-backups"
UPLOADS_LATEST_NAME="ai_fsm_uploads_latest.tar.gz"

# Drop dated uploads archives before copying, or the new copy has no room.
# Drive trash still counts against quota, so the delete has to be permanent.
if rclone delete "${RCLONE_DEST}" --drive-use-trash=false --include "ai_fsm_uploads_2*.tar.gz" --log-level INFO; then
  echo "dated offsite uploads archives removed"
else
  echo "WARNING: failed to remove dated offsite uploads archives (rclone exit $?)" >&2
fi

copy_offsite() {
  local src="$1" dest_name="$2"
  if rclone copyto "${src}" "${RCLONE_DEST}/${dest_name}" --log-level INFO; then
    echo "offsite copy complete: ${RCLONE_DEST}/${dest_name}"
  else
    echo "WARNING: offsite copy failed for ${dest_name} (rclone exit $?); local backup retained" >&2
  fi
}

if [[ -n "${DB_FILE}" && -f "${DB_FILE}" ]]; then
  copy_offsite "${DB_FILE}" "$(basename "${DB_FILE}")"
fi
if [[ -n "${UPLOADS_FILE}" && -f "${UPLOADS_FILE}" ]]; then
  copy_offsite "${UPLOADS_FILE}" "${UPLOADS_LATEST_NAME}"
fi
if [[ -n "${ENV_FILE_BACKUP}" && -f "${ENV_FILE_BACKUP}" ]]; then
  copy_offsite "${ENV_FILE_BACKUP}" "$(basename "${ENV_FILE_BACKUP}")"
fi

# Prune local backups older than 7 days (runs regardless of offsite result)
find "${BACKUP_DIR}" \( -name "ai_fsm_*.dump" -o -name "ai_fsm_uploads_*.tar.gz" -o -name "ai_fsm_env_*.gpg" \) -mtime +7 -delete
echo "old local backups pruned"

# Prune offsite copies older than 30 days (best-effort; local retention is authoritative)
REMOTE_RETENTION_DAYS="${FSM_BACKUP_REMOTE_RETENTION_DAYS:-30}"
if rclone delete "${RCLONE_DEST}" --drive-use-trash=false --min-age "${REMOTE_RETENTION_DAYS}d" --log-level INFO; then
  echo "old offsite backups pruned (older than ${REMOTE_RETENTION_DAYS}d)"
else
  echo "WARNING: offsite prune failed (rclone exit $?)" >&2
fi
