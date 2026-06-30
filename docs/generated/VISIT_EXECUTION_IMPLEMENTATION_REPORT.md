# Visit Execution Implementation Report

## Goal

Make `/app/visits/[id]` the complete field execution workspace. A technician or
owner should be able to prepare, execute, document, complete, and recommend next
steps without bouncing between unrelated screens.

---

## Section Inventory

| Section | Status | Classification |
|---------|--------|----------------|
| VisitCommandBanner | Existing | KEEP — smart next-step guidance, already excellent |
| Visit Timeline | Existing | KEEP |
| Routing zone warning | Existing | KEEP |
| Actions (early, for tech on scheduled/arrived) | Existing | KEEP |
| Membership Visit Panel | Existing | KEEP |
| Site Assessment link | Existing | KEEP — sub-route is correct (496-line form) |
| Site Visit Complete (post-assessment prompt) | Existing | KEEP |
| Walkthrough Checklist | Existing | KEEP |
| Visit Summary / Snapshot (reporting phase) | Existing | KEEP |
| Issue / Parts / Resolution / Closing (repair flow) | Existing | KEEP |
| Completion Checklist | Existing | KEEP — packet creation |
| Actions (late, admin/owner) | Existing | KEEP |
| Tech Notes | Existing | KEEP |
| Materials Used | Existing | KEEP |
| **Property Context** | **NEW** | ADDED — prep context for active visits |
| **Completion Record** | **NEW** | ADDED — packet summary for completed visits |
| **Follow-Up** | **NEW** | ADDED — note, estimate, follow-up visit, issue flag |
| Time logs | Missing | OUT OF SCOPE — complex, not priority |

---

## Assessment Route Decision

**Keep as sub-route** (`/app/visits/[id]/assessment`).

`AssessmentForm.tsx` is 496 lines of structured room measurement + scope notes data
entry. It requires its own page space. The visit page already integrates correctly:
- Active site visits: "Open Assessment Form →" link
- Completed site visits: "View Assessment" + "Create Estimate →" prompt

No consolidation needed. Linking is the right pattern for this level of complexity.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/app/app/visits/[id]/page.tsx` | Property context queries; property context + completion record + follow-up render sections |
| `apps/web/app/app/visits/[id]/VisitPropertyContext.tsx` | **New** — property prep context component |
| `apps/web/app/app/visits/[id]/VisitRecommendationPanel.tsx` | **New** — follow-up panel (note form + next-step links) |
| `apps/web/app/app/visits/[id]/visit-execution-helpers.ts` | **New** — testable pure functions |
| `apps/web/app/app/visits/[id]/__tests__/visit-execution.unit.test.ts` | **New** — 39 unit tests |

---

## Sections Added

### Property Context (`VisitPropertyContext`)

Appears between Visit Timeline and Membership/Checklist panels for `scheduled`,
`arrived`, and `in_progress` visits that have a property.

Shows three pieces of prep information:
- **Last service** — job title + date + link to that visit
- **Open issues** — severity-sorted list (up to 5) from `property_issues`
- **Pinned notes** — up to 3 pinned `property_notes` for the tech to see before work begins

Hidden for `completed` and `cancelled` visits (no longer relevant to execution).

### Completion Record

Appears for `completed` visits that have a completion packet. Shows:
- Photo count from packet
- Signature status (on file / waived / none)
- Completion notes

This data was already fetched (`completionPacket`) but was only shown during
`in_progress` to drive the CompletionChecklist form. Now it's also displayed
post-completion as a read-only record.

### Follow-Up (`VisitRecommendationPanel`)

Appears for `completed` visits that have a property. Contains:

1. **Add property note** — inline textarea form, POSTs to `/api/v1/properties/${id}/notes`
   with `source: "technician"` and `visit_id` linked. Success toast, no page reload.

2. **Recommend estimate** — link to `/app/estimates/new?client_id=...&job_id=...&property_id=...&from_visit=...&pricing_mode=flat_rate`. Only shown to users with estimate creation permission.

3. **Schedule follow-up visit** — link to `/app/jobs/${jobId}/visits/new`.

4. **Flag property issue** — link to `/app/properties/${id}` (property health section).
   The issue creation form at the property is complex enough to warrant navigation rather
   than embedding.

---

## Sections Removed / Moved

None removed. The inventory is additive.

---

## Routes Consolidated

No routes created or removed. The assessment sub-route remains as-is.

---

## Queries Added

Three new parallel queries added to the existing membership/property Promise.all
(Round 2). Previously that round was conditional on `isMembershipVisit`; it is now
always a `Promise.all` with conditional resolution per slot.

### 1. Open property issues (property context)

```sql
SELECT id, title, severity, area, occurrence_count
FROM property_issues
WHERE property_id = $1 AND account_id = $2
  AND status IN ('open','monitoring')
ORDER BY CASE severity
  WHEN 'critical' THEN 1 WHEN 'major' THEN 2 WHEN 'moderate' THEN 3 ELSE 4
END
LIMIT 5
```

**Index coverage:** `idx_property_issues_property ON property_issues(account_id, property_id, status)` — fully covered.

**Guard:** only runs when `needsPropertyContext = !!job_property_id && status !== 'cancelled'`

### 2. Pinned property notes (property context)

```sql
SELECT id, body, source, created_at::text AS created_at
FROM property_notes
WHERE property_id = $1 AND account_id = $2 AND pinned = true
ORDER BY created_at DESC
LIMIT 3
```

**Index coverage:** `idx_property_notes_pinned ON property_notes(account_id, property_id) WHERE pinned = true` — partial index, O(1) for sparse set.

### 3. Last completed visit at this property

```sql
SELECT v2.id, j2.title AS job_title, v2.completed_at::text AS completed_at
FROM visits v2
JOIN jobs j2 ON j2.id = v2.job_id
WHERE j2.property_id = $1 AND v2.account_id = $2
  AND v2.status = 'completed' AND v2.id != $3
ORDER BY v2.completed_at DESC
LIMIT 1
```

**Index coverage:** `idx_jobs_property ON jobs(property_id)` (migration 102) → `idx_visits_job ON visits(job_id)` + `idx_visits_account_status ON visits(account_id, status)`.

---

## Queries Removed

None removed. The existing query structure is unchanged.

---

## Performance Review

### DB round structure (before and after)

| Round | Queries | Change |
|-------|---------|--------|
| 1 | Main visit query (joins jobs, properties, plans, users) | Unchanged |
| 2 | Membership + vault categories + property context | **+3 parallel** (was conditional) |
| 3 | Checklist (withChecklistContext) | Unchanged |
| 4 | Repair flow: before photos, after photos, parts | Unchanged |
| 5 | Completion packet | Unchanged |
| 6 | Approved estimate (repair active) | Unchanged |
| 7 | Draft change order count | Unchanged |

Total round trips: 7 (unchanged). Total queries in Round 2: was 0 or 2 (conditional on membership); now 3, 4, or 5 depending on visit type and property. All run concurrently.

### Indexes confirmed sufficient

All three new queries are covered by existing indexes. No new migration needed.

---

## Tests Added

**File:** `apps/web/app/app/visits/[id]/__tests__/visit-execution.unit.test.ts`

39 unit tests across 12 suites:

| Suite | Tests | Covers |
|-------|-------|--------|
| ACTIVE_VISIT_STATUSES | 2 | Status set composition |
| TERMINAL_VISIT_STATUSES | 2 | Status set composition |
| active + terminal union | 1 | All 5 DB values covered |
| shouldShowPropertyContext | 5 | All status values |
| shouldShowFollowUp | 2 | completed only |
| shouldShowCompletionRecord | 2 | completed only |
| ISSUE_SEVERITY_COLORS | 3 | All 4 severities |
| NOTE_SOURCE_DISPLAY | 2 | All 3 DB source values |
| formatContextDate | 2 | Date string output |
| buildEstimateUrl | 3 | URL construction, null client guard |
| Visit with no checklist | 2 | Empty checklist guards |
| Visit with property issues | 3 | Context display conditions |
| Visit with previous service history | 2 | lastServiceVisit shape |
| Visit completion | 4 | Completion record + follow-up visibility |
| Multi-tenant isolation | 4 | needsPropertyContext guard |

All 745 tests pass (706 prior + 39 new).

---

## Remaining Gaps

1. **Time logs** (`visit_time_logs` table) — no UI on the visit page. Low priority for
   field execution. Would require a dedicated panel to show active timer state and log
   history. Defer until actively needed.

2. **Issue creation from visit** — the "Flag issue" action links to the property page
   rather than opening an inline form. The issue create form requires area, item_key,
   title, description, severity — too complex for embedding. An inline "quick flag"
   with just title + severity could be a future improvement.

3. **Visit media viewing on completed visits** — before/after photos are loaded and
   shown during the repair flow. On completed repair visits, the photos are accessible
   but only through the panel components. A compact photo summary in the Completion
   Record would round out the visit record view.

4. **Assessment integration on the visit summary** — for completed site visits, the
   assessment data (room measurements, scope notes) is visible only by navigating to
   the assessment sub-route. A read-only summary of key assessment fields (total sqft,
   scope notes, flags) would provide context without requiring navigation.
