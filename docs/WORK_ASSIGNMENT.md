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
| `agent-c` | `P2-T3` / `#16` | `agent-c/P2-T3-role-based-admin-tech-views` | `apps/web/app/app/jobs/**`, `apps/web/app/app/visits/**`, `apps/web/lib/auth/permissions.ts`, `apps/web/lib/auth/__tests__/**`, `tests/e2e/**` | `2026-02-17T22:00:00Z` | `in_progress` |
| `agent-c` | `P3-T1` / `#17` | `agent-c/P3-T1-estimates-lifecycle` | `apps/web/app/app/estimates/**`, `apps/web/app/api/v1/estimates/**`, `apps/web/lib/estimates/**`, `tests/e2e/estimates-smoke.spec.ts` | `2026-02-17T23:00:00Z` | `in_progress` |

## Merge Order
1. Foundation/auth changes
2. Jobs/visits
3. Estimates/invoices
4. Automations/worker
5. Shared-file reconciliation PR
