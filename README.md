# Dovetails FSM

Dovetails FSM is a residential handyman and home maintenance operating system focused on preserving property history, managing client relationships, creating accurate estimates, executing work efficiently, and maintaining a permanent service record for every property.

## Canonical Product Docs

Product direction comes only from:

- [Product Vision](docs/canonical/PRODUCT_VISION.md)
- [Domain Model](docs/canonical/DOMAIN_MODEL.md)
- [Workflow](docs/canonical/WORKFLOW.md)
- [Architecture](docs/canonical/ARCHITECTURE.md)
- [Roadmap](docs/canonical/ROADMAP.md)

Historical plans, generated reports, archived agent docs, and working notes are supporting material only.

## Quick Start

```bash
cp .env.example .env
pnpm install
docker compose -f infra/compose.dev.yml up -d postgres redis
pnpm db:migrate
pnpm dev:web
```

## Project Layout

- `apps/web`: Next.js web app for owner/admin/tech workflows.
- `services/worker`: background worker for queued notifications and automation support.
- `packages/domain`: shared schemas, labels, constants, and domain helpers.
- `db/migrations`: SQL schema and migration history.
- `infra`: Docker Compose profiles.
- `docs/canonical`: source-of-truth product direction.
- `docs/working`: implementation and operations support.
- `docs/archive`: historical planning material.
- `docs/generated`: generated reports, audits, and migration records.

## Quality Gate

```bash
pnpm gate
```

For faster local static/unit feedback:

```bash
pnpm gate:fast
```

## Production Target

Production runs on garonhome.local using `infra/compose.garonhome.yml` and deploy root `/opt/business/ai-fsm`.
