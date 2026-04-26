# Skill: ai-fsm-garonhome-deploy

Use this skill for:

- `garonhome.local` setup
- `infra/compose.garonhome.yml`
- `/opt/business/ai-fsm` layout
- deploy/redeploy/backup/restore on the x86 host

## Layout

```text
/opt/business/ai-fsm/
  repo/
  env/
  data/
  backups/
```

## Deployment rules

- source of truth is GitHub, not the host
- app is internal-only behind Nginx Proxy Manager
- do not rely on host port `3000`
- verify health via:
  - container health
  - container-internal `/api/health`
  - proxied hostname if testing user access

## Redeploy rules

Normal redeploy after a merge is a single command:

```bash
cd /opt/business/ai-fsm/repo
bash scripts/deploy-garonhome.sh
```

The script handles: git pull, postgres/redis up, idempotent migration (new files only), build, up, healthcheck.

Do not replay bootstrap SQL migrations blindly on every redeploy. The deploy script prevents this via a `schema_migrations` tracking table — already-applied files are skipped automatically.

## Migration tracking

On first run against an existing database the script detects the pre-existing schema (checks for the `clients` table) and seeds all migration filenames into `schema_migrations` without re-running them. On fresh installs, migrations run normally and are recorded as they apply. Future migrations are applied once and skipped on all subsequent deploys.

Verify tracking table after deploy:

```bash
docker compose --env-file /opt/business/ai-fsm/env/.env \
  -f /opt/business/ai-fsm/repo/infra/compose.garonhome.yml \
  exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "SELECT filename, applied_at FROM schema_migrations ORDER BY filename"
```
