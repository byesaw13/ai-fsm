# Intake Path: Assessment vs Book Work — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After intake/request review, force an explicit path — **schedule assessment**, **book work appointment**, or **remote estimate** — then keep the owner on that path with clear What Next CTAs and findable assessment records on client/project/visit screens.

**Why:** Brian Floss-class failures: intake creates a “General Repairs” project, a vague visit is scheduled (often `sales_walkthrough`), assessment is never filled because nothing leads into the assessment form, estimate is sent without a closed pre-sale scope step.

**Architecture:** Stabilize, don’t rebuild. Keep Project → visits / estimates / work orders. Reuse `booking_requests.routing_path` + visit types. Make the **owner intent** explicit, create the **correct visit type**, and make **assessment** first-class in UI labels and handoffs.

**Tech stack:** Next.js App Router, PostgreSQL, `@ai-fsm/domain`, Vitest unit tests, existing request guidance + ProjectWhatNext patterns.

**Related:** `docs/WORKFLOW_MAP.md`, `docs/working/architecture/booking-request-boundaries.md`, `docs/superpowers/specs/2026-07-01-job-work-order-visit-model-design.md`, closeout rule (visits never auto-complete project).

---

## Product rules (locked)

| Intent (owner choice) | Creates / next step | Visit type | Assessment form |
|----------------------|---------------------|------------|-----------------|
| **Schedule assessment** | Project + assessment visit (or schedule on existing project) | `site_visit` only | Required before “create estimate” is primary |
| **Book work appointment** | Project + work-day visit (T&M/day work when scope is clear) | `standard` (+ WO when required) | Not required |
| **Remote estimate** | Project (draft/quoted) → create/send estimate | No visit yet | N/A |

**Labels (owner UI):**

- `site_visit` → **Assessment**
- `sales_walkthrough` → **Sales walkthrough** (legacy; prefer Assessment for new pre-sale)
- `standard` / `punch_list` → **Work day** / **Punch list**

**What Next precedence (pre-sale):**

1. Open incomplete **Assessment** visit → Open Assessment form  
2. Assessment complete, no estimate → Create estimate  
3. Estimate sent, not approved → Waiting on customer  
4. Approved → schedule work days (existing post-closeout-fix behavior)  
5. Never treat a generic “Schedule Visit” as the primary CTA when an assessment is open or required

**Do not:**

- Auto-schedule a work day from raw intake without the fork  
- Use `sales_walkthrough` for new assessment path (use `site_visit` so assessment form works)  
- Auto-complete the project from visits (existing rule)

---

## Current gaps (code truth)

| Area | Today | Gap |
|------|--------|-----|
| Intake submit | Creates client + property + draft job; routing may be auto `site_visit` / `remote_estimate` / `pending` | Success screen is informational only — no forced owner path action |
| Request guidance | `getRequestGuidance` maps routing → schedule_walkthrough / create_estimate / create_job | “Walkthrough” wording; no **Book work appointment** path; `pending` defaults poorly |
| Convert API | `POST .../convert` creates **`site_visit`** correctly | UI may schedule other types; Brian got `sales_walkthrough` via job schedule flow |
| Assessment form | Only on `visit_type = site_visit` | Non–site_visit pre-sale visits never lead to assessment |
| Project What Next | Has open pre-sale site visit branch | Incomplete assessment not always first; completed sales_walkthrough ≠ assessment complete |
| Project timeline | Generic visit titles | Hard to see Assessment vs Work day |
| Client 360 | Weak visit/assessment surface | Assessment not pinned / findable |

---

## File map

| File | Role |
|------|------|
| `packages/domain` (routing / visit labels if shared) | Canonical path enum + visit type display labels |
| `db/migrations/*_intake_path.sql` (if needed) | Expand `routing_path` CHECK if adding `book_work` |
| `apps/web/app/app/requests/request-guidance.ts` | Guidance for three paths |
| `apps/web/app/app/requests/__tests__/request-guidance.unit.test.ts` | Unit tests |
| `apps/web/app/app/requests/[id]/ReviewActions.tsx` | Required path picker + primary CTAs |
| `apps/web/app/app/requests/[id]/page.tsx` | Surface path + next action |
| `apps/web/app/api/v1/booking-requests/[id]/route.ts` | PATCH accepts path |
| `apps/web/app/api/v1/booking-requests/[id]/convert/route.ts` | Assessment schedule only (keep site_visit) |
| New or extend: schedule work from request | `book_work` → create standard visit (+ WO resolve) |
| `apps/web/app/app/intake/new/IntakeForm.tsx` | Post-submit: “Choose next step” (not just routing tip) |
| `apps/web/app/app/jobs/[id]/ProjectWhatNext.tsx` | Assessment-first pre-sale precedence |
| `apps/web/app/app/jobs/[id]/page.tsx` | Split Assessments vs Work days; labels |
| `apps/web/app/app/jobs/[id]/visits/new/VisitScheduleForm.tsx` | Default visit type from query/path; label Assessment |
| `apps/web/app/app/visits/[id]/page.tsx` | Title Assessment; incomplete assessment banner always primary |
| `apps/web/app/app/clients/[id]/page.tsx` (+ helpers) | Open assessments / last assessment link |
| `apps/web/lib/visits/labels.ts` (new) | `visitTypeLabel(visit_type)` single source |

---

## Data model

### Preferred: extend `routing_path`

Current CHECK: `site_visit | remote_estimate | pending`

Add:

```text
book_work
```

Semantics:

| Value | Owner meaning |
|-------|----------------|
| `pending` | Not chosen yet — block “done reviewing” as complete |
| `site_visit` | Assessment first |
| `book_work` | Book work appointment (skip full assessment) |
| `remote_estimate` | No visit; go to estimate |

Migration: alter CHECK constraint; backfill unknown → leave as-is.

### No new tables

Visit types and assessment table already exist. Use them.

---

### Task 1: Visit type labels + helpers

**Files:**

- Create: `apps/web/lib/visits/labels.ts`
- Create: `apps/web/lib/visits/__tests__/labels.unit.test.ts`
- Optionally re-export from domain if needed by multiple packages later

**Requirements:**

1. `visitTypeLabel(type)` → Assessment | Work day | Punch list | Sales walkthrough | …
2. `isAssessmentVisit(type)` → `site_visit` (and optionally treat open incomplete sales_walkthrough as “pre-sale visit” for listing only — **do not** open assessment form for sales_walkthrough)
3. `isExecutionVisit(type)` → standard | punch_list (existing pattern)

**Tests:** unit map coverage.

**Commit:** `feat(visits): owner-facing visit type labels`

---

### Task 2: Routing path `book_work` + PATCH

**Files:**

- Create: `db/migrations/NNN_booking_routing_book_work.sql`
- Modify: booking request PATCH schema / validation
- Modify: domain or web types that list routing paths

**Requirements:**

1. DB allows `book_work`
2. PATCH can set `routing_path` to any of the four values
3. Setting path does not auto-create visits (creation is explicit CTA)

**Tests:** validation unit if present; migration applies cleanly.

**Commit:** `feat(intake): add book_work routing path`

---

### Task 3: Request guidance — three paths

**Files:**

- Modify: `apps/web/app/app/requests/request-guidance.ts`
- Modify: `apps/web/app/app/requests/__tests__/request-guidance.unit.test.ts`

**Requirements:**

| routing_path | Primary action | Label / detail |
|--------------|----------------|----------------|
| `pending` | **Choose path** (null or `choose_path`) | “How should we proceed?” — not Create Estimate |
| `site_visit` | Schedule Assessment (was walkthrough) | Creates/opens assessment visit |
| `book_work` | Schedule Work Appointment | Standard visit / T&M day |
| `remote_estimate` | Create Estimate | No visit |

Update wording: **Assessment** not “Walkthrough” for site_visit path (walkthrough OK as synonym in detail text only).

**Tests:** matrix for all paths + converted/cancelled.

**Commit:** `feat(requests): guidance for assessment vs book work vs remote`

---

### Task 4: Request review UI — required path picker

**Files:**

- Modify: `apps/web/app/app/requests/[id]/ReviewActions.tsx`
- Modify: `apps/web/app/app/requests/[id]/page.tsx`

**Requirements:**

1. **How should we proceed?** three big choices (radio or cards):
   - Schedule assessment  
   - Book work appointment  
   - Remote estimate only  
2. Selecting saves `routing_path` immediately (PATCH).
3. While `pending`, primary CTA is disabled or is “Select a path above”.
4. After path set:
   - Assessment → **Schedule Assessment** → existing convert endpoint (site_visit) or schedule form with `visit_type=site_visit`
   - Book work → **Schedule Work Day** → `/app/jobs/{id}/visits/new?visit_type=standard&intent=book_work` (ensure job exists — intake already creates job)
   - Remote → **Create Estimate** → `/app/estimates/new?job_id=...`
5. Mark Reviewed can stay, but **recommended next** always follows path (not vague “General Repairs”).

**Brian Floss fix path (no data migration required for UX):** open request → set Assessment → schedule `site_visit` if still needed; if sales_walkthrough already done, guidance: “Create estimate from walkthrough notes” or “Schedule Assessment if more scope capture needed”.

**Commit:** `feat(requests): required intake path picker on review`

---

### Task 5: Intake success step — same fork

**Files:**

- Modify: `apps/web/app/app/intake/new/IntakeForm.tsx`
- Intake API if needed to accept explicit `routing_path` override from owner

**Requirements:**

1. After submit, show three actions (not only auto routing tip):
   - Schedule assessment  
   - Book work appointment  
   - Remote estimate  
2. Choosing path PATCHes booking request then navigates to schedule/estimate with correct type.
3. Keep auto-suggested path as **default highlighted** choice, not the only path.

**Commit:** `feat(intake): post-submit path choice`

---

### Task 6: Schedule form defaults by intent

**Files:**

- Modify: `VisitScheduleForm.tsx` + visits new page
- Visit create API if defaults needed

**Requirements:**

1. Query params: `visit_type=site_visit|standard`, `intent=assessment|book_work`
2. Default duration: assessment 1–2h; work day 8h (existing multi-day OK for work)
3. For `site_visit`, hide work-order requirement; for `standard`, keep WO rules
4. UI title: **Schedule Assessment** vs **Schedule Work Day**

**Commit:** `feat(visits): schedule form defaults for assessment vs work`

---

### Task 7: Project What Next — assessment-first

**Files:**

- Modify: `ProjectWhatNext.tsx` + unit tests
- Modify: `jobs/[id]/page.tsx` facts (open assessment incomplete, assessment completed, sales_walkthrough only, etc.)

**Requirements:**

1. If any `site_visit` not completed/cancelled → primary: **Open Assessment** (form if assessment incomplete, else complete visit)
2. If assessment complete (`site_visit` completed **and** assessment `completed_at` set) and estimateCount === 0 → Create estimate  
3. If only `sales_walkthrough` completed (no site_visit assessment) and no estimate → message: “Pre-sale visit done without assessment packet — create estimate from notes **or** schedule Assessment for full scope”  
4. Do not show “Schedule Visit” as primary while assessment is open  
5. After approved estimate: existing multi-day / closeout rules unchanged  

**Tests:** Brian-like matrix (open site_visit; complete assessment no estimate; sales_walkthrough only; estimate sent).

**Commit:** `feat(jobs): assessment-first project what-next`

---

### Task 8: Project + visit UI findability

**Files:**

- Modify: `jobs/[id]/page.tsx` timeline / visit lists  
- Modify: `visits/[id]/page.tsx` header  
- Modify: client 360 page / timeline helpers  

**Requirements:**

1. Project visits section split or badged:
   - **Assessments** (site_visit)  
   - **Work days** (standard / punch_list)  
   - Other (sales_walkthrough, membership, …) secondary  
2. Timeline entry title includes type label: `Assessment · Tue Jul 7`  
3. Visit detail H1: **Assessment — {client}** when site_visit  
4. Incomplete assessment: sticky primary **Open Assessment Form** (already partially there — ensure always for open site_visit)  
5. Client page: list open assessments with link to visit/assessment form  

**Commit:** `feat(ui): surface assessments on project and client`

---

### Task 9: Soft guardrails (optional same PR or follow-up)

**Files:** estimate create routes / new estimate entry; convert already blocks duplicate site_visit

**Requirements:**

1. Soft warning (not hard block) when creating estimate if `routing_path = site_visit` and no completed assessment — “No completed assessment; continue anyway?”  
2. Do **not** block remote_estimate or book_work paths  

**Commit:** `feat(estimates): warn when assessing path lacks completed assessment`

---

## Implementation order

1. Task 1 labels (no migration)  
2. Task 2 migration `book_work`  
3. Task 3 guidance  
4. Task 4 request review UI  
5. Task 5 intake success  
6. Task 6 schedule defaults  
7. Task 7 What Next  
8. Task 8 findability  
9. Task 9 soft guard (optional)

Ship **1–7** as the MVP slice if timeboxed; **8–9** immediately after.

---

## Verification

### Unit

```bash
pnpm --filter @ai-fsm/web test:unit -- \
  app/app/requests/__tests__/request-guidance.unit.test.ts \
  app/app/jobs/\[id\]/__tests__/project-what-next.unit.test.ts \
  lib/visits/__tests__/labels.unit.test.ts
```

### Manual (Brian-shaped)

1. New intake: unclear drywall/resale scope → submit → choose **Schedule assessment** → visit is `site_visit` titled Assessment.  
2. Open project → What Next: **Open Assessment** → fill assessment → complete walkthrough.  
3. What Next: **Create estimate** → send.  
4. Second intake: clear T&M half-day → **Book work appointment** → standard visit, no assessment form required.  
5. Third: photo-ready small job → **Remote estimate** → estimate new, no visit.  
6. Client page shows Assessment link when open.  
7. Completing work day still does **not** auto-complete project (prior fix).

### Regression

- Convert API still creates only `site_visit`  
- Approved multi-day + deposit pipeline unchanged  
- Membership / realtor visit types untouched  

---

## Success criteria

1. Owner cannot “finish” request review without choosing assessment / book work / remote.  
2. Assessment path always produces `site_visit` + path into assessment form.  
3. Assessment is findable from request → project → visit → client.  
4. Book work path never requires assessment packet.  
5. Brian Floss–class jobs no longer look like “work scheduled” when only a vague pre-sale visit happened without scope capture.

---

## Out of scope

- Replacing booking requests with a new entity  
- Auto AI routing as the only decision (suggestion OK; owner confirms)  
- Full CRM redesign  
- Changing final-invoice / project closeout rules from #493  

---

## Suggested PR title

`feat(intake): assessment vs book-work path with findable assessments`
