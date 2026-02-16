# Test Strategy Contract (FROZEN)

> Status: **FROZEN** as of 2026-02-16 — P0-T3
> Any changes require ADR entry in `docs/DECISION_LOG.md` and orchestrator approval.

## Source Evidence

- **Dovelite**: `playwright.config.ts` — E2E config (single worker, no parallelism for multi-tenant safety); `tests/qa.spec.ts` — Auth, visit CRUD, client CRUD, navigation tests; `tests/fixtures.ts` — Login helpers, seed data loading, deterministic UUIDs; `scripts/preflight.mjs` — Pre-deploy validation
- **Myprogram**: `RLS_POLICY_MATRIX.md` — RLS abuse test matrix (cross-tenant, role escalation); `docs/BACKEND_CONSTITUTION.md` — Zero-trust security model; `supabase/migrations/003_workflow_invariants.sql` — DB-enforced invariant tests
- **Adopted from Dovelite**: Playwright for E2E, single-worker execution, deterministic seed UUIDs, fixture-based test helpers
- **Adopted from Myprogram**: RLS abuse testing approach (cross-tenant SELECT/UPDATE/DELETE), role escalation tests, immutability enforcement tests
- **Intentional divergences**: ai-fsm uses Vitest (not Jest) for unit/integration tests; no Supabase test helpers — direct pg connection; added deploy smoke test as gate step

## Tooling

| Layer | Tool | Config |
|-------|------|--------|
| Unit | Vitest | `vitest.config.ts` per workspace |
| Integration | Vitest + pg test container | Test against real PostgreSQL |
| E2E | Playwright | Single worker, `http://localhost:3000` |
| Lint | ESLint (Next.js core-web-vitals) | Per workspace |
| Typecheck | `tsc --noEmit` | Per workspace |

## Gate Sequence

Every PR must pass all gates in order. A failure at any step blocks the merge.

```
1. lint          → pnpm lint
2. typecheck     → pnpm typecheck
3. unit          → pnpm test (vitest unit tests)
4. integration   → pnpm test:integration (vitest with pg)
5. e2e           → pnpm test:e2e (playwright)
6. security/rls  → pnpm test:rls (cross-tenant abuse tests)
7. build         → pnpm build
8. deploy smoke  → scripts/smoke-test.sh (health check after deploy)
```

Current `pnpm gate` runs: `lint && typecheck && build && test`. This will be expanded as test infrastructure is implemented.

## Test Categories

### Unit Tests
- **Scope**: Pure functions, Zod schema validation, status transition logic, utility helpers
- **Location**: `**/*.test.ts` colocated with source files
- **Isolation**: No DB, no network, no filesystem
- **Coverage target**: Domain logic and validation schemas at 90%+

### Integration Tests
- **Scope**: API route handlers, database queries, RLS policies, workflow transitions
- **Location**: `**/*.integration.test.ts`
- **Setup**: Ephemeral PostgreSQL (testcontainers or Docker), migrations applied per suite
- **Isolation**: Each test suite gets a clean database; transactions rolled back between tests
- **Coverage target**: All CRUD endpoints, all status transitions, all RLS policies

### E2E Tests
- **Scope**: Full user workflows through the browser
- **Location**: `tests/e2e/*.spec.ts`
- **Config**: Single worker, no parallel execution (avoids session conflicts)
- **Seed data**: Deterministic UUIDs for predictable test state

**Required E2E scenarios**:
1. Login as owner → create client → create job → schedule visit
2. Login as tech → view assigned visit → mark arrived → complete
3. Create estimate → send → approve → convert to invoice
4. Record payment → verify invoice status auto-updates
5. Unauthorized route access redirects to login
6. Tech cannot access admin-only routes

### RLS Abuse Tests
- **Scope**: Cross-tenant data isolation, role escalation prevention
- **Location**: `tests/rls/*.test.ts`
- **Approach**: Two test accounts with separate users. Each test attempts unauthorized access.

**Required RLS scenarios**:
1. User A cannot SELECT entities belonging to Account B
2. User A cannot UPDATE entities belonging to Account B
3. User A cannot DELETE entities belonging to Account B
4. Tech cannot UPDATE jobs they are not assigned to
5. Tech cannot create/update estimates or invoices
6. Direct SQL bypass attempt fails (RLS enforced even for authenticated sessions)

### Deploy Smoke Tests
- **Scope**: Production health after deployment
- **Approach**: HTTP health check + basic auth flow

**Required smoke checks**:
1. `/api/health` returns 200
2. Login endpoint responds
3. Database connection active (health check queries pg)
4. Redis connection active (health check pings redis)

## Severity Policy

| Severity | Gate Impact | SLA |
|----------|-----------|-----|
| Blocker | Release blocked, immediate fix | Fix before any other work |
| Critical | Release blocked | Fix within current phase |
| High | Release blocked unless risk acceptance in `DECISION_LOG.md` | Fix within current phase |
| Medium | Does not block release | Fix within next phase |
| Low | Does not block release | Backlog, best effort |

## Test Data Conventions

- Seed accounts use deterministic UUIDs: `11111111-...` for Account A, `22222222-...` for Account B
- Seed users: `owner@test.com`, `admin@test.com`, `tech@test.com` (all password: `test1234`)
- All seed data created via `db/migrations/002_seed_dev.sql` and test fixtures
- Tests must not depend on execution order — each test is independently runnable

## CI Integration

GitHub Actions runs the gate sequence on every push and PR. Test results are reported as check annotations. Failed gates block PR merge.

## Phase Rollout

| Phase | Tests Added |
|-------|------------|
| P1 | Unit tests for domain schemas, integration tests for auth + RLS policies |
| P2 | Integration tests for jobs/visits CRUD + transitions, E2E for job/visit workflow |
| P3 | Integration tests for estimates/invoices, E2E for financial workflow, RLS abuse tests |
| P4 | Worker automation tests, deploy smoke tests, full RLS abuse suite |
| P5 | Full regression suite, staging burn-in, production smoke |
