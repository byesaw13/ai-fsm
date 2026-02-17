# AI-FSM

AI-first Field Service Management MVP focused on:
- Jobs & visits
- Estimates & invoices
- Automations

Runtime target: Raspberry Pi 4 (ARM64). Development happens on a workstation.

## Quick Start

```bash
cp .env.example .env
pnpm install
docker compose -f infra/compose.dev.yml up -d postgres redis
pnpm db:migrate
pnpm dev:web
```

## Project Layout

- `apps/web`: Next.js web app (admin + tech role views)
- `services/worker`: automation worker
- `packages/domain`: shared domain schema/types
- `db/migrations`: SQL migrations
- `infra`: Docker Compose profiles
- `docs`: AI execution protocol and phase plan

## Quality Gate

```bash
pnpm gate
```


## Production (VPS)

```bash
docker compose -f infra/compose.prod.yml up -d
```
