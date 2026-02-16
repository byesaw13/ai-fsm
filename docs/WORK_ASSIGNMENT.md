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
| `agent-orchestrator` | `orchestration-wave-1` | `agent-orchestrator/wave1-kickoff` | `docs/WORK_ASSIGNMENT.md`, `docs/CHANGELOG_AI.md` | `2026-02-16T17:45:00Z` | `in-progress` |
| `agent-a` | `P0-T1` / `#7` | `agent-a/P0-T1-domain-workflow-freeze` | `docs/contracts/domain-model.md`, `docs/contracts/workflow-states.md` | `2026-02-16T17:45:00Z` | `ready-to-claim` |
| `agent-b` | `P0-T2` / `#8` | `agent-b/P0-T2-api-contract-freeze` | `docs/contracts/api-contract.md` | `2026-02-16T17:45:00Z` | `ready-to-claim` |
| `agent-c` | `P0-T3` / `#9` | `agent-c/P0-T3-test-strategy-freeze` | `docs/contracts/test-strategy.md` | `2026-02-16T17:45:00Z` | `ready-to-claim` |

## Merge Order
1. Foundation/auth changes
2. Jobs/visits
3. Estimates/invoices
4. Automations/worker
5. Shared-file reconciliation PR
