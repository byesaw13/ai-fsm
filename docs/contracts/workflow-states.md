# Workflow States Contract (FROZEN)

> Status: **FROZEN** as of 2026-02-16 — P0-T1
> Any changes require ADR entry in `docs/DECISION_LOG.md` and orchestrator approval.

## Source Evidence

- **Myprogram**: `supabase/migrations/003_workflow_invariants.sql` — DB-enforced transition validation functions
- **Dovelite**: `db/001_initial_schema.sql` — Visit status CHECK constraints; `lib/types/visits.ts` — TypeScript visit status types
- **Adopted**: Visit `arrived` state from both repos; immutability enforcement pattern from Myprogram; job lifecycle from ai-fsm scaffold (broader than either source since neither has full job→invoiced flow)
- **Intentional divergences**: ai-fsm adds `quoted` and `invoiced` job statuses not present in either source; `void` invoice status instead of `voided`/`written_off` (simpler); no `accepted`/`rejected` rename — kept `approved`/`declined` for clarity

## Job Lifecycle

```
draft → quoted → scheduled → in_progress → completed → invoiced
```

| From | Allowed Targets |
|------|----------------|
| draft | quoted, scheduled |
| quoted | scheduled, draft |
| scheduled | in_progress, cancelled |
| in_progress | completed, cancelled |
| completed | invoiced |
| invoiced | (terminal) |
| cancelled | draft |

**Rules**:
- `draft → scheduled` allowed (skip quoting for simple jobs)
- `quoted → draft` allowed (revert to edit)
- `cancelled` is a valid status from `scheduled` or `in_progress`
- `cancelled → draft` allowed (re-open a cancelled job)
- `invoiced` is terminal — only reachable after invoice is linked

## Visit Lifecycle

```
scheduled → arrived → in_progress → completed
                                  → cancelled (from scheduled or arrived)
```

| From | Allowed Targets |
|------|----------------|
| scheduled | arrived, cancelled |
| arrived | in_progress, cancelled |
| in_progress | completed |
| completed | (terminal) |
| cancelled | (terminal) |

**Rules**:
- `arrived_at` is auto-set on transition to `arrived`
- `completed_at` is auto-set on transition to `completed`
- `cancelled` only from `scheduled` or `arrived` (not from `in_progress`)
- A visit must have `assigned_user_id` set before transitioning to `arrived`

## Estimate Lifecycle

```
draft → sent → approved | declined | expired
```

| From | Allowed Targets |
|------|----------------|
| draft | sent |
| sent | approved, declined, expired |
| approved | (terminal — triggers invoice conversion) |
| declined | (terminal) |
| expired | (terminal) |

**Immutability Rules** (enforced at DB layer):
- `draft`: All fields editable, line items can be added/removed
- `sent`: Only `internal_notes` editable. `sent_at` auto-set.
- `approved`/`declined`/`expired`: Fully immutable

**Expiry**: If `expires_at` is set and `now() > expires_at`, worker transitions `sent → expired`.

## Invoice Lifecycle

```
draft → sent → partial | paid | overdue | void
```

| From | Allowed Targets |
|------|----------------|
| draft | sent, void |
| sent | partial, paid, overdue, void |
| partial | paid, overdue, void |
| overdue | partial, paid, void |
| paid | (terminal) |
| void | (terminal) |

**Immutability Rules**:
- `draft`: All fields editable, line items can be added/removed
- `sent`: Only `paid_cents` updated (via payment recording). `sent_at` auto-set.
- `partial`/`overdue`: Only `paid_cents` updated via payments
- `paid`/`void`: Fully immutable

**Auto-transitions**:
- Recording a payment recalculates `paid_cents`. If `paid_cents >= total_cents`, status → `paid`. If `0 < paid_cents < total_cents`, status → `partial`.
- Worker checks `due_date`: if `now() > due_date` and status is `sent` or `partial`, transition → `overdue`.

## Automation Types

| Type | Trigger | Action |
|------|---------|--------|
| visit_reminder | `config.hours_before` hours before `visit.scheduled_start` | Generate reminder event |
| invoice_followup | `config.days_overdue` days after `invoice.due_date` when status is `overdue` | Generate follow-up event |

## Roles

| Role | Scope |
|------|-------|
| owner | Full access. One per account. Can manage users and account settings. |
| admin | Full operational access. Cannot delete account or manage owner. |
| tech | Read jobs/visits assigned to them. Update visit status and notes. Read-only for estimates/invoices. |
