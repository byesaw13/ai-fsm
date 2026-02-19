# PostgreSQL Backup & Restore Runbook

## Overview

This runbook covers backup, restore, and validation procedures for the ai-fsm PostgreSQL database.
Target deployment: Raspberry Pi 4 running Docker Compose (compose.pi.yml).

---

## Backup Strategy

| Backup type | Tool | Frequency | Retention |
|-------------|------|-----------|-----------|
| Logical (SQL dump) | `pg_dump` | Daily (cron) | 7 days local + 30 days offsite |
| WAL archiving | Not configured | — | N/A (MVP) |

> **MVP note**: WAL archiving is deferred for post-MVP. Logical backups are sufficient for a low-write field-service app with acceptable RPO of 24 hours.

---

## Daily Backup Procedure

### Manual backup

```bash
# Run from Pi4 host
docker exec ai-fsm-db pg_dump \
  --username=postgres \
  --format=custom \
  --compress=9 \
  --file=/var/lib/postgresql/data/backups/ai_fsm_$(date +%Y%m%d_%H%M%S).dump \
  ai_fsm
```

Or dump to host filesystem:

```bash
docker exec ai-fsm-db pg_dump \
  --username=postgres \
  --format=custom \
  --compress=9 \
  ai_fsm > /home/pi/backups/ai_fsm_$(date +%Y%m%d_%H%M%S).dump
```

### Automated backup (cron)

Add to Pi4 crontab (`crontab -e`):

```cron
# Daily backup at 02:00, keep 7 days
0 2 * * * /home/pi/scripts/backup_db.sh >> /home/pi/logs/backup.log 2>&1
```

`/home/pi/scripts/backup_db.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/home/pi/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="${BACKUP_DIR}/ai_fsm_${TIMESTAMP}.dump"

mkdir -p "$BACKUP_DIR"

docker exec ai-fsm-db pg_dump \
  --username=postgres \
  --format=custom \
  --compress=9 \
  ai_fsm > "$FILE"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup written: $FILE ($(du -h "$FILE" | cut -f1))"

# Remove backups older than 7 days
find "$BACKUP_DIR" -name "ai_fsm_*.dump" -mtime +7 -delete
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Old backups pruned"
```

---

## Offsite / Remote Backup

Push to a remote destination after local backup completes.
Example using `rclone` to S3-compatible storage:

```bash
rclone copy /home/pi/backups/ remote:ai-fsm-backups/ \
  --include "ai_fsm_*.dump" \
  --min-age 0s
```

Or `rsync` to a secondary host:

```bash
rsync -avz /home/pi/backups/ backup-host:/backups/ai-fsm/
```

---

## Restore Procedure

### 1. Stop the application (prevent writes during restore)

```bash
docker compose -f compose.pi.yml stop web worker
```

### 2. Drop and recreate the target database

```bash
docker exec -it ai-fsm-db psql --username=postgres <<'SQL'
SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
 WHERE datname = 'ai_fsm' AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS ai_fsm;
CREATE DATABASE ai_fsm OWNER postgres;
SQL
```

### 3. Restore from dump

```bash
# Adjust DUMP_FILE to the file you want to restore from
DUMP_FILE="/home/pi/backups/ai_fsm_20260219_020000.dump"

docker exec -i ai-fsm-db pg_restore \
  --username=postgres \
  --dbname=ai_fsm \
  --verbose \
  --no-owner \
  --no-acl \
  < "$DUMP_FILE"
```

### 4. Re-apply RLS session variable grants (if migrating across Postgres versions)

```bash
docker exec -it ai-fsm-db psql --username=postgres --dbname=ai_fsm \
  -f /docker-entrypoint-initdb.d/001_core_schema.sql
```

> Usually not needed if restoring to the same Postgres version. Run only if you see missing roles/permissions errors.

### 5. Restart the application

```bash
docker compose -f compose.pi.yml start web worker
```

### 6. Verify (see Validation Drill below)

---

## Validation Drill

Run this after every restore and at least monthly as a fire drill.

### Step 1 — Basic connectivity

```bash
docker exec -it ai-fsm-db psql \
  --username=postgres \
  --dbname=ai_fsm \
  -c "SELECT version();"
```

Expected: PostgreSQL version string printed, no error.

### Step 2 — Row counts look reasonable

```bash
docker exec -it ai-fsm-db psql \
  --username=postgres \
  --dbname=ai_fsm \
  -c "SELECT
        (SELECT count(*) FROM users)       AS users,
        (SELECT count(*) FROM jobs)        AS jobs,
        (SELECT count(*) FROM visits)      AS visits,
        (SELECT count(*) FROM estimates)   AS estimates,
        (SELECT count(*) FROM invoices)    AS invoices,
        (SELECT count(*) FROM payments)    AS payments,
        (SELECT count(*) FROM audit_log)   AS audit_log;"
```

Compare against last known good counts (record them after each planned backup).

### Step 3 — Health endpoint returns 200

```bash
curl -sf http://localhost:3000/api/health | jq .
```

Expected response:
```json
{ "status": "ok", "service": "web", "checks": { "db": "ok" }, "ts": "..." }
```

### Step 4 — Smoke test login

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<seed-password>"}' | jq .user.role
```

Expected: `"owner"` (or whatever the seed admin role is).

### Step 5 — Record drill results

Append to `docs/DECISION_LOG.md` under a new `DRILL-<date>` entry:

```
### DRILL-<YYYY-MM-DD>: Backup restore validation
- Date: <UTC datetime>
- Backup file: ai_fsm_<timestamp>.dump
- Restore duration: <N minutes>
- Row counts: users=X, jobs=Y, ...
- Health check: ok
- Login smoke test: ok
- Notes: <any issues found>
```

---

## Backup Integrity Check (without full restore)

Quick check that the dump file is not corrupted:

```bash
pg_restore --list "$DUMP_FILE" | head -20
```

No error output = file is structurally valid.

---

## Recovery Time Objective (RTO)

| Database size | Estimated restore time |
|---------------|------------------------|
| < 100 MB | 2–5 minutes |
| 100 MB – 1 GB | 5–20 minutes |
| > 1 GB | 20+ minutes |

For Pi4 with SD card I/O, expect restore at ~10 MB/s.

---

## Known Limitations (MVP)

1. **No point-in-time recovery (PITR)** — WAL archiving not configured. Maximum data loss = 24 hours (last backup).
2. **No replication / standby** — single-node PostgreSQL. If the Pi4 hardware fails, restore from offsite backup.
3. **Backup encryption** — dump files are not encrypted at rest. If the Pi4 is physically accessible to untrusted parties, add `gpg --encrypt` to the backup script.
