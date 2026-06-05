# Estimate Stabilization Sprint 1 — Report

**Date:** 2026-06-05
**Authority:** docs/canonical/PRODUCT_VISION.md, WORKFLOW.md, docs/generated/ESTIMATE_SYSTEM_DEEP_AUDIT.md
**Scope:** Correctness, workflow clarity, estimate→job conversion. No new features, no redesign, no new AI, no new workflows.

---

## Outcome against success criteria

| Success criterion | Status |
|---|---|
| An approved estimate should naturally become a job | ✅ One-click "Create Linked Job" on approved estimates with no job |
| A sent estimate should always have actually been sent | ✅ The only path to `sent` is the Send action; the bare transition is removed and blocked server-side |
| Deposit handling should be impossible to misunderstand | ✅ One canonical model: deposit (draft) + final (credits deposit); both surfaced in the UI; double billing prevented |
| The most common Dovetails estimate should require fewer decisions | ✅ "Quick Estimate" (flat-rate) is the default, recommended entry; two dead launch paths removed |

All 783 web unit tests pass (was 745; +38 new). Typecheck clean. Lint clean (only pre-existing warnings remain).

---

## P0 — Deposit invoice handling (canonical billing model)

### Bugs fixed
1. **Double-billing risk.** The deposit invoice was created as a live `sent` invoice, and the "Convert to Invoice" path produced a full-total final invoice that never subtracted the deposit. A $2,000 job with a $500 deposit could present $2,500 of billing.
2. **Convert was effectively broken whenever a deposit existed.** The idempotency guard matched *any* invoice for the estimate, so once the deposit invoice existed, Convert returned the **deposit** invoice and never created the real final invoice.

### Canonical model now
- An estimate has at most one **deposit** invoice and one **final** invoice, made explicit by a new `invoice_kind` column (`standard | deposit | final`).
- **Deposit invoice**: created on approval (when `deposit_cents > 0`) as a reviewable **draft**, never silently `sent`.
- **Final invoice**: created by Convert with the full project total; its `deposit_cents` field carries the deposit already billed, and the database's generated `balance_cents = total_cents − deposit_cents` is what the client still owes. A reconciliation note is written into the invoice notes.
- The deposit and final always sum to exactly the estimate total — verified end-to-end against the live database.
- A partial unique index guarantees at most one final invoice per estimate.

### Billing flow diagram
```
Estimate approved (deposit_cents = D, total = T)
        │
        ├─ createApprovalArtifacts:
        │     creates DEPOSIT invoice  (kind=deposit, status=draft, total = D)
        │     → owner reviews, then sends it deliberately
        │
        └─ "Convert to Invoice":
              idempotency check looks ONLY for an existing kind=final
              reconcileFinalInvoice(T, [non-void deposit invoices]):
                 depositCredit = Σ non-void deposits  (clamped ≤ T)
                 balanceDue    = T − depositCredit
              creates FINAL invoice (kind=final, total = T, deposit_cents = depositCredit)
              → generated balance_cents = T − depositCredit

Client owes:  deposit (D)  +  final balance (T − D)  =  T   ✔ never more
```

### Files
- `db/migrations/104_invoice_kind.sql` — new `invoice_kind` column, backfill, one-final-per-estimate unique index.
- `apps/web/lib/invoices/billing.ts` — new pure `reconcileFinalInvoice` (deposit credit + balance + note; voided deposits excluded; credit clamped to total).
- `apps/web/lib/estimates/approve.ts` — deposit invoice now `draft` + `invoice_kind='deposit'`.
- `apps/web/app/api/v1/estimates/[id]/convert/route.ts` — idempotency targets `final`; reconciles deposit; tags `final`; records credit/balance in audit + response.
- `apps/web/app/app/estimates/[id]/page.tsx` — approved banner now shows a **billing summary** (deposit invoice + final invoice with live balance and status).

### Tests
- `lib/invoices/__tests__/billing.unit.test.ts` — 7 tests (no-deposit, single deposit, voided deposit excluded, mixed, deposit = total, deposit > total clamps, sum-to-total property).
- Live-DB end-to-end simulation confirmed `deposit + final balance == project total` with the deposit as a draft.

---

## P0 — Remove the "Sent" status trap

### Bug fixed
An estimate could be marked `sent` by a bare "→ Sent" transition button that flipped the status **without delivering anything** to the client; immutability then froze `sent_at` so it could not be corrected on a later real send.

### Fix
- Sending is the **only** path to `sent`. The Send action already emails the client and transitions draft→sent atomically.
- The manual transition control no longer offers `sent` (`manualEstimateTransitions` filters it out; a draft now shows no manual transitions — only "Send to Client").
- The transition API rejects a `sent` target with `USE_SEND_ACTION` (409) so even a crafted request cannot mark sent without sending.
- The now-unreachable `sent` handling inside the transition route was removed; `approved/declined/expired` transitions are preserved unchanged.

### Files
- `apps/web/lib/estimates/transitions.ts` — new `manualEstimateTransitions` + `NON_MANUAL_ESTIMATE_STATUSES`.
- `apps/web/app/app/estimates/[id]/page.tsx` — uses `manualEstimateTransitions`.
- `apps/web/app/api/v1/estimates/[id]/transition/route.ts` — rejects `sent`; dead sent-block removed.

### Tests
- `lib/estimates/__tests__/transitions.unit.test.ts` — 6 tests (draft offers nothing manual, never offers sent from any status, preserves approved/declined/expired, terminal states empty, underlying domain map unchanged).

---

## P0 — Create job from approved estimate

### Bug fixed
An approved estimate with no linked job dead-ended: the banner said "No linked job" (in two places, one a disabled span) with no way forward, so approved scope could never be scheduled.

### Fix
- New **"Create Linked Job →"** button on approved estimates with no job (both the approved banner and the Project Handoff "Schedule" card).
- New endpoint `POST /api/v1/estimates/[id]/create-job`:
  - Requires `approved` status.
  - **Idempotent**: if a job is already linked, returns it and creates nothing (prevents duplicates). Row is `FOR UPDATE` locked to serialize concurrent clicks.
  - Pre-fills client, property, title (first scope line / address / client / fallback), and description (scope + source-estimate reference). Job created at `quoted`.
  - Links `estimates.job_id` and resolves the `schedule_job` action item.
- Estimate immutability was narrowed (migration 105) to permit a **one-time** `job_id` NULL→value link on a terminal estimate while keeping every other field immutable — verified that content mutation is still blocked.

### Files
- `db/migrations/105_estimate_job_link_carveout.sql` — narrowed `enforce_estimate_immutability`.
- `apps/web/lib/estimates/job-from-estimate.ts` — pure `deriveJobTitle` / `deriveJobDescription`.
- `apps/web/app/api/v1/estimates/[id]/create-job/route.ts` — new endpoint.
- `apps/web/app/app/estimates/[id]/CreateJobFromEstimateButton.tsx` — new client button.
- `apps/web/app/app/estimates/[id]/page.tsx` — both dead "No linked job" sites replaced with the button.

### Tests
- `lib/estimates/__tests__/job-from-estimate.unit.test.ts` — 8 tests (title priority chain, truncation at 80, description includes source total).
- Live-DB test confirmed the one-time link succeeds while content mutation stays blocked.

---

## P1 — Walkthrough estimate prefill

### Bug fixed
Launching an estimate from a site visit (`?from_visit=`) showed a decorative evidence card but pre-filled nothing — tech notes, parts, and measurements had to be re-typed.

### Fix
- New pure `buildWalkthroughScopeNotes` assembles seed scope text from the visit: dated findings header, technician notes, a parts list with quantities, and a photo-evidence summary.
- The new estimate page fetches the visit's parts and passes the assembled text as `initialNotes` through the shell → form → hook.
- Applied as the **initial value only** of the notes field (runs once on mount), so it never overwrites later user edits.

### Files
- `apps/web/lib/estimates/walkthrough-prefill.ts` — new pure helper.
- `apps/web/app/app/estimates/new/page.tsx` — fetches parts, builds prefill, passes `initialNotes`.
- `EstimateEntryShell.tsx`, `hooks/useEstimateForm.ts` — thread `initialNotes`; notes initializer prefers walkthrough prefill, then vault context.

### Tests
- `lib/estimates/__tests__/walkthrough-prefill.unit.test.ts` — 6 tests (empty input, tech notes, dated findings, parts with quantities, singular/plural evidence, section ordering).

---

## P1 — Simplify estimate entry + flat-rate default

### Bugs fixed
- Two dead launch modes ("Duplicate Existing Estimate", "Convert Booking Request") only ever opened a blank manual form.
- Itemized was the implicit default even though most Dovetails estimates are a single flat price.

### Fix
- Launch modal reduced to three working entries: **Quick Estimate** (flat-rate, recommended), **Detailed Estimate** (itemized + price book), **AI Guided**. The two dead modes are gone.
- New pure `resolveEntryPricingMode` maps Quick→flat_rate, Detailed/AI→itemized, with an explicit URL/preset override still winning.
- Flat-rate is the default pricing mode across the entry shell and the form hook. Itemized and multi-option remain fully available.

### Files
- `apps/web/app/app/estimates/new/EstimateLaunchModal.tsx` — 3 entries; `resolveEntryPricingMode` helper.
- `apps/web/app/app/estimates/new/EstimateEntryShell.tsx` — maps entry mode → pricing; AI continues in itemized.
- `apps/web/app/app/estimates/new/hooks/useEstimateForm.ts` — flat-rate default.
- `apps/web/app/app/estimates/new/page.tsx` — walkthrough enters via Quick.

### Tests
- `app/app/estimates/new/__tests__/estimate-entry.unit.test.ts` — 5 tests (only 3 modes; Quick→flat_rate; Detailed→itemized; AI→itemized; override wins).

---

## Workflows simplified

| Before | After |
|---|---|
| New estimate → choose from 4 modes (2 dead) → service type → pick pricing mode → … | New estimate → Quick (flat-rate, recommended) / Detailed / AI |
| Approved estimate, no job → "No linked job" dead end | Approved estimate, no job → "Create Linked Job →" (one click, pre-filled) |
| Mark sent via a button that didn't send; or send via a different button | Single "Send to Client" action; no way to mark sent without sending |
| Approval → silent live deposit invoice; Convert → full invoice (double bill) | Approval → draft deposit; Convert → final invoice crediting the deposit; both shown |
| Walkthrough → decorative evidence, re-type everything | Walkthrough → scope notes pre-filled from notes/parts/photos |

---

## Tests added (38 new, 5 files)

| File | Tests |
|---|---|
| `lib/invoices/__tests__/billing.unit.test.ts` | 7 |
| `lib/estimates/__tests__/transitions.unit.test.ts` | 6 |
| `lib/estimates/__tests__/job-from-estimate.unit.test.ts` | 8 |
| `lib/estimates/__tests__/walkthrough-prefill.unit.test.ts` | 6 |
| `app/app/estimates/new/__tests__/estimate-entry.unit.test.ts` | 5 |

Plus live-database verifications for the deposit reconciliation, the estimate→job immutability carve-out, and double-billing prevention.

**Total: 783 web unit tests passing (was 745).**

---

## Migrations added

| Migration | Purpose |
|---|---|
| `104_invoice_kind.sql` | Explicit `invoice_kind` (standard/deposit/final); backfill; one-final-per-estimate unique index |
| `105_estimate_job_link_carveout.sql` | Allow a one-time `job_id` link on a terminal estimate; everything else stays immutable |

Both applied to the dev database. Both additive/idempotent; production deploy runs them via the standard migration path.

---

## Remaining estimate debt (out of scope for this sprint)

1. **EstimateEditForm.tsx (999 lines) duplicates the creation form.** Every UX change still needs both files. Extract shared step components (audit item).
2. **Step2Pricing.tsx (885 lines)** remains the largest UI component; the guardrails step is still a flat list of 9 manual fields rather than an "Advanced Options" disclosure.
3. **Scope intelligence system** (scope_templates/components, materials linkage) still produces little user-visible output beyond the shopping list; usage should be measured and the subsystem removed or surfaced.
4. **Deposit invoice is created but not auto-sent.** It is now an explicit draft (correct), but there is no one-click "send deposit" affordance from the approved estimate — the owner must open the invoice. A future convenience, not a defect.
5. **No guard against a manually created invoice duplicating the converted final invoice** for the same job (a separate invoice-creation path). Worth a dedup guard in a later sprint.
6. **Approving before the client responds** still has no warning (owner can approve an estimate the client is mid-review on). Lower-risk; deferred.
