# Garonhome Deployment Blueprint

This target packages `ai-fsm` as a portable Docker Compose bundle on `garonhome.local` or any future x86 Linux host.

## Goals

- keep business services isolated from the existing media/home stack
- build from local source, no registry required
- keep all persistent state in one predictable root
- make future relocation a copy-and-restore exercise, not a rebuild

## Host layout

```text
/opt/business/ai-fsm/
  repo/       git checkout of ai-fsm
  env/        .env only
  data/
    postgres/
    redis/
  backups/    pg_dump files
  scripts/    optional host-local wrappers
```

Use bind mounts under `data/` instead of Docker named volumes. That keeps migration to another host straightforward.

## Docker layout

Compose file: `infra/compose.garonhome.yml`

Services:

- `web`
- `worker`
- `postgres`
- `redis`

Networks:

- `${COMPOSE_PROJECT_NAME}_internal` for app-private traffic
- external `${PROXY_NETWORK}` for reverse proxy attachment

The `web` service joins both networks. `postgres` and `redis` remain internal only.

## Reverse proxy plan

This host already runs `nginx-proxy-manager`. Keep `ai-fsm` off host ports and proxy it internally.

Recommended hostnames:

- `fsm.garonhome.local` for internal testing
- or later: `fsm.<your-domain>` for public/VPN access

Connect `nginx-proxy-manager` to the external proxy network once:

```bash
docker network connect business_proxy nginx-proxy-manager
```

Then create a proxy host:

- Domain: `fsm.garonhome.local`
- Scheme: `http`
- Forward Hostname/IP: `ai-fsm-web`
- Forward Port: `3000`

The Compose file assigns `ai-fsm-web` as a stable alias on the shared proxy network. Use that alias instead of generated container names.

## First-time setup

On `garonhome.local`:

```bash
sudo mkdir -p /opt/business
sudo chown -R "$USER:$USER" /opt/business

git clone https://github.com/byesaw13/ai-fsm.git /opt/business/ai-fsm/repo
cd /opt/business/ai-fsm/repo

bash scripts/setup-garonhome.sh
nano /opt/business/ai-fsm/env/.env
```

Required env values:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_SECRET`
- `APP_BASE_URL`

Generate a secret with:

```bash
openssl rand -base64 32
```

## Deploy

```bash
cd /opt/business/ai-fsm/repo
bash scripts/deploy-garonhome.sh
```

What the deploy script does:

1. start `postgres` and `redis`
2. wait for postgres health
3. apply all SQL migrations in `db/migrations`
4. build `web` and `worker` from source
5. start `web` and `worker`
6. wait for the web container healthcheck to report `healthy`
7. print service status and a container-internal web health response

The deployment is intentionally internal-only. The script does not assume `localhost:3000` is reachable from the host.

## LAN access strategy

The app is designed to be reached through Nginx Proxy Manager, not via a published host port.

For local testing, either:

- add a hosts entry on the client machine:
  - `192.168.40.27 fsm.garonhome.local`
- or create a real local DNS record for `fsm.garonhome.local`

Quick validation from the host after proxy setup:

```bash
curl -i http://fsm.garonhome.local/api/health
```

Expected:

- `HTTP/1.1 200 OK`
- JSON payload with `"status":"ok"`

## Backup

```bash
cd /opt/business/ai-fsm/repo
bash scripts/backup-garonhome.sh
```

This writes a compressed Postgres custom dump to:

```text
/opt/business/ai-fsm/backups/
```

Recommended cron:

```cron
0 2 * * * cd /opt/business/ai-fsm/repo && bash scripts/backup-garonhome.sh >> /opt/business/ai-fsm/backups/backup.log 2>&1
```

## Restore

```bash
cd /opt/business/ai-fsm/repo
bash scripts/restore-garonhome.sh /opt/business/ai-fsm/backups/ai_fsm_YYYYMMDDTHHMMSSZ.dump
```

The restore script:

1. stops `web` and `worker`
2. terminates active DB sessions
3. drops and recreates the application database
4. restores the dump
5. restarts `web` and `worker`
6. verifies the web health endpoint

## Relocating to another machine

To move later:

1. install Docker + Compose on the new host
2. copy or clone the repo to the same layout
3. copy `/opt/business/ai-fsm/env/.env`
4. copy the latest backup from `/opt/business/ai-fsm/backups/`
5. run `scripts/setup-garonhome.sh`
6. run `docker network connect <proxy-network> nginx-proxy-manager` on the new host if using NPM
7. run `scripts/deploy-garonhome.sh`
8. run `scripts/restore-garonhome.sh <dump>`
9. recreate the proxy host

## Why this is separate enough

- no dependence on Pi-specific `arm64` settings
- no dependence on host ports for app internals
- no dependence on existing server folders outside `/opt/business/ai-fsm`
- data, config, code, and backups are all cleanly separated
- moving to another x86 host or VPS later is a documented process
