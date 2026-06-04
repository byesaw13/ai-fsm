# Property Timeline Read Model

Item 7 of the domain simplification plan.

## Goal

One unified property history view — no new tables, derived from existing sources.

## Event Types and Source Tables

| Event type | Source table | Key fields | Sort key |
|---|---|---|---|
| Visit completed | `visits` | `completed_at`, `status = 'completed'`, `job_id` | `completed_at DESC` |
| Visit scheduled | `visits` | `scheduled_start`, `status = 'scheduled'` | `scheduled_start DESC` |
| Estimate sent | `estimates` | `sent_at`, `status IN ('sent','approved','declined')` | `sent_at DESC` |
| Estimate approved | `estimates` | `approved_at`, `status = 'approved'` | `approved_at DESC` |
| Invoice sent | `invoices` | `sent_at`, `status != 'draft'` | `sent_at DESC` |
| Invoice paid | `invoices` | `paid_at`, `status = 'paid'` | `paid_at DESC` |
| Vault item created | `property_vault_items` | `created_at`, `category`, `label` | `created_at DESC` |
| Checklist completed | `visit_checklist_items` | `completed_at`, `result` | `completed_at DESC` (grouped by visit) |
| Document linked | `document_links` | `created_at`, `label`, `url` | `created_at DESC` |
| Completion packet | `completion_packets` | `created_at` | `created_at DESC` |
| Membership enrolled | `maintenance_plans` | `created_at`, `name`, `status` | `created_at DESC` |

## Timeline Sorting Rules

1. Sort all events by timestamp descending (most recent first).
2. Group events within the same visit together under one visit header.
3. Checklist items are sub-rows under their parent visit — do not surface them as top-level events unless a finding was promoted to vault.
4. Null timestamps sort to bottom.

## UI Grouping Recommendations

```
[2026-05] Visit Completed — Spring HVAC service
  · HVAC filter replaced (checklist item)
  · Dryer vent cleaned (checklist item)
  → Invoice paid $320

[2025-11] Vault — Water heater installed 2019 (Rheem 50gal)

[2025-09] Visit Completed — Fall maintenance
  · Gutters cleaned (checklist item)
  → Invoice paid $180

[2025-06] Membership Enrolled — Essential Plan
```

## Implementation Approach

### Option A: SQL UNION query (recommended for now)

Build a single page-server query using UNION ALL over the relevant tables,
filtered by `property_id`. Return a typed array of timeline events to the
component. No new tables or materialized views needed.

```sql
SELECT 'visit' AS event_type, v.id, v.completed_at AS ts, j.title AS label,
       v.status AS detail
FROM visits v JOIN jobs j ON j.id = v.job_id
WHERE j.property_id = $1

UNION ALL

SELECT 'vault_item', pvi.id, pvi.created_at, pvi.label, pvi.category
FROM property_vault_items pvi
WHERE pvi.property_id = $1

UNION ALL

SELECT 'membership', mp.id, mp.created_at, mp.name, mp.status
FROM maintenance_plans mp
WHERE mp.property_id = $1

ORDER BY ts DESC NULLS LAST
LIMIT 100
```

### Option B: Materialized view (future)

If the property page becomes slow due to many events per property:
- Create `property_timeline_mv` with `REFRESH MATERIALIZED VIEW CONCURRENTLY`
- Refresh on visit completion, invoice payment, vault item creation.
- Adds operational complexity — defer until needed.

## Files to Create

- `apps/web/app/app/properties/[id]/PropertyTimeline.tsx` — client component
  rendering the event list grouped by month.
- Query in `apps/web/app/app/properties/[id]/page.tsx` — add the UNION query
  alongside the existing visit/vault/client queries.

## Current State

The property detail page (`/app/properties/[id]/page.tsx`) already shows:
- Recent visits (from `visits` join `jobs`)
- Vault items (from `property_vault_items`)

A full unified timeline is the natural next step. No schema changes required.
