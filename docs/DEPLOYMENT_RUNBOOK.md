# Deployment Runbook — ai-fsm

**Target:** `garonhome.local` (x86, `infra/compose.garonhome.yml`)

> **Source evidence**
> - `docs/GARONHOME_DEPLOYMENT.md`: full garonhome setup blueprint and host layout.
> - `docs/BACKUP_RUNBOOK.md`: backup strategy and retention policy (canonical reference).
> - `infra/compose.garonhome.yml`: garonhome service definitions.

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

## Rollback Entry Format

Record in `docs/DECISION_LOG.md`:

```
### ROLLBACK-<YYYY-MM-DD>: <reason>
- Date (UTC): <datetime>
- Target: garonhome.local
- Previous commit/tag: <ref>
- Rolled-back commit/tag: <ref>
- Reason: <describe the incident>
- Restore required: yes/no
- Resolution: <next steps>
```
