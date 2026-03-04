# Multi-Agent Work Assignment

This document coordinates parallel AI execution.

## Agent IDs
- `agent-orchestrator`
- `agent-a`
- `agent-b`
- `agent-c`
- `agent-d`

## Branch Naming Convention
- Format: `<agent-id>/<task-id>-<short-slug>`
- Example: `agent-a/T1-2-jobs-crud`

## Task Claiming Protocol
1. Agent selects one `pending` task in `docs/PHASED_BACKLOG.yaml`.
2. Agent writes claim in this file under `Active Claims`.
3. Agent creates branch with required naming.
4. Agent only edits files in its allowed ownership domain.
5. Agent runs quality gates and records results in `docs/CHANGELOG_AI.md`.
6. Agent marks task `completed` or `blocked` in `docs/PHASED_BACKLOG.yaml`.

## File Ownership Domains

### `agent-a` (Auth + Access)
- `apps/web/app/(auth)/**`
- `apps/web/lib/auth/**`
- `packages/domain/src/index.ts` (auth-related sections only)
- `db/migrations/*auth*.sql`

### `agent-b` (Jobs + Visits)
- `apps/web/app/app/jobs/**`
- `apps/web/app/app/visits/**`
- `apps/web/lib/jobs/**`
- `apps/web/lib/visits/**`
- `db/migrations/*jobs*.sql`
- `db/migrations/*visits*.sql`

### `agent-c` (Estimates + Invoices + Payments)
- `apps/web/app/app/estimates/**`
- `apps/web/app/app/invoices/**`
- `apps/web/lib/estimates/**`
- `apps/web/lib/invoices/**`
- `db/migrations/*estimate*.sql`
- `db/migrations/*invoice*.sql`
- `db/migrations/*payment*.sql`

### `agent-d` (Automations + Worker + Infra)
- `apps/web/app/app/automations/**`
- `services/worker/**`
- `infra/**`
- `scripts/**`
- `db/migrations/*automation*.sql`

## Shared Files (Lock Required)
These files require explicit lock entry in `Active Claims` before edits:
- `docs/PHASED_BACKLOG.yaml`
- `packages/domain/src/index.ts`
- `README.md`
- `AGENTS.md`
- `docs/ARCHITECTURE.md`

## Active Claims

| Agent | Task ID | Branch | File Scope | Claimed At (UTC) | Status |
|---|---|---|---|---|---|
| `agent-orchestrator` | `orchestration-wave-1` | `orchestrator/start-process-wave1` | `docs/WORK_ASSIGNMENT.md`, `docs/CHANGELOG_AI.md` | `2026-02-16T17:45:00Z` | `completed` |
| `agent-orchestrator` | `P0-T1` / `#7` | `orchestrator/start-process-wave1` | `docs/contracts/domain-model.md`, `docs/contracts/workflow-states.md`, `packages/domain/src/index.ts`, `db/migrations/001_core_schema.sql` | `2026-02-16T20:00:00Z` | `completed` |
| `agent-orchestrator` | `P0-T2` / `#8` | `orchestrator/start-process-wave1` | `docs/contracts/api-contract.md` | `2026-02-16T20:00:00Z` | `completed` |
| `agent-orchestrator` | `P0-T3` / `#9` | `orchestrator/start-process-wave1` | `docs/contracts/test-strategy.md` | `2026-02-16T20:00:00Z` | `completed` |
| `agent-b` | `P1-T2` | `agent-b/P1-T2-rls-migrations` | `db/migrations/003_rls_policies.sql`, `db/migrations/004_workflow_invariants.sql` | `2026-02-17T00:00:00Z` | `completed` |
| `agent-orchestrator` | `P1-T3` | `agent-orchestrator/P1-T3-audit-trace` | `apps/web/lib/tracing.ts`, `apps/web/lib/db/audit.ts`, `apps/web/lib/auth/middleware.ts`, `db/migrations/005_audit_log_trace_id.sql`, vitest configs, test files | `2026-02-17T10:30:00Z` | `completed` |
| `agent-d` | `P1-T4` | `agent-d/P1-T4-ci-pipeline` | `.github/workflows/ci.yml` | `2026-02-16T14:14:00Z` | `completed` |
| `agent-c` | `P2-T3` / `#16` | `agent-c/P2-T3-role-based-admin-tech-views` | `apps/web/app/app/jobs/**`, `apps/web/app/app/visits/**`, `apps/web/lib/auth/permissions.ts`, `apps/web/lib/auth/__tests__/**`, `tests/e2e/**` | `2026-02-17T22:00:00Z` | `completed` |
| `agent-orchestrator` | `P5-T1` | `agent-orchestrator/P5-T1-security-hardening` | `apps/web/lib/auth/**`, `apps/web/lib/env.ts`, `apps/web/lib/rate-limit.ts`, `apps/web/middleware.ts`, `docs/DECISION_LOG.md` | `2026-02-19T00:00:00Z` | `completed` |
| `agent-orchestrator` | `P5-T2` | `agent-orchestrator/P5-T2-ci-governance` | `.github/workflows/ci.yml`, `docs/CI_GOVERNANCE.md` | `2026-02-19T01:00:00Z` | `completed` |
| `agent-orchestrator` | `P5-T3` | `agent-orchestrator/P5-T3-observability` | `apps/web/lib/logger.ts`, `apps/web/app/api/health/route.ts`, `services/worker/src/logger.ts`, `docs/BACKUP_RUNBOOK.md`, `docs/PROD_READINESS_CHECKLIST.md`, `docs/DEPLOYMENT_RUNBOOK.md` | `2026-02-19T02:00:00Z` | `completed` |
| `agent-orchestrator` | `P6-T3` | `agent-orchestrator/P6-T3-automations-ops-ux` | `apps/web/app/app/automations/**`, `apps/web/app/api/v1/automations/**`, `apps/web/app/globals.css`, `tests/e2e/automations-smoke.spec.ts`, `docs/PHASED_BACKLOG.yaml`, `docs/WORK_ASSIGNMENT.md`, `docs/CHANGELOG_AI.md` | `2026-02-20T22:00:00Z` | `completed` |
| `agent-orchestrator` | `P7-T0` | `agent-orchestrator/P7-T0-ux-spec-freeze` | `docs/ux/P7_UX_SPEC.md`, `docs/ux/P7_SCREEN_MAP.md`, `docs/ux/P7_INTERACTION_PATTERNS.md`, `docs/PHASED_BACKLOG.yaml`, `docs/WORK_ASSIGNMENT.md`, `docs/CHANGELOG_AI.md` | `2026-02-23T00:00:00Z` | `completed` |
| `agent-orchestrator` | `P7-T1` | `agent-orchestrator/P7-T1-design-system-shell` | `apps/web/app/globals.css`, `apps/web/app/styles/**`, `apps/web/components/ui/**`, `apps/web/components/AppShell.tsx`, `apps/web/app/app/layout.tsx`, `docs/PHASED_BACKLOG.yaml`, `docs/WORK_ASSIGNMENT.md`, `docs/CHANGELOG_AI.md` | `2026-02-23T01:00:00Z` | `completed` |

| `agent-orchestrator` | `P7-T2` | `agent-orchestrator/P7-T2-jobs-visits-rewrite` | `apps/web/app/app/jobs/**`, `apps/web/app/app/visits/**`, `docs/PHASED_BACKLOG.yaml`, `docs/WORK_ASSIGNMENT.md`, `docs/CHANGELOG_AI.md` | `2026-02-23T03:00:00Z` | `completed` |
| `agent-orchestrator` | `P7-T2.5` | `agent-orchestrator/P7-T2.5-clients-properties-workspace` | `apps/web/app/app/clients/**`, `apps/web/app/app/properties/**`, `apps/web/app/api/v1/clients/**`, `apps/web/app/api/v1/properties/**`, `apps/web/app/app/jobs/new/**`, `docs/PHASED_BACKLOG.yaml`, `docs/WORK_ASSIGNMENT.md`, `docs/CHANGELOG_AI.md` | `2026-02-23T18:20:00Z` | `completed` |
| `agent-orchestrator` | `P7-T2.6` | `agent-orchestrator/P7-T2.6-dashboard-onboarding-client-address` | `apps/web/app/app/page.tsx`, `apps/web/app/app/jobs/page.tsx`, `apps/web/app/app/clients/**`, `apps/web/app/api/v1/clients/**`, `packages/domain/src/index.ts`, `db/migrations/006_client_address.sql`, `docs/PHASED_BACKLOG.yaml`, `docs/WORK_ASSIGNMENT.md`, `docs/CHANGELOG_AI.md` | `2026-02-23T20:25:00Z` | `completed` |
| `deploy-sre` | `infra/garonhome-primary` | `deploy-sre/infra-garonhome-primary` | `docs/DEPLOYMENT_RUNBOOK.md`, `docs/GARONHOME_DEPLOYMENT.md`, `docs/PI4_DEPLOYMENT.md`, `docs/agents/deploy-sre.md`, `docs/skills/ai-fsm-garonhome-deploy.md`, `docs/DECISION_LOG.md`, `docs/CHANGELOG_AI.md`, `docs/WORK_ASSIGNMENT.md` | `2026-03-02T00:00:00Z` | `completed` |
| `product-engineer` | `P8-T1` | `product-engineer/P8-T1-expense-ledger-clean` | `packages/domain/src/index.ts`, `apps/web/lib/auth/permissions.ts`, `apps/web/components/AppShell.tsx`, `apps/web/lib/expenses/math.ts`, `apps/web/lib/expenses/db.ts`, `apps/web/lib/expenses/__tests__/expenses.unit.test.ts`, `db/migrations/007_expenses.sql`, `apps/web/components/ui/__tests__/design-system.unit.test.ts`, `docs/PHASED_BACKLOG.yaml`, `docs/WORK_ASSIGNMENT.md`, `docs/CHANGELOG_AI.md` | `2026-03-02T03:00:00Z` | `completed` |
| `product-engineer` | `P8-T2` | `product-engineer/P8-T2-expense-ledger-ui-api` | `apps/web/app/api/v1/expenses/**`, `apps/web/app/app/expenses/**`, `apps/web/lib/expenses/ui.ts`, `apps/web/lib/expenses/__tests__/expense-ui.unit.test.ts`, `docs/PHASED_BACKLOG.yaml`, `docs/WORK_ASSIGNMENT.md`, `docs/CHANGELOG_AI.md` | `2026-03-02T22:00:00Z` | `completed` |

## Merge Order
1. Foundation/auth changes
2. Jobs/visits
3. Estimates/invoices
4. Automations/worker
5. Shared-file reconciliation PR
| `agent-orchestrator` | `P8-T5` | `agent-orchestrator/P8-T5-profitability-dashboard` | `apps/web/app/api/v1/reports/profitability/route.ts`, `apps/web/app/app/reports/page.tsx`, `apps/web/app/app/reports/loading.tsx`, `apps/web/lib/reports/profitability.ts`, `apps/web/lib/reports/__tests__/profitability.unit.test.ts`, `apps/web/lib/reports/__tests__/profitability.integration.test.ts`, `apps/web/lib/auth/permissions.ts`, `apps/web/components/AppShell.tsx`, `apps/web/components/ui/__tests__/design-system.unit.test.ts`, `docs/PHASED_BACKLOG.yaml`, `docs/WORK_ASSIGNMENT.md`, `docs/CHANGELOG_AI.md`, `docs/DECISION_LOG.md` | `2026-03-03T04:00:00Z` | `completed` |
| `agent-orchestrator` | `P8-T6` | `agent-orchestrator/P8-T6-month-end-close` | `db/migrations/009_period_closes.sql`, `packages/domain/src/index.ts`, `apps/web/lib/auth/permissions.ts`, `apps/web/lib/reports/export.ts`, `apps/web/lib/reports/db.ts`, `apps/web/lib/reports/__tests__/export.unit.test.ts`, `apps/web/lib/reports/__tests__/period-closes.integration.test.ts`, `apps/web/app/api/v1/reports/period-closes/route.ts`, `apps/web/app/api/v1/reports/month-end-export/route.ts`, `apps/web/app/app/reports/close/page.tsx`, `apps/web/app/app/reports/close/CloseActions.tsx`, `apps/web/app/app/reports/close/loading.tsx`, `apps/web/app/app/reports/page.tsx`, `docs/PHASED_BACKLOG.yaml`, `docs/WORK_ASSIGNMENT.md`, `docs/CHANGELOG_AI.md`, `docs/DECISION_LOG.md` | `2026-03-04T00:00:00Z` | `completed` |
