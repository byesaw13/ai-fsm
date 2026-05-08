# PostgreSQL Backup & Restore Runbook

## Overview

This runbook covers backup, restore, and validation procedures for the ai-fsm PostgreSQL database.
Target deployment: garonhome.local running Docker Compose (`infra/compose.garonhome.yml`).
Deploy root: `/opt/business/ai-fsm/`

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
# Run from garonhome.local deploy root
cd /opt/business/ai-fsm/repo
bash scripts/backup-garonhome.sh
```

The script writes a compressed Postgres custom-format dump to `/opt/business/ai-fsm/backups/` and prunes files older than 7 days.

### Automated backup (cron)

Add to crontab (`crontab -e`):

```cron
# Daily backup at 02:00
0 2 * * * cd /opt/business/ai-fsm/repo && bash scripts/backup-garonhome.sh >> /opt/business/ai-fsm/logs/backup.log 2>&1
```

The backup script (`scripts/backup-garonhome.sh`) performs:
1. `pg_dump` from the running postgres container to `/opt/business/ai-fsm/backups/ai_fsm_YYYYMMDDTHHMMSSZ.dump`
2. Prints a timestamped confirmation line with file size
3. Prunes `.dump` files older than 7 days

---

## Offsite / Remote Backup

Push to a remote destination after local backup completes.
Example using `rclone` to S3-compatible storage:

```bash
rclone copy /opt/business/ai-fsm/backups/ remote:ai-fsm-backups/ \
  --include "ai_fsm_*.dump" \
  --min-age 0s
```

Or `rsync` to a secondary host:

```bash
rsync -avz /opt/business/ai-fsm/backups/ backup-host:/backups/ai-fsm/
```

---

## Restore Procedure

Use the restore script for the full restore sequence:

```bash
cd /opt/business/ai-fsm/repo
bash scripts/restore-garonhome.sh /opt/business/ai-fsm/backups/ai_fsm_YYYYMMDDTHHMMSSZ.dump
```

The restore script handles the full sequence automatically:
1. Stops `web` and `worker` containers (prevents writes during restore)
2. Terminates active DB sessions
3. Drops and recreates the `ai_fsm` database
4. Restores from the specified dump file via `pg_restore`
5. Restarts `web` and `worker`
6. Verifies the health endpoint

### Manual restore steps (if script is unavailable)

#### 1. Stop the application

```bash
docker compose --env-file /opt/business/ai-fsm/env/.env \
  -f /opt/business/ai-fsm/repo/infra/compose.garonhome.yml \
  stop web worker
```

#### 2. Drop and recreate the target database

```bash
docker exec -it ai-fsm-postgres psql --username=postgres <<'SQL'
SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
 WHERE datname = 'ai_fsm' AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS ai_fsm;
CREATE DATABASE ai_fsm OWNER postgres;
SQL
```

#### 3. Restore from dump

```bash
DUMP_FILE="/opt/business/ai-fsm/backups/ai_fsm_YYYYMMDDTHHMMSSZ.dump"

docker exec -i ai-fsm-postgres pg_restore \
  --username=postgres \
  --dbname=ai_fsm \
  --verbose \
  --no-owner \
  --no-acl \
  < "$DUMP_FILE"
```

#### 4. Restart the application

```bash
docker compose --env-file /opt/business/ai-fsm/env/.env \
  -f /opt/business/ai-fsm/repo/infra/compose.garonhome.yml \
  start web worker
```

#### 5. Verify (see Validation Drill below)

---

## Validation Drill

Run this after every restore and at least monthly as a fire drill.

### Step 1 — Basic connectivity

```bash
docker exec -it ai-fsm-postgres psql \
  --username=postgres \
  --dbname=ai_fsm \
  -c "SELECT version();"
```

Expected: PostgreSQL version string printed, no error.

### Step 2 — Row counts look reasonable

```bash
docker exec -it ai-fsm-postgres psql \
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

On garonhome, port 3000 is not exposed to the host. Run the health check from inside the container:

```bash
docker exec ai-fsm-web wget -qO- http://localhost:3000/api/health | jq .
```

Expected response:
```json
{ "status": "ok", "service": "web", "checks": { "db": "ok" }, "ts": "..." }
```

Or via the reverse proxy:

```bash
curl -sf http://fsm.garonhome.local/api/health | jq .
```

### Step 4 — Smoke test login

```bash
curl -s -X POST http://fsm.garonhome.local/api/v1/auth/login \
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
DUMP_FILE="/opt/business/ai-fsm/backups/ai_fsm_<timestamp>.dump"
pg_restore --list "$DUMP_FILE" | head -20
```

No error output = file is structurally valid.

---

## Recovery Time Objective (RTO)

| Database size | Estimated restore time |
|---------------|------------------------|
| < 100 MB | 1–3 minutes |
| 100 MB – 1 GB | 3–15 minutes |
| > 1 GB | 15+ minutes |

---

## Known Limitations (MVP)

1. **No point-in-time recovery (PITR)** — WAL archiving not configured. Maximum data loss = 24 hours (last backup).
2. **No replication / standby** — single-node PostgreSQL. If garonhome.local hardware fails, restore from offsite backup to another x86 host.
3. **Backup encryption** — dump files are not encrypted at rest. If the host is physically accessible to untrusted parties, add `gpg --encrypt` to the backup script.
