# Test Matrix

This document is the authoritative reference for the project's test tier system.
Every suite has a defined tier, required environment, and documented skip behaviour.

## Tier Overview

| Tier | Name | Run in CI? | Required env vars | Skip mechanism |
|------|------|-----------|------------------|----------------|
| 1 | Unit | ✅ Always | None | Never skipped |
| 2 | DB integration | ✅ When DB available | `TEST_DATABASE_URL` | `describe.skipIf(!process.env.TEST_DATABASE_URL)` |
| 3 | HTTP integration | ❌ Not in CI | `TEST_DATABASE_URL` + `TEST_BASE_URL` | `describe.skipIf(!RUN_INTEGRATION)` where `RUN_INTEGRATION = !!TEST_DATABASE_URL && !!TEST_BASE_URL` |
| 4 | E2E (Playwright) | ❌ Not in CI | `TEST_BASE_URL` + running server + seeded DB | Not in `pnpm test`; run with `pnpm exec playwright test` |

---

## Tier 1 — Unit Tests

Run on every CI push. No external dependencies. Never skipped.

| File | Tests | What it covers |
|------|-------|----------------|
| `packages/domain/src/index.test.ts` | 38 | Zod schema validation, transition maps |
| `apps/web/lib/auth/__tests__/permissions.test.ts` | 19 | Role hierarchy, feature permission helpers |
| `apps/web/lib/auth/__tests__/middleware.unit.test.ts` | 9 | `withAuth`/`withRole` HOFs |
| `apps/web/lib/auth/__tests__/role-views.unit.test.ts` | 32 | Admin vs tech permission expectations for UI |
| `apps/web/lib/__tests__/rate-limit.unit.test.ts` | 13 | Sliding-window limiter, IP extraction |
| `apps/web/lib/__tests__/env.unit.test.ts` | 7 | Env validation, fail-fast errors, build bypass |
| `apps/web/__tests__/middleware.unit.test.ts` | 8 | Security response headers |
| `apps/web/lib/estimates/__tests__/estimates.unit.test.ts` | 23 | Estimate math, schema validation |
| `apps/web/lib/invoices/__tests__/invoices.unit.test.ts` | 28 | Invoice math, status helpers |
| `apps/web/lib/invoices/__tests__/payments.unit.test.ts` | 22 | Payment trigger logic, status sync |
| `apps/web/app/api/v1/jobs/__tests__/jobs.unit.test.ts` | 14 | Jobs route handler (mocked DB) |
| `apps/web/app/api/v1/visits/__tests__/visits.unit.test.ts` | 17 | Visits route handler (mocked DB) |
| `services/worker/src/visit-reminder.test.ts` | ~40 | Visit reminder worker logic (mocked DB) |
| `services/worker/src/invoice-followup.test.ts` | ~40 | Invoice followup worker logic (mocked DB) |

**How to run:**
```bash
pnpm test
```

---

## Tier 2 — DB Integration Tests

Require a live PostgreSQL instance with migrations and seed data applied.
Run in CI (postgres service fixture provided). Skip locally when `TEST_DATABASE_URL` is absent.

**Skip pattern used:**
```typescript
describe.skipIf(!process.env.TEST_DATABASE_URL)("My Suite", () => { ... });
// or
const shouldRun = !!process.env.TEST_DATABASE_URL;
describe.skipIf(!shouldRun)("My Suite", () => { ... });
```

| File | Tests | What it covers |
|------|-------|----------------|
| `apps/web/lib/invoices/__tests__/payments.integration.test.ts` | 12 | Payment trigger, invoice status sync via direct DB |
| `services/worker/src/visit-reminder.integration.test.ts` | ~12 | Visit reminder worker: DB fixture → queue → execute |
| `services/worker/src/invoice-followup.integration.test.ts` | ~12 | Invoice followup worker: DB fixture → execute |

**How to run locally:**
```bash
TEST_DATABASE_URL=postgresql://ai_fsm:ai_fsm_dev_password@localhost:55432/ai_fsm pnpm test
```

**How CI provides this:**
The `test` job in `.github/workflows/ci.yml` spins up a `postgres:16` service and sets:
```yaml
TEST_DATABASE_URL: postgresql://test:test@localhost:5432/aifsm_test
DATABASE_URL: postgresql://test:test@localhost:5432/aifsm_test
```
Migrations are applied before tests run.

---

## Tier 3 — HTTP Integration Tests

Require BOTH a live DB and a running Next.js web server. **Not run in CI.**
Skip when either `TEST_DATABASE_URL` or `TEST_BASE_URL` is absent.

**Skip pattern used (standardized):**
```typescript
const RUN_INTEGRATION =
  !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN_INTEGRATION)("My Suite", () => { ... });
```

| File | Tests | Status | What it covers |
|------|-------|--------|----------------|
| `apps/web/lib/estimates/__tests__/estimates.integration.test.ts` | 16 | Implemented | Estimates CRUD, lifecycle transitions, RBAC, immutability |
| `apps/web/lib/invoices/__tests__/invoices.integration.test.ts` | 12 | Implemented | Estimate→invoice conversion, invoice list/detail, transitions |
| `apps/web/lib/auth/__tests__/auth.integration.test.ts` | 8 | **STUB** | Login flow, logout, /me endpoint, rate-limit enforcement |

The auth integration file is a stub — test bodies are not yet implemented.
Tests will be implemented as part of P5-T4 follow-on work.

**How to run locally:**
```bash
# Terminal 1 — start the app
pnpm dev:web

# Terminal 2 — run with both env vars
TEST_DATABASE_URL=postgresql://ai_fsm:ai_fsm_dev_password@localhost:55432/ai_fsm \
TEST_BASE_URL=http://localhost:3000 \
pnpm test
```

**Why not in CI?**
Running `next dev` or `next start` in CI requires building first and then managing a
long-running process, which complicates the CI job. Tier 3 is covered by E2E (Tier 4)
for smoke testing and by Tier 2 for individual service logic. A future CI job can
wire Tier 3 using the pattern:
```yaml
- run: pnpm build && pnpm start &
- run: sleep 5 && TEST_BASE_URL=http://localhost:3000 pnpm test
```

---

## Tier 4 — E2E (Playwright)

Full browser-driven tests. Not part of `pnpm test`. Run with Playwright CLI.
Require a running dev/prod server with seeded DB.

| File | What it covers |
|------|----------------|
| `tests/e2e/admin-smoke.spec.ts` | Admin role: jobs, visits, estimates |
| `tests/e2e/tech-smoke.spec.ts` | Tech role: visit list, update, complete |
| `tests/e2e/estimates-smoke.spec.ts` | Estimate create → send → approve flow |
| `tests/e2e/invoice-convert-smoke.spec.ts` | Approve estimate → convert → invoice |
| `tests/e2e/payment-smoke.spec.ts` | Record payment, verify invoice status |
| `tests/e2e/visit-reminder-smoke.spec.ts` | Automation: visit reminder |
| `tests/e2e/invoice-followup-smoke.spec.ts` | Automation: invoice followup |

**How to run locally:**
```bash
# Start the app first
pnpm dev:web

# In another terminal
TEST_BASE_URL=http://localhost:3000 pnpm exec playwright test
```

**CI integration (future — P5-T2 follow-up):**
Add a separate `e2e` CI job triggered only on `main` and release branches:
```yaml
e2e:
  needs: [build]
  env:
    TEST_BASE_URL: http://localhost:3000
  steps:
    - run: pnpm build && pnpm start &
    - run: sleep 5 && pnpm exec playwright test
```

---

## CI Skip Inventory

Skips in CI are intentional. This table documents every expected skip.

| Suite | Skip count in CI | Reason |
|-------|-----------------|--------|
| `auth.integration.test.ts` | 8 | Tier 3: TEST_BASE_URL absent in CI |
| `estimates.integration.test.ts` | 16 | Tier 3: TEST_BASE_URL absent in CI |
| `invoices.integration.test.ts` | 12 | Tier 3: TEST_BASE_URL absent in CI |
| `payments.integration.test.ts` | 1 | Sentinel skip (confirms guard works when DB absent locally) |
| Playwright E2E | not in test job | Tier 4: not wired to `pnpm test` |

**Expected CI output:**
```
Tests  ~200 passed | ~40 skipped
```

Any test skip NOT in the table above is unexpected and must be investigated.

---

## Adding New Tests

### Unit test
Place in `**/__tests__/*.unit.test.ts` or `**/*.test.ts`. No guard needed.

### DB integration test
Place in `**/__tests__/*.integration.test.ts`. Add:
```typescript
describe.skipIf(!process.env.TEST_DATABASE_URL)("Suite name", () => { ... });
```

### HTTP integration test
Place in `**/__tests__/*.integration.test.ts`. Add:
```typescript
const RUN_INTEGRATION =
  !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;
describe.skipIf(!RUN_INTEGRATION)("Suite name", () => { ... });
```
Update the HTTP integration table in this document.

### E2E test
Place in `tests/e2e/*.spec.ts`. Uses Playwright. Update the E2E table.
