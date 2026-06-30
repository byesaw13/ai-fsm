# Property History Implementation Report

## Goal

Transform `/app/properties/[id]` into the complete operational record of a property.
The page now answers these questions without navigating to Jobs, Visits, Estimates, or Invoices:

- What has happened to this property? → Property Timeline
- What work is currently active? → Active Work section
- What work has been completed? → Service History section
- What issues have been observed? → Property Health section
- What documents exist? → Documents & Media section
- What photos exist? → Documents & Media section (visit photo counts)
- What should happen next? → Active Work → job cards with next visit date

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/app/app/properties/[id]/page.tsx` | **Comprehensive rewrite** — see Queries section |
| `apps/web/app/app/properties/[id]/PropertyTimeline.tsx` | Fix React key; export `eventHrefFor` for tests |
| `apps/web/app/app/properties/[id]/PropertyServiceHistory.tsx` | **New** — service history component |
| `apps/web/app/app/properties/[id]/property-history-helpers.ts` | **New** — testable pure functions |
| `apps/web/app/app/properties/[id]/__tests__/property-history.unit.test.ts` | **New** — 48 unit tests |

### Unchanged files (still used)
- `PropertyConditionsPanel.tsx` — moved from sidebar into Property Health section
- `PropertyIssuesPanel.tsx` — moved into Property Health section (query fixed)
- `PropertyVaultSection.tsx` — unchanged, still primary vault UI
- `VaultItemPhotoPanel.tsx` — unchanged, used by PropertyVaultSection

---

## Database Objects Used

### Tables queried
| Table | Purpose |
|-------|---------|
| `properties` | Property summary |
| `clients` | Client name + edit form dropdown |
| `jobs` | Active jobs, service history, documents CTE |
| `visits` | Active job next-visit LATERAL, service history LATERAL, visit media |
| `estimates` | Open estimates, timeline, documents CTE |
| `invoices` | Open invoices, service history LATERAL, timeline, documents CTE |
| `maintenance_plans` | Timeline (membership events) |
| `property_vault_items` | Vault section |
| `property_vault_item_media` | Vault photo counts |
| `property_condition_snapshots` | Health section (conditions) |
| `property_issues` | Health section (issues) |
| `property_notes` | Health section (notes) + timeline |
| `document_links` | Documents & Media section |
| `visit_media` | Documents & Media section (photo summary) |

### Views / indexes used
| Object | Notes |
|--------|-------|
| `property_timeline_v` | Exists but not used by page (inline UNION maintained for schema compatibility with flat column types) |
| `idx_jobs_property` | Added in migration 102 — used by service history LATERAL joins |
| `idx_property_notes_property` | Pre-existing — used by property notes query |
| `comms_log_client` | Pre-existing — not used by property page |

---

## Queries Added

### Round 1 (sequential)

**Property summary** — simplified. Removed 5 correlated subqueries. Now just counts jobs and completed visits.

```sql
SELECT p.*, c.name AS client_name,
       COUNT(DISTINCT j.id)::int AS job_count,
       COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'completed')::int AS completed_visit_count
FROM properties p
JOIN clients c ON c.id = p.client_id AND c.account_id = p.account_id
LEFT JOIN jobs j ON j.property_id = p.id AND j.account_id = p.account_id
LEFT JOIN visits v ON v.job_id = j.id AND v.account_id = p.account_id
WHERE p.id = $1 AND p.account_id = $2
GROUP BY p.id, c.name
```

### Round 2 (12 parallel queries)

| Query | Replaces / Adds |
|-------|-----------------|
| clients | Unchanged |
| **activeJobs** | ADDS — replaces count widget; uses LATERAL for next visit; fixed status filter |
| **openEstimates** | ADDS — open estimates for Active Work section |
| **openInvoices** | ADDS — outstanding invoices for Active Work section |
| **serviceHistory** | ADDS — completed/invoiced jobs with LATERAL visit + invoice |
| timelineEvents | ENHANCED — adds `property_notes` UNION arm; limit increased 50→60 |
| **propertyNotes** | ADDS — property notes for Health section (was never shown) |
| **documents** | ADDS — document_links via CTE (property + linked jobs/estimates/invoices) |
| **visitMedia** | ADDS — visit photo summary (was never shown on property page) |
| vaultItems | Unchanged |
| conditions | Unchanged |
| issues | **FIXED** — removed `status IN ('open','monitoring')` filter; now fetches all issues |

---

## Queries Removed

| Query / subquery | Why removed |
|-----------------|-------------|
| `next_visit_at` correlated subquery in summary | Derived from activeJobs LATERAL result |
| `active_jobs` correlated subquery in summary | Replaced by activeJobs parallel query |
| `pending_estimates` correlated subquery in summary | Replaced by openEstimates parallel query |
| `outstanding_cents` correlated subquery in summary | Computed from openInvoices result |
| `open_issues_count` correlated subquery in summary | Derived from issues query result |
| Standalone `jobs` list query (10 most recent) | Replaced by activeJobs + serviceHistory |

**Net change:** Removed 5 sequential correlated subqueries + 1 parallel query.
Added 7 new parallel queries. Total round-trip count unchanged (2). Parallel query
count: 6 → 12. Because queries run concurrently, wall-clock time is bounded by
the slowest single query, not the sum.

---

## Bugs Fixed

1. **Active Work status filter** — was `IN ('scheduled','in_progress')`. Fixed to
   `NOT IN ('completed','invoiced','cancelled')`. `draft` and `quoted` jobs
   (new leads and sent estimates) were previously invisible.

2. **Issues query** — was `status IN ('open','monitoring')`. Fixed to fetch ALL issues
   so resolved history is visible in the IssuesPanel collapsed section.

3. **PropertyTimeline React key** — was `key={event.id}` (UUID could collide across tables).
   Fixed to `key={\`${event.event_type}-${event.id}\`}`.

4. **Property notes never shown** — `property_notes` table existed with data but was never
   queried or rendered on the property page. Now fetched and shown in Health + Timeline.

5. **Visit media never shown** — `visit_media` table existed but property page had no
   query for it. Now shown as a photo-count summary per visit in Documents & Media.

6. **Document links never shown** — `document_links` table existed but property page had
   no query for it. Now shown in Documents & Media section.

---

## Layout Changes

### Before
```
Primary: Timeline | Issues (conditional) | Vault | Jobs list
Sidebar: Conditions | Property Details | Edit Property
```

### After
```
Primary: Active Work (conditional) | Service History (conditional) |
         Timeline | Property Health (conditions+issues+notes) |
         Documents & Media (conditional) | Vault
Sidebar: Property Details | Edit Property
```

- Conditions moved from sidebar → Property Health section in primary column
- Issues moved from separate card → Property Health section
- Property notes added to Health section (pinned first, then recent)
- Standalone Jobs list removed (covered by Active Work + Service History)
- Active Work changed from count widget to full ItemCards with job detail

---

## Performance Review

### DB round trips: 2 (unchanged)
- Round 1: 1 property summary query (simplified — was 1 + 5 correlated)
- Round 2: 12 parallel queries (was 6)

### Index coverage
All new queries use indexed access paths:

| Query | Index used |
|-------|------------|
| activeJobs | `idx_jobs_property` (new, migration 102) → LATERAL `idx_visits_job` |
| openEstimates | `idx_estimates_account_status` + property_id FK scan |
| openInvoices | `idx_invoices_account_status` + property_id FK scan |
| serviceHistory | `idx_jobs_property` → LATERAL `idx_visits_job`, `idx_invoices_job` |
| propertyNotes | `idx_property_notes_property` (pre-existing) |
| documents (CTE) | `ix_document_links_entity` (pre-existing) |
| visitMedia | `idx_visit_media_visit` → `idx_visits_job` → `idx_jobs_property` |

### Missing indexes identified
None found in the new queries beyond what migration 102 already adds.

The visit media query chains three joins (visit_media → visits → jobs). All joins
use indexed FKs. The `visit_media` table doesn't have a property-level index but
the chain through `visit_id → job_id → property_id` is efficient for small-to-medium
datasets (typical for a single-property view).

### Should this page use a read model?

The `property_timeline_v` view already exists as the canonical read model for the
property timeline. The page currently maintains a separate inline UNION because the
view uses `jsonb` metadata fields while the component expects flat columns.

**Recommendation:** At the next opportunity, update the view to expose flat columns
(or add a wrapper view/function), then switch the timeline query to use the view
directly. This eliminates the duplicate UNION definition and makes the view the
single source of truth for property history ordering.

---

## Tests Added

**File:** `apps/web/app/app/properties/[id]/__tests__/property-history.unit.test.ts`

48 unit tests across 12 suites:

| Suite | Tests | Covers |
|-------|-------|--------|
| ACTIVE_JOB_STATUSES_EXCLUDED | 4 | Terminal status set; 'cancelled' vs 'archived' regression guard |
| propertyActiveJobStatusColor | 6 | All real DB statuses; pipeline-name guard |
| formatPropertyCents | 3 | Currency formatting |
| formatPropertyDate | 2 | Date string output |
| NOTE_SOURCE_LABELS | 2 | All 3 DB source values covered |
| DOCUMENT_TYPE_LABELS | 13 | All document_type CHECK constraint values |
| eventHrefFor | 7 | All event types + null link_id cases |
| Timeline event type coverage | 2 | Regression guard that note type is in query |
| Multi-property isolation | 1 | Documents that both filters must be present |
| ServiceHistoryRow shape | 2 | Completed job; no-visit-recorded job |
| Active Work section conditions | 3 | Count logic |
| Empty state conditions | 3 | All three conditional sections |

All 703 tests pass (655 pre-existing + 48 new).

---

## Remaining Gaps

1. **Completion packet photos** — `completion_packets.photo_urls` (text[]) holds
   photo URLs from technician sign-off. These are not shown anywhere on the property
   page. A future Documents section enhancement could list these per-visit.

2. **property_timeline_v view alignment** — The view is more complete than the inline
   UNION (includes equipment as 'equipment' type vs 'vault_item'). Consider updating
   the PropertyTimeline component to consume the view directly.

3. **Document download links** — The Documents section shows document metadata from
   `document_links` (via Paperless-ngx integration) but does not render clickable
   download links. The `paperless_doc_id` foreign key is present but the download
   URL construction requires the Paperless API integration to be wired up.

4. **Visit media viewing** — The Documents & Media section shows photo counts per visit
   with links to the visit page. In-page photo browsing would require a lightbox or
   modal component (out of scope for this phase).

5. **Integration tests** — The following scenarios require `TEST_DATABASE_URL`:
   - Property with multiple completed jobs in service history
   - Property with active jobs of each DB status
   - Property with no activity (all sections empty/hidden)
   - Property with notes, issues, and conditions in health section
   - Multi-tenant isolation (account_id filter enforcement)
