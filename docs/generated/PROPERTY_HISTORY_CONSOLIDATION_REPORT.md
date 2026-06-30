# Property History Consolidation Report

## Goal

Establish exactly one authoritative source for property history ordering and event generation.

## Decision

**Option A selected: enhance `property_timeline_v`.**

The view was already the canonical source for the API route
(`/api/v1/properties/[id]/timeline`) and the portal property page. Extending it with
flat columns allows the staff property page to consume it directly. The alternative
(a new `property_history_v` view) would have created a second authoritative source —
the opposite of the goal.

---

## Gap Report: View vs Inline UNION

### Event type coverage

| Event type | `property_timeline_v` (pre-103) | Inline UNION (page) | After migration 103 |
|---|---|---|---|
| `visit` | ✓ | ✓ | ✓ view |
| `estimate` | ✓ | ✓ | ✓ view |
| `invoice` | ✓ | ✓ | ✓ view |
| `vault_item` | ✓ | ✓ | ✓ view |
| `photo` | ✓ | **missing** | ✓ view — now surfaced |
| `issue` | ✓ | **missing** | ✓ view — now surfaced |
| `note` | ✓ | ✓ | ✓ view |
| `membership` | **missing** | ✓ | ✓ view — added |

**Before consolidation:** 2 sources, 2 gaps each, total 4 discrepancies.  
**After consolidation:** 1 source, 0 gaps.

### Field differences (resolved by flat columns)

| Field | View (pre-103) | Inline | After migration 103 |
|-------|----------------|--------|---------------------|
| `link_id` | missing (only entity_id) | ✓ flat | ✓ added to view |
| `detail` | in jsonb `metadata` only | ✓ flat | ✓ added to view |
| `total_cents` | in jsonb `metadata` only | ✓ flat | ✓ added to view |

### Label differences (resolved)

| Event type | View (pre-103) | Inline | After migration 103 |
|---|---|---|---|
| Estimate label | `'Estimate'` (hardcoded) | `COALESCE(j.title, 'Estimate')` | ✓ view now uses job title |
| Visit fallback | `'Untitled visit'` | `'Untitled job'` | ✓ standardized to `'Untitled visit'` |

### Ordering

Both sources use `ORDER BY occurred_at DESC NULLS LAST`. No difference.

---

## Implementation

### Migration 103

**File:** `db/migrations/103_property_timeline_flat_columns.sql`

`CREATE OR REPLACE VIEW property_timeline_v` — additive changes only:

1. Added 3 flat columns at the end (preserves existing column positions):
   - `link_id text` — entity ID for navigable types; NULL for vault_item, photo, issue, note
   - `detail text` — status/category/source for display
   - `total_cents int` — financial amount; NULL for non-financial types

2. Added `membership` event arm from `maintenance_plans WHERE property_id IS NOT NULL`

3. Estimates arm updated with `LEFT JOIN jobs j ON j.id = e.job_id` for richer label

4. Applied to dev DB: `CREATE VIEW` confirmed.

### page.tsx change

The 50-line, 6-arm inline UNION was replaced with:

```sql
SELECT event_type,
       entity_id::text       AS id,
       occurred_at           AS ts,
       summary               AS label,
       COALESCE(detail, '')  AS detail,
       link_id,
       total_cents
FROM property_timeline_v
WHERE account_id = $2
  AND property_id = $1
ORDER BY occurred_at DESC NULLS LAST
LIMIT 60
```

---

## Code Removed

### From `apps/web/app/app/properties/[id]/page.tsx`

Removed 50 lines of inline UNION SQL (6 arms × ~8 lines each):

```sql
-- REMOVED:
SELECT event_type, id, ts, label, detail, link_id, total_cents FROM (
  SELECT 'visit'::text AS event_type, v.id::text AS id, ...   -- 8 lines
  UNION ALL
  SELECT 'estimate'::text, e.id::text, ...                    -- 7 lines
  UNION ALL
  SELECT 'invoice'::text, i.id::text, ...                     -- 6 lines
  UNION ALL
  SELECT 'vault_item'::text, pvi.id::text, ...                -- 5 lines
  UNION ALL
  SELECT 'membership'::text, mp.id::text, ...                 -- 4 lines
  UNION ALL
  SELECT 'note'::text, pn.id::text, ...                       -- 5 lines
) t ORDER BY ts DESC NULLS LAST LIMIT 60
```

Replaced by 10 lines using the view.

---

## Duplicate Queries Removed

| Query | Replaced by |
|-------|-------------|
| Inline `visit` arm | `property_timeline_v` visit arm |
| Inline `estimate` arm | `property_timeline_v` estimate arm |
| Inline `invoice` arm | `property_timeline_v` invoice arm |
| Inline `vault_item` arm | `property_timeline_v` vault_item arm |
| Inline `membership` arm | `property_timeline_v` membership arm (new in view) |
| Inline `note` arm | `property_timeline_v` note arm |

---

## Timeline Event Coverage (Final)

The `property_timeline_v` view is now the single canonical source. All 8 event types:

| Type | Source table | link_id | detail | total_cents |
|------|-------------|---------|--------|-------------|
| `visit` | visits + jobs | entity_id | visit.status | null |
| `estimate` | estimates + jobs | entity_id | estimate.status | estimate.total_cents |
| `invoice` | invoices | entity_id | invoice.status | invoice.total_cents |
| `vault_item` | property_vault_items | null | category | null |
| `photo` | property_vault_item_media | null | photo_role | null |
| `issue` | property_issues | null | issue.status | null |
| `note` | property_notes | null | source | null |
| `membership` | maintenance_plans | entity_id | plan.status | null |

### New events now visible on the property page

Two event types were present in the view but absent from the inline UNION:
- **`photo`** — vault item photos now appear in the timeline at the time they were uploaded
- **`issue`** — recurring issues now appear in the timeline anchored at `first_noted_at`

These are complementary to the Issues Panel (which shows current status + resolve actions).
Issues in the timeline show when a problem was first observed.

---

## Consumers of `property_timeline_v`

| Consumer | Columns used | Impact of migration 103 |
|----------|--------------|------------------------|
| `/api/v1/properties/[id]/timeline/route.ts` | `event_type, entity_id, occurred_at, summary, metadata` | None — new columns not selected |
| `/portal/[clientToken]/property/[propertyId]/page.tsx` | `event_type, occurred_at, summary, metadata->>'status'` | None — new columns not selected |
| `/app/properties/[id]/page.tsx` | All 7 flat columns via view | Now uses view directly |

The migration is non-breaking to all existing consumers.

---

## Performance Impact

### Before
- 1 inline UNION (6 arms) executed per property page load
- View was duplicating the same logic for the API route (2 separate implementations in memory)

### After
- 1 view query per property page load
- View is the single plan compiled once by Postgres, plan-cached, reused by all callers
- No functional performance difference for small datasets; marginal improvement at scale

### Indexes unchanged
The view does not benefit from dedicated indexes — it is a logical UNION over indexed base tables. All underlying queries remain covered by existing indexes:
- `idx_visits_job` → visits join
- `idx_estimates_client` + property_id FK → estimates
- `idx_invoices_client` + property_id FK → invoices
- `ix_vault_items_property` → vault_items
- `idx_vault_item_media_item` → photos
- `idx_property_notes_property` → notes
- `maintenance_plans_account_id_idx` → memberships

---

## Tests Updated

**File:** `apps/web/app/app/properties/[id]/__tests__/property-history.unit.test.ts`

Updated "Timeline event types" test suite:
- Expanded `ALL_QUERY_TYPES` → `VIEW_EVENT_TYPES` (6 → 8 types)
- Added explicit tests for `photo` and `issue` (now surfaced from view)
- Added regression guard: `PropertyTimeline DOT_COLORS` must cover all 8 view event types
- Total test count: 51 (up from 48)

All 706 tests pass.

---

## Remaining Architectural Debt

1. **View is a full-table scan by design.** `property_timeline_v` has no `WHERE` clause
   and is filtered at query time. For a multi-tenant SaaS with large datasets, a
   materialized view refreshed on write would be faster. At current Dovetails scale
   (single account, hundreds of events), this is not a concern.

2. **`photo` events in timeline may be noisy** if a property has many vault item photos.
   Consider adding a `LIMIT` per event type or a user-facing event type filter (already
   supported by the API route via `event_type` query param).

3. **Completion packets not yet in view or timeline.** The `completion_packets` table
   (attached to visits via `visit_id`) holds photo URLs and technician sign-off data.
   These could be added as a `completion` event type anchored at the visit's `completed_at`.
   Deferred — no urgent user need identified.

4. **Client 360 timeline is a separate implementation.** The `ClientActivityTimeline`
   in the Client 360 page uses its own `ActivityEvent` type and UNION query (visits,
   estimates, invoices, communications). It does not use `property_timeline_v` because
   it aggregates across multiple properties by client. The two are intentionally separate:
   one is property-scoped, the other is client-scoped. No consolidation needed.
