# Deployment Runbook — ai-fsm

**Primary target:** `garonhome.local` (x86, `infra/compose.garonhome.yml`)
**Secondary / Legacy target:** Raspberry Pi 4 (`infra/compose.pi.yml`)

All releases go to garonhome first. Pi is kept as a secondary reference target.

> **Source evidence**
> - `docs/GARONHOME_DEPLOYMENT.md`: full garonhome setup blueprint and host layout.
> - `docs/PI4_DEPLOYMENT.md`: Pi4 hardware notes (secondary reference).
> - `docs/BACKUP_RUNBOOK.md`: backup strategy and retention policy (canonical reference).
> - `infra/compose.garonhome.yml`: garonhome service definitions.
> - `infra/compose.pi.yml`: Pi service definitions and memory limits.

---

## Primary Target: garonhome.local

**Host layout:**

```text
/opt/business/ai-fsm/
  repo/       git checkout of ai-fsm
  env/        .env only
  data/
    postgres/
    redis/
  backups/    pg_dump files
```

**Deployment model:**

- App runs behind Nginx Proxy Manager. No host port `3000` is published.
- Internal hostname: `ai-fsm-web` on the shared proxy network.
- Recommended proxy hostname: `fsm.garonhome.local`
- Verify health at the correct boundary (container → internal → proxy), not at `localhost:3000`.

---

### First Deploy (garonhome)

Full first-time setup is documented in [docs/GARONHOME_DEPLOYMENT.md](GARONHOME_DEPLOYMENT.md).

Summary:

```bash
sudo mkdir -p /opt/business && sudo chown -R "$USER:$USER" /opt/business
git clone https://github.com/byesaw13/ai-fsm.git /opt/business/ai-fsm/repo
cd /opt/business/ai-fsm/repo
bash scripts/setup-garonhome.sh
nano /opt/business/ai-fsm/env/.env   # fill required vars
bash scripts/deploy-garonhome.sh
```

Required env vars: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `APP_BASE_URL`.
Generate a secret: `openssl rand -base64 32`

---

### Redeploy (garonhome) — normal update after merge

```bash
cd /opt/business/ai-fsm/repo
bash scripts/deploy-garonhome.sh
```

The script handles the full release sequence:

1. `git pull origin main`
2. Start `postgres` and `redis` if not running
3. Wait for postgres healthcheck
4. Create `schema_migrations` tracking table if absent; apply only new migration files (already-applied files are skipped — no replay)
5. Build `web` and `worker` from source
6. `docker compose up -d web worker`
7. Wait for web container healthcheck to report `healthy`
8. Print service status and internal health response

Migration replay is prevented by the tracking table. Each migration filename is recorded once on first apply. See `scripts/deploy-garonhome.sh` for implementation details.

---

### Health Verification (garonhome)

```bash
ENV_FILE=/opt/business/ai-fsm/env/.env
COMPOSE_FILE=/opt/business/ai-fsm/repo/infra/compose.garonhome.yml

# Container status
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps

# Container-internal health (not exposed to host)
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T web \
  wget -qO- http://localhost:3000/api/health

# Proxied access (requires DNS or /etc/hosts entry pointing to garonhome IP)
curl -sf http://fsm.garonhome.local/api/health
# Expected: {"status":"ok","service":"web","checks":{"db":"ok"}, ...}
```

---

### Verify migration tracking table

After first deploy or a migration-adding release:

```bash
docker compose --env-file /opt/business/ai-fsm/env/.env \
  -f /opt/business/ai-fsm/repo/infra/compose.garonhome.yml \
  exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "SELECT filename, applied_at FROM schema_migrations ORDER BY filename"
```

---

### Backup (garonhome)

```bash
cd /opt/business/ai-fsm/repo
bash scripts/backup-garonhome.sh
```

Writes a compressed Postgres custom dump to `/opt/business/ai-fsm/backups/`.

Recommended cron (run as the deploy user):

```cron
0 2 * * * cd /opt/business/ai-fsm/repo && bash scripts/backup-garonhome.sh >> /opt/business/ai-fsm/backups/backup.log 2>&1
```

---

### Restore (garonhome)

```bash
cd /opt/business/ai-fsm/repo
bash scripts/restore-garonhome.sh /opt/business/ai-fsm/backups/ai_fsm_YYYYMMDDTHHMMSSZ.dump
```

The restore script: stops web/worker → terminates DB sessions → drops and recreates DB → restores dump → restarts web/worker → verifies health.

---

### Rollback (garonhome)

If a release causes critical issues:

```bash
cd /opt/business/ai-fsm/repo

# Option A — revert to a specific commit and redeploy
git checkout <previous-commit>
bash scripts/deploy-garonhome.sh

# Option B — restore from pre-release backup
bash scripts/restore-garonhome.sh /opt/business/ai-fsm/backups/ai_fsm_<pre-release-ts>.dump
```

Log rollbacks in `docs/DECISION_LOG.md` using the ROLLBACK entry format.

---

### Relocating to another x86 host

1. Install Docker + Compose on the new host
2. Clone the repo to `/opt/business/ai-fsm/repo`
3. Copy `/opt/business/ai-fsm/env/.env`
4. Copy the latest backup from `/opt/business/ai-fsm/backups/`
5. `bash scripts/setup-garonhome.sh`
6. Connect nginx-proxy-manager to the proxy network: `docker network connect business_proxy nginx-proxy-manager`
7. `bash scripts/deploy-garonhome.sh`
8. `bash scripts/restore-garonhome.sh <dump>`
9. Recreate the proxy host in Nginx Proxy Manager

---

## Secondary Target: Raspberry Pi 4 (Legacy)

> **Note:** The Pi is a secondary/legacy target. Use garonhome.local for active deployments. These instructions are kept for reference and fallback use. Authoritative Pi-specific details: [docs/PI4_DEPLOYMENT.md](PI4_DEPLOYMENT.md).

### Pi4 Hardware and Operating Limits

| Resource | Recommended | Minimum |
|----------|-------------|---------|
| RAM | 8 GB | 4 GB |
| Storage (SD / SSD) | External SSD (64 GB+) | SD 32 GB (risk: high write wear) |
| CPU | Cortex-A72 (ARMv8) | Same |
| OS | Raspberry Pi OS 64-bit (Bookworm) | Ubuntu Server 22.04 arm64 |

**Strongly recommended:** Use an external SSD for PostgreSQL data.

### Docker Compose Memory Limits (compose.pi.yml)

| Service | Limit | Expected idle |
|---------|-------|---------------|
| `web` (Next.js) | 700 MB | ~200 MB |
| `worker` | 256 MB | ~64 MB |
| `postgres` | 900 MB | ~150 MB |
| `redis` | 128 MB | ~30 MB |
| **Total headroom** | **~2 GB** | **~444 MB idle** |

---

### First Deploy (Pi4)

```bash
# 1. Install Docker Engine
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker pi   # then log out/in

# 2. Set swap ≥ 1 GB (essential for 4 GB Pi4)
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile   # CONF_SWAPSIZE=1024
sudo dphys-swapfile setup && sudo dphys-swapfile swapon

# 3. Copy and fill .env
cp .env.example .env && nano .env

# 4. Start all services
docker compose -f infra/compose.pi.yml up -d

# 5. Run migrations (first deploy only)
for f in $(ls db/migrations/*.sql | sort); do
  [[ "$f" == *seed* ]] && continue
  echo "Applying $f..."
  docker exec -i ai-fsm-postgres psql \
    --username="${POSTGRES_USER}" --dbname="${POSTGRES_DB}" < "$f"
done
```

Required env vars (same as garonhome): `DATABASE_URL`, `AUTH_SECRET`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `REDIS_URL`, `NODE_OPTIONS=--max-old-space-size=256`

---

### Redeploy (Pi4)

```bash
# 1. Pull latest images
docker compose -f infra/compose.pi.yml pull

# 2. Pre-upgrade backup
/home/pi/scripts/backup_db.sh

# 3. Apply only new migrations manually (check which have already been applied)

# 4. Recreate containers
docker compose -f infra/compose.pi.yml up -d --force-recreate web worker

# 5. Verify
curl -sf http://localhost:3000/api/health
```

---

### Health Verification (Pi4)

```bash
docker compose -f infra/compose.pi.yml ps
curl -sf http://localhost:3000/api/health
# Expected: {"status":"ok","checks":{"db":"ok"},...}
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"
```

---

### Backup (Pi4)

```bash
mkdir -p /home/pi/scripts /home/pi/backups

cat > /home/pi/scripts/backup_db.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR="/home/pi/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="${BACKUP_DIR}/ai_fsm_${TIMESTAMP}.dump"
mkdir -p "$BACKUP_DIR"
docker exec ai-fsm-postgres pg_dump \
  --username=postgres --format=custom --compress=9 ai_fsm > "$FILE"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
find "$BACKUP_DIR" -name "ai_fsm_*.dump" -mtime +7 -delete
EOF

chmod +x /home/pi/scripts/backup_db.sh

# Cron (daily at 02:00)
(crontab -l 2>/dev/null; echo "0 2 * * * /home/pi/scripts/backup_db.sh >> /home/pi/logs/backup.log 2>&1") | crontab -
```

---

### Restore (Pi4)

```bash
# Stop app
docker compose -f infra/compose.pi.yml stop web worker

# Drop and recreate DB
docker exec ai-fsm-postgres psql --username=postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='ai_fsm' AND pid<>pg_backend_pid()"
docker exec ai-fsm-postgres psql --username=postgres -c "DROP DATABASE IF EXISTS ai_fsm"
docker exec ai-fsm-postgres psql --username=postgres -c "CREATE DATABASE ai_fsm OWNER postgres"

# Restore
DUMP_FILE="/home/pi/backups/ai_fsm_<timestamp>.dump"
docker exec -i ai-fsm-postgres pg_restore \
  --username=postgres --dbname=ai_fsm --no-owner --no-acl < "$DUMP_FILE"

# Restart and verify
docker compose -f infra/compose.pi.yml start web worker
curl -sf http://localhost:3000/api/health | jq .
```

---

### Rollback (Pi4)

```bash
# Identify previous image tag
docker image ls ghcr.io/your-org/ai-fsm-web --format "{{.Tag}}\t{{.CreatedAt}}"

# Edit infra/compose.pi.yml to pin the previous tag, then:
docker compose -f infra/compose.pi.yml up -d --force-recreate web worker
curl -sf http://localhost:3000/api/health
```

Log in `docs/DECISION_LOG.md` using the ROLLBACK entry format.

---

### Pi4-Specific Constraints

| Constraint | Value |
|-----------|-------|
| Architecture | `linux/arm64` |
| Max total memory | ~2 GB allocated to Docker |
| Swap | ≥ 1 GB recommended |
| Next.js heap | `--max-old-space-size=256` (`NODE_OPTIONS`) |
| Docker Compose | v2.x required |
| Concurrent workers | 1 (`WORKER_CONCURRENCY=1`) |
| Log rotation | 50 MB × 3 per service |
| Backup retention | 7 days local / 30 days offsite target |
| RPO | 24 hours |

---

## Rollback Entry Format (both targets)

Record in `docs/DECISION_LOG.md`:

```
### ROLLBACK-<YYYY-MM-DD>: <reason>
- Date (UTC): <datetime>
- Target: garonhome.local | Pi4
- Previous commit/tag: <ref>
- Rolled-back commit/tag: <ref>
- Reason: <describe the incident>
- Restore required: yes/no
- Resolution: <next steps>
```
