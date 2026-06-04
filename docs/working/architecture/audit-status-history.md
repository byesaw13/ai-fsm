# Audit Log and Status History Alignment

Item 8 of the domain simplification plan.

## The Problem

Two tables record entity history:

| Table | Purpose | Current use |
|---|---|---|
| `audit_log` | Broad system/user action tracking | Written by maintenance worker, manual places |
| `status_history` | Lifecycle/status change tracking | Written by some transition routes |

These can diverge: a status change might write to `status_history` but not
`audit_log`, or vice versa. A timeline built from either alone will be incomplete.

## Event Ownership Rules

### Write to `status_history` when:
- A `jobs.status` changes (draft → quoted, scheduled → in_progress, etc.)
- A `visits.status` changes (scheduled → in_progress → completed, etc.)
- A `estimates.status` changes (draft → sent → approved, etc.)
- A `invoices.status` changes (draft → sent → paid, etc.)
- A `maintenance_plans.status` changes (active → paused → cancelled)
- A `booking_requests.status` changes

`status_history` is the source for status timeline UI. Keep it narrow: entity
type, entity id, old status, new status, changed_by, changed_at.

### Write to `audit_log` when:
- A destructive action occurs (delete, hard cancel, override)
- An automated system action occurs (worker generates visit, auto-advances plan date)
- A privileged action occurs (admin reassigns, impersonates, exports data)
- A change requires a paper trail for business/compliance reasons

`audit_log` is broader. It records who did what, when, with old/new values as JSON.

### Do NOT write to both for the same event:
- Status changes: write `status_history` only. `audit_log` is for non-status actions.
- Exception: destructive status changes (cancel, void) may write both to capture the why.

## Duplicate Prevention Strategy

Centralize status writes through helper functions:

```typescript
// lib/status-history.ts
export async function recordStatusChange(
  client: PoolClient,
  entity: { type: string; id: string; accountId: string },
  oldStatus: string,
  newStatus: string,
  changedBy: string
) {
  await client.query(
    `INSERT INTO status_history (account_id, entity_type, entity_id, old_status, new_status, changed_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entity.accountId, entity.type, entity.id, oldStatus, newStatus, changedBy]
  );
}
```

All transition routes call this helper — never inline the INSERT.

## Current State Audit

| Transition route | Writes status_history? | Writes audit_log? |
|---|---|---|
| `visits/[id]/transition` | Unknown — needs audit | Unknown |
| `jobs/[id]/transition` | Unknown — needs audit | Unknown |
| `estimates/[id]/transition` | Unknown — needs audit | Unknown |
| `invoices/[id]/transition` | Unknown — needs audit | Unknown |
| Maintenance worker | No | Yes |
| `booking-requests/[id]/convert` | Unknown — needs audit | Unknown |

## Test Cases

When this is implemented, tests should verify:

1. A job status transition writes exactly one `status_history` row with correct old/new values.
2. A worker-generated visit writes to `audit_log` with actor = account owner.
3. A cancelled job writes to `status_history` (status change) and optionally `audit_log` (destructive).
4. Double-writing does NOT occur — the helper is called once, not duplicated in each route.

## What to Do Now

This is technical debt, not a breaking issue. The priority is:

1. Audit each transition route to confirm `status_history` is written.
2. Create the `recordStatusChange` helper and refactor routes to use it.
3. Add a test that fires each transition and asserts the `status_history` row.

This work can happen independently of all other domain simplification items.
