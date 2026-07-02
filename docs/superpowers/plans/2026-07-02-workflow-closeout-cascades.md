# Workflow Close-Out Cascades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire close-out cascades so assessment completion auto-closes site visits, estimate send advances jobs to quoted with expiry, and pipeline/UI reflect true pre-sale vs execution state.

**Architecture:** Central `apps/web/lib/workflow/cascades.ts` module invoked from assessment PUT and estimate send routes; visit-type-aware pipeline facts in `@ai-fsm/domain`; guard visit→job completion to exclude `site_visit`; UI banner/copy updates.

**Tech Stack:** Next.js App Router, PostgreSQL, Vitest integration tests, pnpm workspaces (`@ai-fsm/domain`, `@ai-fsm/web`)

**Spec:** `docs/superpowers/specs/2026-07-02-workflow-closeout-cascades-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/lib/workflow/cascades.ts` | Cascade side effects (assessment complete, estimate send) |
| `apps/web/lib/workflow/__tests__/cascades.integration.test.ts` | Integration tests for cascades |
| `apps/web/app/api/v1/visits/[id]/assessment/route.ts` | Invoke assessment cascade on first complete |
| `apps/web/app/api/v1/estimates/[id]/send/route.ts` | Set expires_at + invoke send cascade |
| `apps/web/app/api/v1/visits/[id]/transition/route.ts` | Exclude site_visit from job→completed sibling logic |
| `packages/domain/src/stages.ts` | Visit-type-aware pipeline derivation |
| `packages/domain/src/stages.unit.test.ts` | Pipeline unit tests (create if missing, else extend existing test file) |
| `apps/web/lib/pipeline/__tests__/stages.unit.test.ts` | Web re-export tests — update for new facts |
| `apps/web/app/app/jobs/[id]/page.tsx` | Pass execution-scoped visit counts + expired estimate facts |
| `apps/web/app/app/jobs/[id]/WhatNextBanner.tsx` | Walkthrough + expired estimate banners |
| `apps/web/app/app/jobs/[id]/JobCommandPanel.tsx` | Fix approved_ready copy |
| `apps/web/app/app/visits/[id]/page.tsx` | Assessment-complete edge UI |
| `apps/web/app/app/action-queue/page.tsx` | Expired estimate count |
| `db/scripts/repair-stuck-site-visits.sql` | One-time data repair script |

---

### Task 1: Workflow cascades module + assessment auto-close

**Files:**
- Create: `apps/web/lib/workflow/cascades.ts`
- Create: `apps/web/lib/workflow/__tests__/cascades.integration.test.ts`
- Modify: `apps/web/app/api/v1/visits/[id]/assessment/route.ts`

**Requirements:**
1. Export `completeAssessmentCascade(client, ctx)` where ctx has `visitId`, `accountId`, `userId`, `traceId`, `assessmentCompletedAt`.
2. Only runs when `assessmentCompletedAt` is non-null AND visit is `site_visit` AND visit status not in `completed`/`cancelled`.
3. Sets visit `status = 'completed'`, `completed_at = COALESCE(completed_at, assessmentCompletedAt or now())`.
4. Does NOT change job status.
5. Append audit log entry on visit status change.
6. Idempotent: calling again when visit already completed is a no-op.

**Assessment route change:**
- After upsert, if `d.completed_at` is set, fetch prior `completed_at` from existing row before upsert (or use RETURNING old value pattern).
- Only call cascade when transitioning null → non-null `completed_at`.

**Tests (integration, use TEST_DATABASE_URL pattern from existing integration tests):**
- Create account, client, job, site_visit in `in_progress`, assessment with rooms.
- PUT assessment with `completed_at` → visit becomes `completed`, job stays `draft`.
- Second PUT amend (change scope_notes, keep completed_at) → visit stays `completed`.

**Verify:** `pnpm --filter @ai-fsm/web test:integration -- cascades.integration`

**Commit:** `feat(workflow): auto-close site visit when assessment completes`

---

### Task 2: Estimate send cascade (expires_at + job quoted)

**Files:**
- Modify: `apps/web/lib/workflow/cascades.ts` — add `sendEstimateCascade`, `resolveEstimateExpiryDays`
- Modify: `apps/web/app/api/v1/estimates/[id]/send/route.ts`
- Modify: `apps/web/lib/workflow/__tests__/cascades.integration.test.ts` — add send tests

**Requirements:**
1. `resolveEstimateExpiryDays(client, accountId)` reads `accounts.settings->>'estimate_expiry_days'` default 30.
2. On first send (`draft → sent`), if `expires_at` is null, set `expires_at = now() + N days`.
3. `sendEstimateCascade`: if estimate has `job_id`, `UPDATE jobs SET status = 'quoted' WHERE id = $jobId AND status = 'draft'`.
4. Audit log job transition when it happens.
5. Re-send (already sent) must not change `sent_at` or re-quote job (existing immutability).

**Tests:**
- Job draft + estimate draft → send (E2E_SKIP_EMAIL or mock path) → job `quoted`, estimate `sent`, `expires_at` ~30 days out.
- Job already `quoted` + re-send → job stays `quoted`.

**Verify:** `pnpm --filter @ai-fsm/web test:integration -- cascades.integration`

**Commit:** `feat(workflow): cascade job quoted and expiry on estimate send`

---

### Task 3: Pipeline derivation + visit transition guard

**Files:**
- Modify: `packages/domain/src/stages.ts`
- Modify: `packages/domain/src/stages.unit.test.ts` (or create alongside stages.ts)
- Modify: `apps/web/lib/pipeline/__tests__/stages.unit.test.ts`
- Modify: `apps/web/app/app/jobs/[id]/page.tsx`
- Modify: `apps/web/app/api/v1/visits/[id]/transition/route.ts`

**PipelineStageFacts additions (optional fields, default 0):**
```ts
executionActiveVisitCount?: number;
executionInProgressCount?: number;
preSaleOpenSiteVisitCount?: number;
completedPreSaleSiteVisit?: boolean;
expiredEstimateCount?: number;
```

**Derivation changes:**
- Use `executionInProgressCount` instead of `inProgressVisitCount` for `in_progress` stage.
- Use `executionActiveVisitCount` instead of `activeVisitCount` for `scheduled` stage.
- `estimate_sent` before execution/pre-sale visit checks (already mostly true — ensure open site_visit doesn't override).
- If `preSaleOpenSiteVisitCount > 0` && no sent/approved estimate → `estimate_needed`.
- If `expiredEstimateCount > 0` && no active sent estimate → still `estimate_sent` but UI handles expired copy separately OR add sub-signal via banner (keep stage `estimate_sent`).

**Job page:** compute counts filtering `visit_type`:
- execution: `standard` | `punch_list`
- pre-sale: `site_visit`

**Visit transition guard:** In sibling visit count query for job→completed, add `AND visit_type IN ('standard','punch_list')`.

**Tests:**
- site_visit in_progress only → NOT `in_progress` pipeline stage
- standard visit in_progress → `in_progress`
- sent estimate + open site_visit → `estimate_sent`

**Verify:** `pnpm --filter @ai-fsm/domain test` and `pnpm --filter @ai-fsm/web test:unit -- stages.unit`

**Commit:** `fix(pipeline): separate pre-sale site visits from execution visits`

---

### Task 4: UI banners and visit page edge states

**Files:**
- Modify: `apps/web/app/app/jobs/[id]/WhatNextBanner.tsx`
- Modify: `apps/web/app/app/jobs/[id]/page.tsx` (pass new props)
- Modify: `apps/web/app/app/jobs/[id]/JobCommandPanel.tsx`
- Modify: `apps/web/app/app/visits/[id]/page.tsx`
- Modify: `apps/web/app/app/action-queue/page.tsx`
- Create: `apps/web/app/app/jobs/[id]/__tests__/what-next-banner.unit.test.ts` (if no existing test file)

**WhatNextBanner new props:** `hasOpenPreSaleSiteVisit`, `hasCompletedPreSaleSiteVisit`, `hasExpiredEstimate`, `latestExpiredEstimateId`, `hasDraftWorkOrderWithPricing`

**Banner logic (before existing draft/no-estimate check):**
1. Open pre-sale site visit → "Complete site assessment" → visit assessment link
2. Completed pre-sale, no estimate → "Create estimate from walkthrough"
3. Draft WO with total_cents > 0, no estimate → "Create estimate from work order scope"
4. Expired estimate, no sent/active → "Estimate expired — revise and resend" → estimate detail

**JobCommandPanel:** Change `approved_ready` action label from "Book Walkthrough" to "Schedule Work".

**Visit page:** When site_visit open + assessment has completed_at (cascade failed edge), show manual "Complete Walkthrough" button calling visit transition API.

**Action queue:** Add expired estimate count tile or extend Follow Up Estimates detail.

**Tests:** Unit tests for new WhatNextBanner branches.

**Verify:** `pnpm --filter @ai-fsm/web test:unit -- what-next-banner`

**Commit:** `feat(ui): workflow close-out banners and visit edge states`

---

### Task 5: Data repair script + gate

**Files:**
- Create: `db/scripts/repair-stuck-site-visits.sql`
- Modify: `docs/superpowers/specs/2026-07-02-workflow-closeout-cascades-design.md` — set Status: Implemented

**SQL script:** Documented UPDATE for visits with completed assessment but open visit (from spec §6). Include SELECT preview query first.

**Verify full gate:**
```bash
pnpm gate:fast
pnpm --filter @ai-fsm/web test:integration -- cascades.integration
```

**Commit:** `chore(db): repair script for stuck pre-sale site visits`