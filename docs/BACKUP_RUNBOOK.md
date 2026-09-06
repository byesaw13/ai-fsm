# PostgreSQL Backup & Restore Runbook

## Overview

This runbook covers backup, restore, and validation procedures for the ai-fsm PostgreSQL database.
Target deployment: garonhome.local running Docker Compose (`infra/compose.garonhome.yml`).
Deploy root: `/opt/business/ai-fsm/`

---

## Backup Strategy

| Backup type | Tool | Frequency | Retention |
|-------------|------|-----------|-----------|
| Logical (SQL dump) | `pg_dump` | Daily (cron) | 7 days local + 30 days offsite (Google Drive, via rclone) |
| Uploaded files (`data/uploads/`) | `tar` | Daily (cron) | 7 days local + 30 days offsite |
| Secrets (`.env`) | `gpg --symmetric` | Daily (cron) | 7 days local + 30 days offsite |
| WAL archiving | Not configured | — | N/A (MVP) |

> **MVP note**: WAL archiving is deferred for post-MVP. Logical backups are sufficient for a low-write field-service app with acceptable RPO of 24 hours.

> **Why the `.env` backup matters**: GitHub has the code, but `.env` is gitignored by design (it holds `POSTGRES_PASSWORD`, `AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, Square tokens). Without a copy of it, a full disk loss leaves you with a restorable database whose `APP_ENCRYPTION_KEY`-protected rows (e.g. Square credentials) are permanently unreadable, even though the bytes are intact.

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
2. `tar` of `/opt/business/ai-fsm/data/uploads/` to `ai_fsm_uploads_YYYYMMDDTHHMMSSZ.tar.gz`
3. `gpg --symmetric` encryption of `.env` to `ai_fsm_env_YYYYMMDDTHHMMSSZ.gpg` (requires a passphrase file — see setup below; skipped with a warning if the file is missing)
4. Pushes all three files offsite via `rclone`
5. Prunes local copies of all three older than 7 days
6. Prunes offsite (Google Drive) copies older than 30 days via `rclone delete --min-age`

### One-time setup: the `.env` backup passphrase

```bash
# On garonhome, once:
openssl rand -base64 32 > /opt/business/ai-fsm/env/backup.passphrase
chmod 600 /opt/business/ai-fsm/env/backup.passphrase
```

Then store that passphrase value in the company password manager (1Password/Bitwarden) as the durable source of truth — the file on disk and the encrypted `.gpg` backups are both useless without it, and it isn't itself backed up (deliberately, so a stolen backup set alone can't decrypt itself).

---

## Offsite / Remote Backup

This is already automatic — `scripts/backup-garonhome.sh` pushes every dump/uploads-tar/`.env.gpg` to the `googledrive:ai-fsm-backups` Google Drive folder via `rclone` as part of the nightly cron run, and prunes copies there older than 30 days (`rclone delete --min-age 30d`, configurable via `FSM_BACKUP_REMOTE_RETENTION_DAYS`).

Direct folder link: `https://drive.google.com/drive/folders/1gYp-bXjpAj3DpTKOvF6RZt1ElH4HNT36`

If you can't find the backups in Drive, it's almost always because the browser session is on a different Google account than the one `rclone` authorized. Check which account by inspecting the token in `rclone config show googledrive`, or just open the direct folder link above and let Google prompt an account switch.

To verify what's actually on Drive right now (bypasses the local log, checks the source of truth):

```bash
rclone lsl googledrive:ai-fsm-backups
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

## Restoring Uploads and Secrets

Needed for a full disaster-recovery rebuild (new host, or a wiped drive) — the DB restore above only covers the database.

### Restore uploaded files

```bash
tar -xzf ai_fsm_uploads_YYYYMMDDTHHMMSSZ.tar.gz -C /opt/business/ai-fsm/data/
```

### Restore `.env`

Requires the passphrase from the password manager (see one-time setup above):

```bash
gpg --batch --yes --decrypt \
  --passphrase-file /path/to/passphrase \
  -o /opt/business/ai-fsm/env/.env \
  ai_fsm_env_YYYYMMDDTHHMMSSZ.gpg
chmod 600 /opt/business/ai-fsm/env/.env
```

On a brand-new host, pull all three files (dump, uploads tar, `.gpg`) from the `googledrive:ai-fsm-backups` rclone remote first, then run these restores before `docker compose up`.

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
3. **DB dump and uploads tar are not encrypted at rest** — only `.env` is encrypted before it leaves the host. If the offsite Google Drive account itself is a concern, add `gpg --encrypt` to the dump and uploads steps too.
