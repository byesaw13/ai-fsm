# Deployment Runbook — ai-fsm Pi4

**Authoritative reference for:** deploying, updating, and rolling back ai-fsm on a Raspberry Pi 4.
**Scope:** Pi4 production-lite deployment (`infra/compose.pi.yml`).
**VPS (compose.prod.yml):** same procedure; substitute the compose file and adjust resource limits.

> **Source evidence**
> - Dovelite `READY_TO_DEPLOY.md`: pre-flight checklist pattern, rollback via git checkout, smoke test structure.
> - Myprogram `EDGE_FUNCTIONS_RUNBOOK.md`: structured verification steps, rollback options.
> - ai-fsm `docs/BACKUP_RUNBOOK.md`: backup strategy and retention policy (canonical reference).
> - ai-fsm `infra/compose.pi.yml`: service definitions, memory limits.

---

## Pi4 Hardware and Operating Limits

| Resource | Recommended | Minimum |
|----------|-------------|---------|
| RAM | 8 GB | 4 GB |
| Storage (SD / SSD) | External SSD (64 GB+) | SD 32 GB (risk: high write wear) |
| CPU | Cortex-A72 (ARMv8) | Same |
| OS | Raspberry Pi OS 64-bit (Bookworm) | Ubuntu Server 22.04 arm64 |

**Strongly recommended:** Use an external SSD for PostgreSQL data. SD cards have limited write cycles and will degrade rapidly under daily database writes.

### Docker Compose Memory Limits (compose.pi.yml)

| Service | Limit | Expected idle |
|---------|-------|---------------|
| `web` (Next.js) | 700 MB | ~200 MB |
| `worker` | 256 MB | ~64 MB |
| `postgres` | 900 MB | ~150 MB |
| `redis` | 128 MB | ~30 MB |
| **Total headroom** | **~2 GB** | **~444 MB idle** |

Pi4 OS and kernel use approximately 300–500 MB. With 8 GB RAM and 1+ GB swap, this configuration has comfortable headroom. With 4 GB RAM, maintain ≥ 1 GB swap.

---

## Prerequisites

### On the Pi4 host

```bash
# 1. Install Docker Engine (not Docker Desktop)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker pi   # replace 'pi' with your username, then log out/in

# 2. Verify Docker Compose plugin
docker compose version   # must be v2.x

# 3. Set swap to ≥ 1 GB (essential for 4 GB Pi4)
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile   # CONF_SWAPSIZE=1024
sudo dphys-swapfile setup && sudo dphys-swapfile swapon
free -h   # verify swap is active

# 4. Install helper tools
sudo apt-get install -y curl jq rclone   # rclone for offsite backup
```

### Prepare the .env file

Copy `.env.example` from the repo and fill in all values on the Pi4:

```bash
cp .env.example .env
nano .env
```

**Required variables:**

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | e.g. `postgresql://fsm_user:password@postgres:5432/ai_fsm` |
| `AUTH_SECRET` | ≥ 32 random chars — generate with: `openssl rand -base64 32` |
| `POSTGRES_DB` | `ai_fsm` |
| `POSTGRES_USER` | `fsm_user` (or your choice) |
| `POSTGRES_PASSWORD` | Strong random password |
| `REDIS_URL` | `redis://redis:6379` |
| `NODE_OPTIONS` | `--max-old-space-size=256` (limits Next.js heap on Pi4) |

**Validate** the `.env` before starting:
```bash
grep -c "AUTH_SECRET=" .env   # must return 1
```

---

## First Deploy

### Step 1 — Pull images

```bash
# All images are linux/arm64
docker compose -f infra/compose.pi.yml pull
```

### Step 2 — Start database and run migrations

```bash
# Start only postgres first
docker compose -f infra/compose.pi.yml up -d postgres

# Wait for healthcheck to pass
watch docker compose -f infra/compose.pi.yml ps

# Apply all migrations in order
for f in $(ls db/migrations/*.sql | sort); do
  echo "Applying $f ..."
  docker exec -i ai-fsm-postgres psql \
    --username="${POSTGRES_USER}" \
    --dbname="${POSTGRES_DB}" < "$f"
done
```

> **Note:** Migrations are additive only. Never modify a previously-applied migration file — create a new numbered migration instead.

### Step 3 — Start all services

```bash
docker compose -f infra/compose.pi.yml up -d
```

### Step 4 — Verify

```bash
# Container status
docker compose -f infra/compose.pi.yml ps
# Expected output (all four services Up, postgres healthy):
# NAME                 IMAGE                        COMMAND                  SERVICE    CREATED        STATUS                   PORTS
# ai-fsm-web          ghcr.io/.../ai-fsm-web:...   "docker-entrypoint.s…"  web        2 minutes ago  Up 2 minutes             0.0.0.0:3000->3000/tcp
# ai-fsm-worker       ghcr.io/.../ai-fsm-worker:…  "docker-entrypoint.s…"  worker     2 minutes ago  Up 2 minutes
# ai-fsm-postgres     postgres:16                   "docker-entrypoint.s…"  postgres   2 minutes ago  Up 2 minutes (healthy)   0.0.0.0:5432->5432/tcp
# ai-fsm-redis        redis:7                       "docker-entrypoint.s…"  redis      2 minutes ago  Up 2 minutes

# Health check
curl -sf http://localhost:3000/api/health
# Expected output:
# {"status":"ok","service":"web","checks":{"db":"ok"},"ts":"<ISO-timestamp>","traceId":"<uuid>"}

# Login smoke test
curl -si -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<seed-password>"}' | head -5
# Expected:
# HTTP/1.1 200 OK
# Set-Cookie: session=<jwt-token>; Path=/; HttpOnly; SameSite=Lax

# Memory usage
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"
# Expected: all services well below their limits; no service above 80% of its cap

# Tail logs for startup errors (should see structured JSON, no ERROR level lines)
docker compose -f infra/compose.pi.yml logs --tail=50 web worker
```

---

## Log Rotation Configuration

Docker's default log driver can fill the SD card / SSD. Add `logging` config to each long-running service in `infra/compose.pi.yml`:

```yaml
# Add this block under the 'web', 'worker', and 'postgres' service definitions:
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "3"
```

This caps logs at 150 MB per service (3 × 50 MB rotated files).

> **Gate check:** Section 5.1 of PROD_READINESS_CHECKLIST.md verifies this is configured before go-live.

---

## Backup Configuration

### Install backup script

```bash
mkdir -p /home/pi/scripts /home/pi/backups /home/pi/logs

cat > /home/pi/scripts/backup_db.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/home/pi/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="${BACKUP_DIR}/ai_fsm_${TIMESTAMP}.dump"

mkdir -p "$BACKUP_DIR"

docker exec ai-fsm-postgres pg_dump \
  --username=postgres \
  --format=custom \
  --compress=9 \
  ai_fsm > "$FILE"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup written: $FILE ($(du -h "$FILE" | cut -f1))"

# Prune local backups older than 7 days
find "$BACKUP_DIR" -name "ai_fsm_*.dump" -mtime +7 -delete
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Old backups pruned"

# Offsite copy (configure rclone remote named 'backup')
# Uncomment once rclone is configured:
# rclone copy "$BACKUP_DIR/" backup:ai-fsm-backups/ --include "ai_fsm_*.dump"
EOF

chmod +x /home/pi/scripts/backup_db.sh
```

### Install healthcheck script

```bash
cat > /home/pi/scripts/healthcheck.sh << 'EOF'
#!/usr/bin/env bash
STATUS=$(curl -sf http://localhost:3000/api/health | jq -r '.status' 2>/dev/null || echo "unreachable")
if [ "$STATUS" != "ok" ]; then
  curl -d "ai-fsm health: $STATUS at $(date -u)" ntfy.sh/YOUR_TOPIC 2>/dev/null || true
fi
EOF

chmod +x /home/pi/scripts/healthcheck.sh
```

### Install cron jobs

```bash
(crontab -l 2>/dev/null; cat << 'CRON'
# ai-fsm: daily DB backup at 02:00
0 2 * * * /home/pi/scripts/backup_db.sh >> /home/pi/logs/backup.log 2>&1
# ai-fsm: health check every 5 minutes
*/5 * * * * /home/pi/scripts/healthcheck.sh >> /home/pi/logs/healthcheck.log 2>&1
CRON
) | crontab -
```

**Backup retention policy:** 7 days local + 30 days offsite (once rclone is configured).
**RPO:** 24 hours (daily backup cadence). WAL archiving is not configured (post-MVP).

**Verify backup script and cron are installed:**
```bash
# Syntax check
bash -n /home/pi/scripts/backup_db.sh && echo "syntax OK"
# Expected: syntax OK

# Run once manually to confirm it works
/home/pi/scripts/backup_db.sh
# Expected output:
# [2026-02-19T02:00:01Z] Backup written: /home/pi/backups/ai_fsm_20260219_020001.dump (1.4M)
# [2026-02-19T02:00:01Z] Old backups pruned

# Verify cron entry
crontab -l | grep backup_db
# Expected: 0 2 * * * /home/pi/scripts/backup_db.sh ...

# Verify log rotation on running container
docker inspect ai-fsm-web --format '{{.HostConfig.LogConfig}}'
# Expected: {json-file map[max-file:3 max-size:50m]}
```

---

## Restore Procedure

Use this procedure for full database restore from a backup file.
Canonical details: [docs/BACKUP_RUNBOOK.md](BACKUP_RUNBOOK.md).

```bash
# 1. Stop app to prevent writes
docker compose -f infra/compose.pi.yml stop web worker

# 2. Drop and recreate the database
docker exec -it ai-fsm-postgres psql --username=postgres <<'SQL'
SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
 WHERE datname = 'ai_fsm' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS ai_fsm;
CREATE DATABASE ai_fsm OWNER postgres;
SQL

# 3. Restore from dump (set DUMP_FILE to the file you want)
DUMP_FILE="/home/pi/backups/ai_fsm_<timestamp>.dump"
docker exec -i ai-fsm-postgres pg_restore \
  --username=postgres \
  --dbname=ai_fsm \
  --verbose \
  --no-owner \
  --no-acl \
  < "$DUMP_FILE"

# 4. Restart services
docker compose -f infra/compose.pi.yml start web worker

# 5. Validate (see PROD_READINESS_CHECKLIST.md Section 6)
curl -sf http://localhost:3000/api/health | jq .
```

---

## Updating to a New Release

```bash
# 1. Pull latest images
docker compose -f infra/compose.pi.yml pull
# Expected: "Pulled" lines for web and worker; postgres/redis unchanged if unchanged version

# 2. Take a pre-upgrade backup
/home/pi/scripts/backup_db.sh
# Expected: "[<timestamp>] Backup written: /home/pi/backups/ai_fsm_<ts>.dump (<size>)"

# 3. Apply any new migrations
for f in $(ls db/migrations/*.sql | sort); do
  docker exec -i ai-fsm-postgres psql \
    --username="${POSTGRES_USER}" \
    --dbname="${POSTGRES_DB}" < "$f"
done
# Expected: each migration outputs "CREATE TABLE", "ALTER TABLE", "CREATE INDEX", etc.
# A migration that's already been applied will output errors about duplicate objects;
# wrap idempotent migrations with IF NOT EXISTS to avoid this.

# 4. Recreate containers with new images
docker compose -f infra/compose.pi.yml up -d --force-recreate web worker
# Expected: "Recreating ai-fsm-web ... done" and "Recreating ai-fsm-worker ... done"

# 5. Verify health
curl -sf http://localhost:3000/api/health
# Expected: {"status":"ok","checks":{"db":"ok"},...}
```

---

## Rollback Plan

If a new release causes P1/P2 issues, roll back to the previous image tag.

### Step 1 — Identify the previous image tag

```bash
# List recent image pulls from the registry
docker image ls ghcr.io/your-org/ai-fsm-web --format "{{.Tag}}\t{{.CreatedAt}}"
```

### Step 2 — Pin the compose file to the previous tag

Edit `infra/compose.pi.yml`:
```yaml
# Change:
image: ghcr.io/your-org/ai-fsm-web:latest
# To:
image: ghcr.io/your-org/ai-fsm-web:<previous-tag>
```

Do the same for `ai-fsm-worker`.

### Step 3 — Redeploy

```bash
docker compose -f infra/compose.pi.yml up -d --force-recreate web worker
# Expected: "Recreating ai-fsm-web ... done" and "Recreating ai-fsm-worker ... done"

curl -sf http://localhost:3000/api/health
# Expected: {"status":"ok","checks":{"db":"ok"},...}
# If health check returns "degraded" or times out → check logs and consider DB restore.
```

### Step 4 — Rollback database (if migration was applied)

If the new release applied a migration that must be reverted, restore from the pre-upgrade backup taken in Step 2 of the update procedure. See the Restore Procedure above.

**Warning:** Schema rollbacks are destructive. Always take a backup before applying migrations.

### Step 5 — Log the rollback

Record in `docs/DECISION_LOG.md`:
```
### ROLLBACK-<YYYY-MM-DD>: <reason>
- Date (UTC): <datetime>
- Previous tag: <tag>
- Rolled-back tag: <tag>
- Reason: <describe the incident>
- Restore required: yes/no
- Resolution: <next steps>
```

---

## Useful Commands Quick Reference

```bash
# Start all services
docker compose -f infra/compose.pi.yml up -d

# Stop all services
docker compose -f infra/compose.pi.yml down

# Restart a single service
docker compose -f infra/compose.pi.yml restart web

# View live logs (all services)
docker compose -f infra/compose.pi.yml logs -f

# Filter errors only
docker compose -f infra/compose.pi.yml logs web | jq 'select(.level=="error")'

# Resource usage
docker stats --no-stream

# Check disk
df -h && du -sh /var/lib/docker/*

# Manual backup (run now)
/home/pi/scripts/backup_db.sh

# Health check
curl -sf http://localhost:3000/api/health | jq .

# DB connection test
docker exec -it ai-fsm-postgres psql --username=postgres --dbname=ai_fsm -c "SELECT version();"
```

---

## Pi4-Specific Constraints Summary

| Constraint | Value | Notes |
|-----------|-------|-------|
| Architecture | `linux/arm64` | All images must be ARM64 |
| Max total memory | ~2 GB allocated to Docker | OS needs ~400 MB headroom |
| Swap | ≥ 1 GB recommended | Critical for 4 GB RAM model |
| DB write speed | ~10 MB/s (SD card) | ~80 MB/s (USB 3 SSD) |
| Next.js heap | `--max-old-space-size=256` | Set in `NODE_OPTIONS` env var |
| Docker Compose | v2.x required | Plugin-style: `docker compose` not `docker-compose` |
| Concurrent worker threads | 1 | Set in worker env via `WORKER_CONCURRENCY=1` |
| Log rotation | 50 MB × 3 per service | Configured in compose.pi.yml |
| Backup retention | 7 days local | 30 days offsite target |
| RPO | 24 hours | WAL archiving deferred post-MVP |
| RTO | 2–20 min | Depends on DB size and storage speed |
