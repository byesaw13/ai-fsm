# Workflow Automation Audit — June 2026

## What Was Audited

The full chain from approved estimate to paid invoice, covering:
- All estimate approval paths (portal, email link, admin transition)
- Job auto-creation after approval
- Deposit invoice auto-creation after approval
- Final invoice auto-creation after job/visit completion
- Booking request → estimate prefill

---

## What Was Already Working

| Item | Status |
|---|---|
| Admin transition → deposit invoice (createApprovalArtifacts) | ✅ Working |
| Portal approval → auto job creation (createJobFromEstimate) | ✅ Working (but silently failing due to missing RLS context) |
| Visit completion → draft final invoice | ✅ Working (but inline duplication of job completion logic) |
| Job completion → draft final invoice | ✅ Working |
| Estimate convert → final invoice with reconciliation | ✅ Working |
| booking_request_id FK on estimates and jobs (migration 108) | ✅ In schema |
| Idempotency: unique index on (estimate_id, invoice_kind='final') | ✅ Working |

---

## What Was Changed

### 1. Centralized final invoice creation (`lib/invoices/final-invoice.ts`)

**Problem:** Visit completion and job completion each had ~80 lines of duplicated invoice-creation SQL. The visit path had a correctness bug: it hardcoded `deposit_cents` from the job snapshot instead of calling `reconcileFinalInvoice()`, meaning voided deposits would still be credited.

**Fix:** New shared function `createDraftFinalInvoiceForJob` used by both paths. Both now call `reconcileFinalInvoice` so voided deposits are correctly excluded and reconciliation notes are generated consistently.

### 2. Unified approval side-effects across all three paths

**Problem:** Three approval paths produced different artifacts:

| Path | Job | Deposit invoice | Action item |
|---|---|---|---|
| Email link | ❌ | ❌ | ❌ |
| Portal | ✅ (but broken RLS) | ❌ | ❌ |
| Admin transition | ❌ | ✅ | ✅ |

**Fix:** All three paths now call both `createJobFromEstimate` and `createApprovalArtifacts`. Each artifact step uses its own `SAVEPOINT` so a failure in one never blocks the others or rolls back the approval itself.

**RLS context bug fixed:** The portal and email paths create connections without a user session. PostgreSQL's row-level security `INSERT` policies check `app_account_id()`, which returns NULL without session vars — silently blocking job and invoice inserts. Both paths now call `set_config('app.current_*')` before artifact creation using the account owner's user_id.

### 3. Admin transition now also auto-creates the job

**Problem:** Admin transition called `createApprovalArtifacts` (deposit + action item) but not `createJobFromEstimate`. The job board remained empty until Nick manually clicked "Create Linked Job."

**Fix:** `createJobFromEstimate` is now called after `createApprovalArtifacts` in the transition route, wrapped in a savepoint.

### 4. Email link respond route — full artifact parity

**Problem:** The email link approval path (JWT-signed links in emails) updated the estimate status but created no job, no deposit invoice, and no action item. It was also still using fire-and-forget promises on a connection that got released immediately, risking a race condition.

**Fix:** Rewritten to use a proper BEGIN/COMMIT transaction. On approval, fetches the account owner, sets RLS context, then calls `createJobFromEstimate` and `createApprovalArtifacts` in separate savepoints.

### 5. Booking request → estimate prefill strengthened

**Problem:** When clicking "Create Estimate" from a booking request review, only `client_id`, `pricing_mode`, and `booking_request_id` were passed. The `property_id` known from the booking request was ignored, and the notes prefill used only `service_description`.

**Fix:**
- `ReviewActions.tsx` now passes `property_id` via URL param when the booking request has one
- `page.tsx` (new estimate) now fetches `property_id`, `routing_path`, `referral_source`, and `review_notes` from the booking request
- The `property_id` from the booking request is used as fallback for `initialPropertyId` in the estimate form
- Notes prefill now includes `review_notes` and `routing_path` recommendation when available

---

## What Remains Manual

| Step | Why manual |
|---|---|
| Sending the deposit invoice | Deliberate — Nick reviews before billing |
| Sending the final invoice | Deliberate — Nick reviews before billing |
| SMS approval → confirmation | Two-step by design (SMS → inbox confirm → approval) |
| Scheduling the visit | Cannot be automated without calendar integration |
| Multi-option estimate → final invoice | Cannot auto-invoice; the accepted option is unknown |

---

## Traceability Chain

After these changes, a booking-request-originated job can be traced:

```
booking_requests.id
  ↳ estimates.booking_request_id      (set at estimate creation)
  ↳ jobs.booking_request_id           (copied in createJobFromEstimate)
  ↳ invoices.estimate_id + jobs.job_id (via final invoice creation)
```

`visits` and `invoices` do not have a direct `booking_request_id` FK — they can be reached by joining through the job.

---

## Risks and Assumptions

**RLS context in portal/email paths:** The fix sets `app.current_role = 'owner'` for the account owner. If role-based RLS policies restrict owner-level inserts, this could produce unexpected behavior. In practice, owners have full insert rights on all their account's records.

**`getAccountOwnerUserId` returns null:** If an account has no user with `role = 'owner'`, artifact creation is skipped silently. This should never happen in production but is logged.

**Job status remains `quoted`:** Jobs created from approved estimates use `quoted` status, meaning "priced and awaiting scheduling." There is no `accepted` status in the domain. This is the correct existing status for a job that is past the estimate stage but not yet scheduled. Adding a new status would require a migration and domain change — not done in this pass.

---

## Files Changed

| File | Change |
|---|---|
| `lib/invoices/final-invoice.ts` | **New** — shared createDraftFinalInvoiceForJob |
| `app/api/v1/visits/[id]/transition/route.ts` | Use shared function, remove ~80 lines of inline SQL |
| `app/api/v1/jobs/[id]/transition/route.ts` | Use shared function, remove ~70 lines of inline SQL |
| `app/api/v1/estimates/[id]/transition/route.ts` | Add createJobFromEstimate call on approval |
| `app/api/v1/estimates/[id]/respond/route.ts` | Full rewrite: BEGIN/COMMIT, RLS context, job + artifacts |
| `app/api/portal/estimates/[token]/route.ts` | Add RLS context + createApprovalArtifacts |
| `app/app/booking-requests/[id]/ReviewActions.tsx` | Pass property_id in estimate URL |
| `app/app/booking-requests/[id]/page.tsx` | Add property_id to BookingRow type |
| `app/app/estimates/new/page.tsx` | Fetch more BR fields, richer notes prefill, property fallback |
| `lib/invoices/__tests__/final-invoice.unit.test.ts` | **New** — 5 tests for shared invoice function |
| `lib/estimates/__tests__/approval-artifacts.unit.test.ts` | **New** — 6 tests for approval idempotency + job creation |
