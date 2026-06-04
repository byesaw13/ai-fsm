# Client 360 Hardening Report

## Summary

Six correctness, performance, and UX bugs were found and fixed in the Client 360
implementation. 31 unit tests were added. One DB index was added and applied.

---

## 1. Query Correctness Findings

### BUG 1 (Critical) — Active Work query used pipeline stage names as DB status values

**File:** `apps/web/app/app/clients/[id]/page.tsx`

The DB `jobs.status` CHECK constraint accepts only:
`draft | quoted | scheduled | in_progress | completed | invoiced | cancelled`

Pipeline stage names (`new_lead`, `estimate_needed`, `estimate_sent`, `approved_ready`,
`waiting`, `archived`) are **derived** by `derivePipelineStage()` in `packages/domain` — they
are never written to the database.

The original Active Work query had:
```sql
AND j.status IN ('new_lead','estimate_needed','estimate_sent',
                 'approved_ready','scheduled','in_progress','waiting')
```

This would silently drop `draft` and `quoted` jobs. Only `scheduled` and `in_progress` from
that list actually matched real data. New leads and jobs with sent estimates were invisible.

**Fixed to:**
```sql
AND j.status NOT IN ('completed','invoiced','cancelled')
```

The ORDER BY CASE was corrected to match real DB status values:
```sql
ORDER BY CASE j.status
  WHEN 'in_progress' THEN 1
  WHEN 'scheduled'   THEN 2
  WHEN 'quoted'      THEN 3
  WHEN 'draft'       THEN 4
  ELSE 5
END, j.created_at DESC
```

### BUG 2 (Correctness) — Property open_job_count excluded 'archived' instead of 'cancelled'

**File:** `apps/web/app/app/clients/[id]/page.tsx`

Original:
```sql
AND j.status NOT IN ('archived','completed','invoiced')
```

`archived` is a pipeline label for the `cancelled` DB status. This meant cancelled jobs were
counted as open. Fixed to:
```sql
AND j.status NOT IN ('cancelled','completed','invoiced')
```

### BUG 3 (Correctness) — activeJobStatusColor mapped non-existent DB status names

The function previously mapped `waiting` → amber and `approved_ready` → green. Neither exists
in the DB — these are pipeline-only labels. The amber/green colors were unreachable.

**Fixed:** `waiting` and `approved_ready` removed; `quoted` → amber added (this is the real DB
status for "estimate sent, awaiting client approval").

```typescript
export function activeJobStatusColor(status: string): string {
  switch (status) {
    case "in_progress": return "#0284c7"; // blue
    case "scheduled":   return "#0284c7"; // blue
    case "quoted":      return "#d97706"; // amber — estimate sent
    case "draft":       return "#6b7280"; // muted
    default:            return "#6b7280";
  }
}
```

### Verified correct — Next-visit subquery

The LATERAL subquery correctly uses `status NOT IN ('completed','cancelled')` and
`ORDER BY scheduled_start ASC NULLS LAST` — earliest upcoming non-completed visit wins.

### Verified correct — Last service date

Uses `v.status = 'completed'` which is the correct DB visit status for a finished visit.
`arrived` and `in_progress` are excluded (they are still active).

### Verified correct — Activity timeline deduplication

UNION ALL is used across four distinct tables (visits, estimates, invoices,
communications_log). Each arm selects from a single table by unique ID. Cross-table UUID
collisions are theoretically possible but astronomically unlikely and are not an operational
concern. No duplicate-prone joins exist.

### Fixed — Activity timeline React key collision

Changed from `key={event.id}` to `key={`${event.event_type}-${event.id}`}` for
correctness across multiple entity types in the same list.

### Verified correct — Activity event links

| Event type    | Links to              |
|---------------|-----------------------|
| visit         | /app/visits/:link_id  |
| estimate      | /app/estimates/:link_id |
| invoice       | /app/invoices/:link_id |
| communication | null (no detail page) |

---

## 2. Multi-Property Behavior

### BUG 4 — Active Work showed no property context

A client with two properties could not tell which active job belonged to which address.

**Fixed:** Added `property_id` and `property_address` (via LEFT JOIN properties) to the
Active Work query. Each active job card now shows "· 123 Main St" in its meta line.

### BUG 5 — Activity Timeline had no property context

Timeline events showed job title only. For multi-property clients this is ambiguous.

**Fixed:** Added `property_address` to the `ActivityEvent` type and to each arm of the
UNION query (via LEFT JOIN properties on `COALESCE(entity.property_id, job.property_id)`).
Communication events set `NULL::text` — they are client-level and have no property.
The timeline component shows "· address" inline when present.

### Verified correct — Property card enrichment

Each property card shows:
- Formatted address
- "N open jobs" in blue (when > 0) — uses the corrected `cancelled` exclusion
- "Last serviced date" or "Never serviced" — uses `v.status = 'completed'` correctly

---

## 3. Empty States

| Section              | Empty state behavior                                      | Correct? |
|----------------------|-----------------------------------------------------------|----------|
| Active Work          | Section omitted entirely (`activeJobs.length > 0 &&`)    | ✓        |
| Properties           | `<EmptyState>` rendered with create-property prompt       | ✓        |
| Activity timeline    | Inline "No activity recorded" text in the component       | ✓        |
| Estimates            | `<EmptyState>` rendered                                   | ✓        |
| Invoices             | `<EmptyState>` rendered                                   | ✓        |
| Documents & Photos   | Section omitted entirely (`vaultItems.length > 0 &&`)     | ✓        |

All empty states are handled. Omitting the Active Work and Documents sections when empty
is the right call — "no active work" is the normal quiet state, not an error.

---

## 4. Performance

### DB Round Trips

| Round | Queries | Notes |
|-------|---------|-------|
| 1     | 1 (client summary) | Sequential — auth gating requires client before proceeding |
| 2     | 7 (Promise.all) | properties, activeJobs, activityEvents, finance, estimates, invoices, vaultItems |
| **Total** | **8 queries, 2 round trips** | |

This is excellent. The page stays in two sequential database hops regardless of client history size.

### Correlated Subqueries (property enrichment)

Each property card runs two correlated subqueries:
1. `SELECT COUNT(*) FROM jobs WHERE property_id = p.id ...`
2. `SELECT MAX(v.completed_at) FROM visits v JOIN jobs ... WHERE property_id = p.id ...`

**Missing index found:** No index existed on `jobs(property_id)`. Without it, both subqueries
scanned all jobs in the account to find those belonging to a property.

**Fixed:** Added migration `102_client_360_indexes.sql`:
```sql
CREATE INDEX IF NOT EXISTS idx_jobs_property ON jobs(property_id)
  WHERE property_id IS NOT NULL;
```
Index applied to dev DB. Will run at next production migration.

### Activity Timeline UNION Coverage

All four UNION arms are covered by existing indexes:
- visits: `idx_visits_job ON visits(job_id)` + jobs looked up via `idx_jobs_client`
- estimates: `idx_estimates_client ON estimates(client_id)` ✓
- invoices: `idx_invoices_client ON invoices(client_id)` ✓
- communications_log: `comms_log_client ON communications_log(client_id, created_at DESC)` ✓

The property LEFT JOINs in the UNION arms join on `properties.id` (primary key — always O(1)).

### Should this page use a read model eventually?

Not yet. At the current scale (1 business, <100 clients, <500 jobs), the eight-query pattern
with parallel Promise.all is fast and maintainable. The `property_timeline_v` view already
demonstrates the read-model pattern for property history — if the client page response time
degrades past ~200ms in production, a `client_summary_v` view that materializes counts and
last-service dates per property would be the natural next step.

---

## 5. UX Verification

Does the page answer each operational question quickly?

| Question | Answer visible where? | Assessment |
|----------|-----------------------|------------|
| What needs attention? | Open-work banner (overdue invoices, sent estimates) + Active Work section | ✓ |
| Which property is involved? | Active Work: "· address" on each job; Timeline: "· address" on each event | ✓ (fixed) |
| What happened recently? | Unified Activity Timeline — visits, estimates, invoices, messages in one stream | ✓ |
| What has this client spent? | MetricGrid — Lifetime value (paid), Invoices total | ✓ |
| What documents/photos exist? | Documents & Photos section (vault items by category + photo count) | ✓ |

---

## 6. Tests Added

**File:** `apps/web/app/app/clients/[id]/__tests__/client360.unit.test.ts`

31 unit tests across 8 suites:

| Suite | Tests | Covers |
|-------|-------|--------|
| ACTIVE_JOB_STATUSES_EXCLUDED | 4 | Terminal status set, 'cancelled' vs 'archived' regression guard |
| activeJobStatusColor | 7 | All real DB statuses, pipeline-name regression guard |
| dollars | 4 | Currency formatting edge cases |
| eventHref | 6 | All event types, null link_id cases |
| formatEventDate | 2 | Date string output shape |
| formatEventCents | 4 | Cents-to-dollar formatting |
| Multi-property scenario guards | 3 | ActiveJobRow and ActivityEvent field shape contracts |
| Empty state scenarios | 3 | Guard conditions for optional sections |

All 655 existing tests continue to pass. Total: 686 tests.

---

## Integration Test Gap

The following scenarios require `TEST_DATABASE_URL` to test properly and are documented
here as the integration test backlog:

- Client with one property — verifies correlated subqueries return correct single-row data
- Client with multiple properties — verifies open_job_count is per-property, not total
- Client with active jobs of each real DB status — verifies all four statuses appear in Active Work
- Client with no activity — verifies timeline empty state
- Client with vault items on multiple properties — verifies photo_count aggregation is correct
- Client with mixed events — verifies UNION timeline ordering, no duplicates, correct links

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/app/app/clients/[id]/page.tsx` | Fix 5 query bugs; import helpers; add property context to render |
| `apps/web/app/app/clients/[id]/ClientActivityTimeline.tsx` | Add `property_address` field; fix React key; export pure functions |
| `apps/web/app/app/clients/[id]/client360-helpers.ts` | **New** — extracted pure functions for testability |
| `apps/web/app/app/clients/[id]/__tests__/client360.unit.test.ts` | **New** — 31 unit tests |
| `db/migrations/102_client_360_indexes.sql` | **New** — `idx_jobs_property` index |
