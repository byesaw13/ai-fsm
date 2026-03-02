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

Use redeploy flow for normal updates:

1. `git pull origin main`
2. `docker compose ... build web worker`
3. `docker compose ... up -d web worker`

Do not replay bootstrap SQL migrations blindly on every redeploy.
