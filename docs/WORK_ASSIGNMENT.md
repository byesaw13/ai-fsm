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
| `agent-orchestrator` | `T1-2` / `P2-T1` | `agent-orchestrator/P2-T1-jobs-crud` | `apps/web/app/api/v1/jobs/**` | `2026-02-17T16:00:00Z` | `in_progress` |
| `agent-c` | `P2-T3` / `#16` | `agent-c/P2-T3-role-based-admin-tech-views` | `apps/web/app/app/jobs/**`, `apps/web/app/app/visits/**`, `apps/web/lib/auth/permissions.ts`, `apps/web/lib/auth/__tests__/**`, `tests/e2e/**` | `2026-02-17T22:00:00Z` | `in_progress` |
| `agent-orchestrator` | `P5-T1` | `agent-orchestrator/P5-T1-security-hardening` | `apps/web/lib/auth/**`, `apps/web/lib/env.ts`, `apps/web/lib/rate-limit.ts`, `apps/web/middleware.ts`, `docs/DECISION_LOG.md` | `2026-02-19T00:00:00Z` | `completed` |
| `agent-orchestrator` | `P5-T2` | `agent-orchestrator/P5-T2-ci-governance` | `.github/workflows/ci.yml`, `docs/CI_GOVERNANCE.md` | `2026-02-19T01:00:00Z` | `completed` |
| `agent-orchestrator` | `P5-T3` | `agent-orchestrator/P5-T3-observability` | `apps/web/lib/logger.ts`, `apps/web/app/api/health/route.ts`, `services/worker/src/logger.ts`, all API route console replacements, `docs/BACKUP_RUNBOOK.md`, `docs/INCIDENT_RESPONSE_RUNBOOK.md` | `2026-02-19T02:00:00Z` | `in_progress` |
| `agent-orchestrator` | `P5-T5` | `agent-orchestrator/P5-T5-ux-stabilization` | `apps/web/app/app/jobs/**`, `apps/web/app/app/visits/**`, `apps/web/app/app/estimates/**`, `apps/web/app/app/invoices/**` | `2026-02-19T04:00:00Z` | `completed` |
| `agent-orchestrator` | `P5-T6` | `agent-orchestrator/P5-T6-release-readiness-docs` | `docs/PROD_READINESS_CHECKLIST.md`, `docs/DEPLOYMENT_RUNBOOK.md`, `docs/INCIDENT_RESPONSE.md`, `docs/PHASED_BACKLOG.yaml`, `docs/WORK_ASSIGNMENT.md`, `docs/CHANGELOG_AI.md`, `docs/DECISION_LOG.md` | `2026-02-19T06:00:00Z` | `completed` |
| `agent-orchestrator` | `P6-T1A` | `agent-orchestrator/P6-T1-frontend-productization` | `docs/UX_GAP_REPORT.md`, `docs/PHASED_BACKLOG.yaml`, `apps/web/app/app/layout.tsx`, `apps/web/app/globals.css`, `apps/web/app/page.tsx` | `2026-02-19T21:00:00Z` | `in_progress` |

## Merge Order
1. Foundation/auth changes
2. Jobs/visits
3. Estimates/invoices
4. Automations/worker
5. Shared-file reconciliation PR
