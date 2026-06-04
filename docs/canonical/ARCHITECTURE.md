# Architecture

## System Shape

Dovetails FSM is a pnpm monorepo with a Next.js web app, shared domain package, PostgreSQL database, Redis-backed worker support, SQL migrations, and Docker Compose deployment profiles.

## Runtime Components

| Component | Path | Purpose |
|---|---|---|
| Web app | `apps/web` | Owner/admin/tech UI and API routes. |
| Worker | `services/worker` | Background notification, queue, and automation processing. |
| Domain package | `packages/domain` | Shared schemas, constants, status labels, and Dovetails-specific domain helpers. |
| Database migrations | `db/migrations` | SQL schema, policies, and additive migrations. |
| Infrastructure | `infra` | Local, production, and garonhome Docker Compose profiles. |

## Data Model

PostgreSQL is the source of persistence. The application uses raw SQL and row-level security rather than an ORM. Tables are account-scoped for tenant isolation even though the current Dovetails deployment is single-business.

The canonical product model is defined in `docs/canonical/DOMAIN_MODEL.md`. Technical status contracts may live in working documentation, but product direction comes from canonical docs.

## Deployment

The active production target is garonhome.local using `infra/compose.garonhome.yml` and a deploy root under `/opt/business/ai-fsm`.

Development uses local Compose services for PostgreSQL and Redis.

## Quality Gates

The primary validation command is:

```bash
pnpm gate
```

For faster static/unit feedback:

```bash
pnpm gate:fast
```

## Architectural Guardrails

- Keep product vocabulary aligned with canonical docs.
- Prefer derived views over new stored workflow objects.
- Keep migrations additive unless a deliberate migration plan exists.
- Keep pricing and workflow rules centralized in shared domain or focused server helpers.
- Do not let deployment, agent, or historical phase documents define product scope.
