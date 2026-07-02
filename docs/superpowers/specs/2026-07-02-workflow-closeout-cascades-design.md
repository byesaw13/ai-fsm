# Workflow Close-Out Cascades — Design Spec

**Date:** 2026-07-02  
**Status:** Draft — pending user review  
**Problem:** Pre-sale workflow steps (request → site visit → estimate) do not reliably close out or advance. Artifacts sit in ambiguous open states (e.g. assessment complete but visit `in_progress`, estimate sent but job still `draft`), causing the UI to show stale “do the site visit” prompts and wrong pipeline stages.

**Canonical alignment:** `docs/canonical/WORKFLOW.md`, `docs/working/domain/workflow-model.md`

---

## Goal

Make the app **naturally progress** through the pre-sale and billing pipeline by wiring **close-out cascades** at each mutation point, while preserving the ability to **amend** closed artifacts (assessments, estimates, invoices) without reopening prior chapters.

---

## Decisions (locked in brainstorming)

| Topic | Decision |
|-------|----------|
| Assessment complete | **Auto-close** the parent `site_visit` (visit → `completed`) |
| Post-close edits | **Amend, don't reopen** — owners/admins can edit assessment after visit is closed; visit stays `completed` |
| Estimate send | Job → `quoted`; set `expires_at` from account settings; pipeline → estimate sent |
| Customer silence | **Follow-up nudges** via existing `estimate_followup` automation |
| No response | **Auto-expire** after N days (default **30**, `estimate_expiry_days` in Company Settings) via existing `expire-estimates` worker |
| After expiry | Job and estimate remain on **client page / property vault** as historical; **Revise & resend** via existing `/revise` fork |
| Implementation approach | **Event-driven cascades** in existing API routes + pipeline derivation fixes (no new `engagement_phase` column) |

---

## §1 — Close-out event model

Each artifact has **open** (active work) and **closed** (chapter done, amendable) modes.

| Artifact | Open signal | Close-out trigger | On close |
|----------|-------------|-------------------|----------|
| Booking request | `status` not `converted`/`cancelled` | Convert to job + site visit | `converted` |
| Site visit | `status` not in `completed`/`cancelled` | Assessment `completed_at` set (**auto**) or manual visit complete | `visit → completed`, `completed_at` set |
| Assessment | `completed_at IS NULL` | “Mark Assessment Complete” | `completed_at` set + **cascade** visit close |
| Estimate | `status = draft` | Send to customer | `sent`, `sent_at`, `expires_at`, job → `quoted` |
| Estimate (waiting) | `status = sent` | Approve / decline / expire (worker) | Pipeline + banners update; job stays visible |
| Work order (draft) | `status = draft` pre-acceptance | Estimate approved | Promote to `ready` on project (existing path) |

```text
Request → Site Visit (open) → Assessment complete
                ↓ [auto cascade]
         Site Visit (closed) → Create/Send Estimate
                ↓
         Estimate Sent (job: quoted) → [nudge ~day 3] → [expire day N]
                ↓                              ↓
         Approved → Schedule work      Expired → Revise & resend
                                              (historical on client page)
```

---

## §2 — Implementation touchpoints

### New module: `apps/web/lib/workflow/cascades.ts`

Centralize side effects so routes stay thin and tests stay focused.

```ts
// Pseudocode — actual exports TBD in implementation plan
completeAssessmentCascade(client, { visitId, accountId, userId, traceId })
  // When assessment.completed_at transitions null → non-null:
  // 1. Complete site_visit if not already completed/cancelled
  // 2. Do NOT advance job to completed (site_visit is pre-sale, not execution)
  // 3. Emit audit + workflow event

sendEstimateCascade(client, { estimateId, accountId, userId, traceId })
  // On first send (draft → sent):
  // 1. Set expires_at from accounts.settings.estimate_expiry_days (default 30) if null
  // 2. If estimate.job_id: UPDATE jobs SET status = 'quoted' WHERE status = 'draft'
  // 3. Audit log

expireEstimateCascade(client, { estimateId, ... })
  // On worker expire (sent → expired):
  // 1. Job stays quoted/draft — do NOT cancel job
  // 2. Surface in action queue / WhatNextBanner as "expired — revise or follow up"
```

### Assessment PUT — `apps/web/app/api/v1/visits/[id]/assessment/route.ts`

When `completed_at` is set (transition from null → timestamp):

1. Upsert assessment (existing behavior).
2. Call `completeAssessmentCascade`:
   - `UPDATE visits SET status = 'completed', completed_at = COALESCE(completed_at, now()) WHERE id = $visitId AND visit_type = 'site_visit' AND status NOT IN ('completed','cancelled')`
   - Use visit transition validator / same invariants as `POST .../transition` where possible.
3. **Do not** auto-advance job to `completed` — pre-sale site visits must not trigger execution-completion logic.

Re-saving an already-completed assessment (amend) must **not** re-fire the cascade.

### Estimate send — `apps/web/app/api/v1/estimates/[id]/send/route.ts`

On first `draft → sent`:

1. Set `expires_at = now() + (estimate_expiry_days || 30) days` when `expires_at` is null.
2. Call `sendEstimateCascade` to set linked job `draft → quoted`.
3. Ensure `estimate.job_id` is populated when created from assessment/work order (see §4).

### Existing workers (no new automation types)

| Worker | Role |
|--------|------|
| `expire-estimates.ts` | Already marks `sent` → `expired` when `expires_at < now()` |
| `estimate-followup.ts` | Already nudges after `days_after_sent` (default 3) — verify enabled per account |

### Settings

`estimate_expiry_days` already exists in Company Settings (`CompanyForm.tsx`, `PATCH /api/v1/account`). Send route must **read and apply** it. Optional follow-up: expose `estimate_followup_days` in settings (out of scope unless needed — automation `config.days_after_sent` exists).

---

## §3 — Pipeline derivation fixes

### Problem

`derivePipelineStage` and job page visit counts treat **any** open or `in_progress` visit as field execution. A stuck pre-sale `site_visit` in `in_progress` pushes the job to **Working** even when assessment is done and estimate is out.

### Fix: visit-type-aware facts

Extend `PipelineStageFacts` (or compute upstream) with:

```ts
executionActiveVisitCount   // standard | punch_list, status not completed/cancelled
executionInProgressCount    // same filter, status in_progress|arrived|...
preSaleOpenSiteVisitCount   // site_visit, not completed/cancelled
completedPreSaleSiteVisit   // site_visit completed (assessment chapter done)
```

**Updated derivation rules (priority order unchanged for billing/execution):**

1. After `sentEstimateCount > 0` or `jobStatus === 'quoted'` → `estimate_sent` **before** checking open pre-sale visits.
2. `in_progress` / `scheduled` stages use **execution** visit counts only — not `site_visit`.
3. When `preSaleOpenSiteVisitCount > 0` and no sent estimate → stay at `estimate_needed` with action “Complete walkthrough” (not “Working”).
4. When `completedPreSaleSiteVisit` and `estimateCount === 0` → `estimate_needed` (“Create estimate”).

Update callers:

- `apps/web/app/app/jobs/[id]/page.tsx` — pass execution-scoped counts.
- `packages/domain/src/stages.ts` — derivation logic + unit tests in `stages.unit.test.ts`.

### Job visit completion side effect (guard)

`POST /api/v1/visits/[id]/transition` currently auto-advances job to `completed` when all visits are done. **Exclude `site_visit`** from sibling completion logic for job promotion to `completed`, OR only count `standard`/`punch_list` visits when deciding job `completed`. Pre-sale walkthrough completion must not mark the project “work complete.”

---

## §4 — UI changes

### Visit page (`apps/web/app/app/visits/[id]/page.tsx`)

| Condition | Show |
|-----------|------|
| `site_visit` + visit open + assessment incomplete | “Open Assessment Form” (existing) |
| `site_visit` + visit open + assessment complete (edge: cascade failed) | “Assessment done — closing walkthrough…” or manual “Complete Walkthrough” |
| `site_visit` + visit `completed` | “Site Visit Complete” card with Create Estimate (existing) |
| `site_visit` + visit `completed` + assessment exists | “View / Amend Assessment” (owner/admin) |

Assessment page: change `canEdit` to allow owner/admin edit when visit is `completed` (already partially true); tech read-only after close.

### Job page — `WhatNextBanner` + `JobCommandPanel`

New banner states:

- **Walkthrough open:** “Complete site assessment” → link to visit assessment.
- **Walkthrough done, no estimate:** “Create estimate from assessment.”
- **Estimate sent:** existing “waiting for customer” + days since sent.
- **Estimate expired:** “Estimate expired — revise and resend” → `/app/estimates/{id}` with Revise CTA.

`JobCommandPanel` `approved_ready` “Book Walkthrough” label is wrong for post-approval — should be “Schedule Work” (execution visit). Separate pre-sale `site_visit` from post-approval scheduling in copy.

### Client 360 (`apps/web/app/app/clients/[id]/page.tsx`)

No structural change required:

- Timeline already includes non-draft estimates (sent, approved, declined, expired).
- Historical estimates section already shows declined/expired.
- Expired estimates get **Revise** action; job remains in open jobs list while `draft`/`quoted`.

### Action queue

Existing “Follow Up Estimates” tile — ensure expired estimates appear under a separate “Expired — revise” count or combined with clear detail string.

---

## §5 — Work order draft vs estimate

### Problem (Peter Marinelli)

Scope and pricing lived in a **draft work order** ($2,797.82) without an `estimates` row, so the commercial pipeline never advanced.

### Rule

**Estimates are the commercial artifact.** Draft work orders from assessment are planning packets only (`WORKFLOW.md`). The UI must not treat work-order pricing alone as “estimate sent.”

### UX guardrails

1. After assessment complete, primary CTA is **Create Estimate** (prefill from assessment/work order scope).
2. “Prepare Work Order Draft” remains secondary (planning).
3. If a draft work order exists with `total_cents > 0` and no estimate, job `WhatNextBanner` shows “Create estimate from work order scope.”
4. Optional: `Create Estimate` action on work order detail that copies scope into new estimate draft.

---

## §6 — Data repair (one-time)

Script or admin task for stuck production records:

```sql
-- Example: Peter Marinelli pattern — assessment complete, visit still in_progress
UPDATE visits SET status = 'completed', completed_at = COALESCE(completed_at, sva.completed_at)
FROM site_visit_assessments sva
WHERE visits.id = sva.visit_id
  AND visits.visit_type = 'site_visit'
  AND visits.status = 'in_progress'
  AND sva.completed_at IS NOT NULL;
```

Run scoped to main account after cascade code ships. User manually creates/sends estimate for Peter if still missing.

---

## §7 — Testing

| Layer | Cases |
|-------|-------|
| Unit | `derivePipelineStage` with site_visit vs standard visits; cascade idempotency |
| Integration | Assessment complete → visit completed; send → job quoted + expires_at |
| Integration | Job does NOT → completed when only site_visit completes |
| E2E | Full path: site visit → assessment → estimate send → pipeline shows estimate sent |

---

## §8 — Out of scope

- New `engagement_phase` stored column
- Customer portal changes (expired estimate display already supported via share token lifecycle)
- Invoice close-out cascades (separate slice; job `invoiced` remains manual per workflow-model)
- Multi-follow-up cadence (second nudge at day 7) — can add later via automation config

---

## §9 — Success criteria

1. Completing an assessment auto-closes the site visit within the same transaction.
2. Job page never shows “Working” solely because a pre-sale `site_visit` is stuck `in_progress`.
3. Sending an estimate sets expiry, moves job to `quoted`, and pipeline shows “Estimate Sent.”
4. Expired estimates remain on client history; revise creates new draft revision.
5. Peter Marinelli–class stuck records are repairable and prevented going forward.