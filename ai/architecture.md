# Architecture: Dovetails FSM

## 1. System Shape & Tech Stack
Dovetails FSM is structured as a TypeScript monorepo built using `pnpm`.
- **Frontend / API**: Next.js 15 app in `apps/web` (standalone production target).
- **Background Worker**: Node-based worker daemon in `services/worker` running compiled JS.
- **Shared Domain Package**: Shared logic, constants, schemas, and helper functions in `packages/domain`.
- **Database**: PostgreSQL 16 database.
- **Message Broker & Queue**: Redis 7.

## 2. Monorepo Project Layout
- `apps/web`: Next.js web application for owner/admin/technician dashboards and portal views.
- `services/worker`: Polling worker for processing notifications, reminders, follow-ups, and cron automations.
- `packages/domain`: Reusable schemas (Zod), status vocabulary, and pricing logic.
- `db/migrations`: Raw SQL schema migrations (idempotent, tracked in `schema_migrations` table).
- `infra`: Docker Compose profiles (`infra/compose.garonhome.yml` for production).
- `ai`: AI developer guidelines and local workspace context files.

## 3. Data & Persistence
- **No ORM**: Direct raw SQL query execution using node `pg` client/pool for query control and execution performance.
- **RLS (Row Level Security)**: Tenancy isolation enforced at database level via PostgreSQL RLS policies (`db/migrations/003_rls_policies.sql`). Tables are scoped by `account_id` column.
- **Traceability**: All requests carry a trace ID mapped through `AuthSession` and logged to database tables via `trace_id` UUID columns (e.g. `audit_log.trace_id`).

## 4. Quality Control & Validation
- **Unified Quality Gate**: `pnpm gate` runs the entire linting $\rightarrow$ typechecking $\rightarrow$ build $\rightarrow$ unit $\rightarrow$ integration $\rightarrow$ E2E suite.
- **Fast Static Checks**: `pnpm gate:fast` executes linting, typecheck, build verification, and unit tests only.
- **Testing suite**: Playwright for E2E tests, Vitest for unit/integration tests. Includes security tests for RLS policy enforcement.
