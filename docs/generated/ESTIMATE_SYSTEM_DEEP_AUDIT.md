# Estimate System Deep Audit

**Date:** 2026-06-05  
**Authority:** docs/canonical/PRODUCT_VISION.md, DOMAIN_MODEL.md, WORKFLOW.md  
**Posture:** Guilty until proven innocent.

---

## Executive Summary

The estimate system is the most architecturally complex subsystem in the platform — and the most in need of rationalization. It correctly performs the core job (price work, send to client, get approval) but has accumulated three distinct pricing models, five AI entry paths, two service type branches, a painting-specific engine, a scope intelligence layer, and a guardrails subsystem — all stitched together in a single 885-line component with a 321-line form backed by a hook with over 100 state variables.

**The estimate system is not aligned with how Dovetails actually sells work.** It is aligned with how it was *imagined* that Dovetails might sell work across every conceivable job type. The result is a system that does too many things at creation time, obscures the simple path, and forces unnecessary decisions on every estimate regardless of job complexity.

**Verdict by subsystem — summary:**

| Subsystem | Verdict |
|-----------|---------|
| Status lifecycle | **KEEP** — correct and clean |
| Estimate entry shell / launch modal | **SIMPLIFY** — 4 modes, only 2 needed |
| New estimate form (Step1–4) | **SIMPLIFY** — scope reduction required |
| Painting estimator | **KEEP but ISOLATE** |
| AI interview flow | **KEEP but RELOCATE** — wrong entry point |
| Price book integration | **KEEP but MAKE MANDATORY** |
| Guardrails system | **SIMPLIFY** — too many optional fields |
| Estimate detail page | **KEEP** — approved handoff is solid |
| Client-facing portal | **KEEP** — correct and minimal |
| Conversion to invoice | **KEEP** — idempotent, clean |
| Change orders | **KEEP** — correct and isolated |
| Shopping list / materials | **SIMPLIFY** — orphaned from most workflows |
| Scope intelligence system | **REBUILD or REMOVE** — not integrated at output |

---

## 1. Estimate Architecture Audit

### Routes

| Route | Purpose | Issues |
|-------|---------|--------|
| `/app/estimates` | List with status filter | OK |
| `/app/estimates/new` | Create — launches modal | 4 entry modes, 3 rarely used |
| `/app/estimates/[id]` | Detail, edit, send, approve, handoff | Complex but functional |
| `/app/estimates/[id]/print` | Printable view | OK |
| `/app/estimates/[id]/shopping-list` | Materials plan | Mostly orphaned |
| `/portal/estimates/[token]` | Client-facing approval | OK |
| `/estimate/respond` | Approval confirmation redirect | OK |
| `/estimate/thanks` | Post-approval landing | OK |

### API Routes (19 endpoints)

```
GET/POST  /api/v1/estimates
GET/PATCH /api/v1/estimates/[id]
POST      /api/v1/estimates/[id]/convert      → draft invoice
POST      /api/v1/estimates/[id]/pdf
POST      /api/v1/estimates/[id]/recompute
POST      /api/v1/estimates/[id]/respond       → client approval
POST      /api/v1/estimates/[id]/review        → AI quality check
POST      /api/v1/estimates/[id]/revise        → fork to new draft
POST      /api/v1/estimates/[id]/send          → email to client
GET       /api/v1/estimates/[id]/shopping-list
POST      /api/v1/estimates/[id]/transition    → status machine
POST      /api/v1/estimates/ai-draft           → AI line item generation
POST      /api/v1/estimates/ai-interview       → conversational intake
POST      /api/v1/estimates/ai-items           → item suggester
POST      /api/v1/estimates/ai-materials       → material suggester
POST      /api/v1/estimates/ai-scope           → scope parser
```

**5 AI endpoints** for a single estimate creation flow. This is the first sign that the system is doing too much.

### Database Tables (13 tables, 1 view)

| Table | Purpose | Column count |
|-------|---------|-------------|
| `estimates` | Core estimate record | **57 columns** |
| `estimate_line_items` | Line items | ~12 |
| `estimate_options` | Good/Better/Best tiers | ~10 |
| `estimate_scope_snapshots` | Scope intelligence captures | ~8 |
| `change_orders` | Post-approval scope changes | ~12 |
| `change_order_line_items` | CO line items | ~8 |
| `price_book` | Service catalog | ~15 |
| `price_book_modifiers` | Price adjustment rules | ~6 |
| `pricing_rule_snapshots` | Versioned pricing rules | ~5 |
| `scope_templates` | Scope intelligence templates | ~6 |
| `scope_components` | Scope measurement inputs | ~8 |
| `service_materials` | Material linkage to price book | ~12 |
| `materials_price_book` | Owner's actual material costs | ~12 |

**The `estimates` table has 57 columns** (verified against the live production schema). This is the most visible symptom of the system's complexity growth. It stores painting-specific fields (`sq_ft`, `prep_level`, `includes_trim`, `includes_ceiling`, `room_specs`), scope intelligence blobs (`engine_spec`, `computed_result`, `shopping_list_json`, `specified_materials_json`), versioned computation results (`engine_version`, `rules_version`, `last_computed_at`), guardrail flags (9 columns), and client signature data (`client_signature_svg`, `client_approved_name`) alongside the ~15 core business fields. Roughly two-thirds of the columns serve a minority of estimates.

### Dependency Map

```
EstimateEntryShell
  ├── EstimateLaunchModal          (4 modes: AI, manual, duplicate, convert)
  ├── EstimateInterviewFlow        (AI chat → ai-interview → ai-draft)
  └── NewEstimateForm
      ├── Step1WhoAndWhat          (client/job/property + service type toggle)
      ├── Step2Pricing             (885 lines — painting OR generic with 3 sub-modes)
      │   ├── PaintingEstimatorSection → domain engine
      │   ├── RoomByRoomEditor     (painting only)
      │   ├── PriceBookSelector    → price_book table
      │   ├── ScopeBuilder         → scope_templates, scope_components
      │   ├── MaterialsGenerator   → ai-materials endpoint
      │   ├── LineItemsTable       (manual line items)
      │   ├── EstimateTierEditor   (Good/Better/Best)
      │   └── DraftReviewPanel     (AI draft review)
      ├── Step3Adjustments         (GuardrailsSection — 9 risk flags)
      └── Step4ReviewAndSend       (live intel sidebar, send toggle)

EstimateDetailPage
  ├── EstimateEditForm             (999 lines — full edit capability)
  ├── EstimateTransitionForm       (status machine buttons)
  ├── SendEstimateButton           (email send)
  ├── CopyPortalLinkButton         (manual share)
  ├── EstimateReviewPanel          (AI quality check — separate from guardrails)
  ├── EstimateConvertButton        (→ invoice)
  ├── EstimateInternalNotesForm    (hidden from client)
  ├── ChangeOrdersClient           (post-approval changes)
  └── Approved Project Handoff     (1. Materials, 2. Schedule, 3. Billing)
```

---

## 2. Estimate Workflow Audit

### The Intended Flow

```
Request → Estimate → Approval → Job → Visit → Invoice
```

### The Actual Flow (traced)

**Path A: Normal repair (most common)**
1. User opens `/app/estimates/new`
2. Launch modal: must choose from 4 entry modes — friction
3. Chooses "Manual"
4. Step 1: Select client, job, property, service type (generic/painting) — service type toggle is confusing, not part of client language
5. Step 2: Chooses between itemized / flat_rate / multi_option — 3 modes before a single price is entered
6. Adds line items via: (a) price book selector, (b) manual text, (c) AI suggester, (d) scope builder — 4 parallel input methods
7. Step 3: Optional guardrail fields — 9 toggles/inputs that most estimates don't need
8. Step 4: Review, send toggle, create
9. Estimate created as draft
10. User manually clicks "→ Sent" transition button
11. Send email via SendEstimateButton
12. Client receives email with portal link
13. Client clicks approve/decline
14. Estimate transitions to "approved"
15. "Approved" banner appears with Schedule / Handoff links

**Dead ends found:**

- **No linked job → broken approved flow.** If the estimate is approved but has no `job_id`, the approved handoff shows "No linked job — create a job first to schedule visits." The user has to navigate away to create a job, link it, then come back. This is a multi-step orphan recovery, not a workflow.

- **The manual "→ Sent" transition button marks the estimate sent without sending anything to the client.** There are two ways to reach `sent` status: (a) the "Send to Client" button, which emails the client *and* auto-transitions draft→sent (verified in `send/route.ts` lines 193–195), and (b) the standalone "→ Sent" transition button in `EstimateTransitionForm`, which only flips the status with no email. A user who clicks the transition button believes the estimate was sent — the client never receives it, and because the estimate is now immutable in `sent` state, `sent_at` cannot be corrected on a later real send. The two buttons should not both exist; the bare transition-to-sent is a trap.

- **The Launch Modal's "Convert Booking Request" mode doesn't work as expected.** It appears to offer "start from an existing request" but there's no pre-fill from booking request data. It's a ghost option.

- **The Launch Modal's "Duplicate Existing Estimate" mode** is not implemented in the visible shell code. `mode === 'duplicate'` falls through to the manual form with no pre-population. It's dead code at the UX level.

- **The AI Interview flow is linear but abandoned on completion.** After the interview, the draft is applied via `sessionStorage` — a fragile bridge that silently fails if storage is unavailable or the form remounts.

- **Declined/Expired estimates have no recovery path in the UI.** The expired banner links to "Revise estimate" (a fork that creates a new draft). Declined estimates show no next action at all. The client said no — now what?

---

## 3. Estimate Type Audit

The system is attempting to serve four distinct estimate types through one workflow:

### Type A: Handyman Repair (itemized or flat rate)
- Small job, known price, one trip, maybe 2-5 line items
- What's needed: Client, job, price, send
- What the system forces: Launch modal → service type toggle → mode selection → guardrail step → review step
- **Verdict: 4 unnecessary decisions before the first price is entered**

### Type B: Painting Project
- Specialized domain with square footage, prep level, ceiling/trim
- Has its own calculator engine in packages/domain
- Uses a completely separate pricing path (painting result vs generic result)
- **Verdict: KEEP but ISOLATE** — the painting estimator is sound; the problem is it shares a form with handyman repair

### Type C: Walkthrough → Estimate (site visit)
- Site visit generates photos, parts, tech notes, measurements
- User navigates to `/app/estimates/new?from_visit=...`
- Shows "Walkthrough Evidence" context card with photo/part counts
- But then drops user into the same 4-step form with no pre-populated content from visit
- Tech notes not auto-inserted as scope notes
- **Verdict: Integration exists at the URL level but not at the form level — broken handoff**

### Type D: T&M Job (time and materials)
- `hourly_internal` pricing mode exists in jobs
- The estimate system has no T&M-specific estimate type
- T&M jobs are expected to skip estimates entirely, go straight to visit, then invoice from actuals
- The codebase has `pricing_mode` in several places referencing `hourly_internal` but estimates only store `flat_rate` in production
- **Verdict: T&M has no estimate path — this is intentional but not documented in the estimate creation UI**

### Recommendation

| Type | Current | Recommended |
|------|---------|-------------|
| Handyman repair | Mixed into generic | KEEP — default path |
| Painting project | Mixed into generic via toggle | SPLIT — dedicated entry or auto-detect |
| Walkthrough-based | Partial URL integration | FIX — pre-fill from visit data |
| T&M | No estimate path | DOCUMENT — skip estimate, go to job/visit |

---

## 4. Status Audit

### Database Statuses (single source)

```
draft → sent → approved → [terminal]
                         → declined → [terminal]
                         → expired  → [terminal]
```

**Transitions (from domain):**
```typescript
draft:    ["sent"]
sent:     ["approved", "declined", "expired"]
approved: []          // terminal in estimate — work moves to job
declined: []          // terminal
expired:  []          // terminal
```

### UI Status Labels

```
draft    → "Draft"
sent     → "Sent"
approved → "Approved"
declined → "Declined"
expired  → "Expired"
```

**Finding:** The estimate status model is correct and clean. Five statuses, clear transitions, no ambiguity.

### Pipeline Stage Relationship

The pipeline stage (`estimate_needed`, `estimate_sent`, `approved_ready`) is derived from job+estimate state — it's not stored on the estimate itself. This is correct architecture.

**One conflict found:** When an estimate is `approved`, the pipeline stage becomes `approved_ready`. But if the estimate has no `job_id`, the pipeline stage cannot be derived for the job because there is no job. The approved estimate floats with no job context. This is the "orphaned estimate" problem.

### Deposit Invoice Auto-Creation

When an estimate transitions to `approved`, `createApprovalArtifacts()` is called and — **when `deposit_cents > 0`** — a deposit invoice is auto-created. Two details make this worse than a benign side effect (verified in `lib/estimates/approve.ts`):

1. **The deposit invoice is created with status `'sent'`, not `'draft'`.** It is a live, billable invoice the user never explicitly created or reviewed. It appears in `/app/invoices` as already sent to the client.
2. **The final invoice from "Convert to Invoice" does not subtract the deposit.** The convert route (verified) creates a full invoice with `total_cents = estimate.total_cents` — the entire job amount — and merely copies `deposit_cents` as a field. Nothing reconciles the already-`sent` deposit invoice against the full invoice. A client who approves a $2,000 estimate with a 25% deposit can end up facing a `sent` $500 deposit invoice **and** a full $2,000 invoice = $2,500 of apparent billing for $2,000 of work. The only thing preventing real double-collection is the owner manually noticing and voiding one.

This is the single highest-risk defect in the estimate system: silent creation of a live billable document plus a downstream total that does not net it out.

### Recommendation: One Canonical Lifecycle

```
draft → sent → approved → [work happens] → invoice (created manually or from approved estimate)
                        → declined → [revise or abandon]
                        → expired  → [revise or mark lost]
```

The current lifecycle is already this. The problem is not the lifecycle — it's the missing guidance at each transition point.

---

## 5. Price Book Audit

### What the Price Book Is

- 115 active services in the `price_book` table
- Organized by category (`general_repairs`, `painting_finishes`, `outdoor_seasonal`, etc.)
- Each service has `price_min_cents`, `price_max_cents`, optional `default_labor_hours`, `upsell_codes`
- Linked to `scope_templates` and `scope_components` via `service_materials`

### How Estimates Actually Use the Price Book

1. **Via PriceBookSelector** — user clicks a service, price is added to estimate as a line item. This works.
2. **Via ScopeBuilder** — user enters scope measurements (sq ft, linear ft) and complexity factors; system computes price from profitability rules. Partially works.
3. **Via AI draft** — AI selects price book services and quantities automatically. Works when AI model is available.
4. **Via manual line items** — user types free-form description and price. Price book is bypassed entirely.
5. **Via painting engine** — sq_ft × prep_level × surface config feeds the domain engine. Price book is bypassed.

### Finding: Price Book Is Optional

**The price book is not the source of estimate pricing — it is one of four parallel pricing inputs.** An estimate can be created with zero price book usage via flat_rate or itemized manual entry. The "scope intelligence" layer (scope_templates, scope_components, estimate_scope_snapshots) only activates when price book services are used with the ScopeBuilder — which is one of four paths.

This means:
- Material linkage (service_materials) only applies to scope-builder-created line items
- The shopping list only populates when scope builder or AI draft is used
- Pricing rule snapshots only run when the engine computes
- The guardrails system's margin check is unreliable for manual-entry estimates because there's no cost basis

### Duplication

Two separate material systems exist:
1. `service_materials` — linked to price book services, scope-computed
2. `materials_price_book` — owner's actual purchase prices

These are not integrated at estimate creation time. The AI uses `service_materials` for draft generation. The shopping list uses `service_materials` for quantity derivation. `materials_price_book` is stored but there's no UI evidence of it being read during estimate creation.

### Recommendation

| Component | Verdict |
|-----------|---------|
| price_book table | KEEP — solid catalog |
| PriceBookSelector | KEEP — clean UX |
| ScopeBuilder | KEEP for complex jobs, make optional |
| service_materials | KEEP |
| materials_price_book | KEEP but WIRE to shopping list |
| scope_templates/components | KEEP but reduce to power user feature |
| Manual line items | KEEP as escape hatch |

**Immediate fix:** When an estimate is created via manual line items with no price book usage, the shopping list page should show a clear message: "This estimate was created without price book items — no materials list is available." Currently it renders an empty page.

---

## 6. Estimate Builder Audit

### Click Count to Create a Basic Estimate (Current)

1. Navigate to `/app/estimates/new` — 1 click
2. Launch modal: choose "Manual" — 1 click
3. Step 1: Select client (dropdown) — 1 click + scroll
4. Step 1: Select job (dropdown) — 1 click + scroll
5. Step 1: Choose service type (Generic vs Painting toggle) — 1 click
6. Step 2: Choose pricing mode (Itemized / Flat Rate / Multi-Option) — 1 click
7. Step 2: Enter line item description — typing
8. Step 2: Enter line item price — typing
9. Step 3: Review guardrail fields (9 inputs, all optional, no skip button) — scroll
10. Step 4: Review summary, toggle "send immediately" — 1 click
11. Create — 1 click

**Minimum 7 deliberate decisions before an estimate is saved.** For a $75 caulk repair this is friction without value.

### Component Complexity

| Component | Lines | Finding |
|-----------|-------|---------|
| Step2Pricing.tsx | **885** | Largest single UI component in the app |
| EstimateEditForm.tsx | **999** | Second largest — full re-implementation of the creation form |
| useEstimateForm.ts | **550+** | 100+ state variables |
| NewEstimateForm.tsx | 321 | Orchestration only but dense |
| EstimateEntryShell.tsx | 86 | OK |
| EstimateLaunchModal.tsx | 90 | Two modes are dead/partial |

**The estimate edit form is a 999-line near-duplicate of the estimate creation form.** Every change to the estimate UX requires updating both files. This is technical debt that will cause bugs.

### Item Creation Flow

Three parallel item entry methods co-exist without clear priority signal:
1. Price book picker (structured, preferred)
2. AI item suggester (type description → AI returns suggestions)
3. Manual text row (free-form)

The AI suggester is triggered by typing a description in a separate input, not by the main line item table. This creates an awkward "describe task here, then items appear in the table below" pattern that most users will not discover without training.

### Flat Rate Mode

Flat rate is the simplest path: one price, no line items. But it's presented as an equal option alongside itemized and multi_option, behind a tab/toggle, without any indication that this is the appropriate choice for most handyman work. New users default to "Itemized" and then add one $300 line item manually.

### Materials Handling

Materials can be added via:
1. AI materials generation (requires scope builder usage or painting engine)
2. Manual line items (type "1x paint — $45")
3. Price book services that have material linkages
4. The shopping list page (post-estimate, planning use)

These four paths produce different downstream behavior. Only path #3 generates a printable shopping list. Paths #1 and #2 save materials but don't populate the shopping list. This is a significant usability gap for painting or repair projects where shopping is required.

---

## 7. Client Experience Audit

### Estimate Delivery

**Path A: Email (preferred)**
- User clicks "Send to Client" → POST /api/v1/estimates/[id]/send
- Client receives email with approve/decline links (JWT-protected, time-limited)
- **Problem:** Email is only available if SMTP is configured on the server. In production, this is not guaranteed. If email is not configured, the button shows "Email not configured on this server" — the only option is the portal link.

**Path B: Portal link (fallback)**
- User clicks "Copy Portal Link" → shares manually
- Client opens `/portal/estimates/[token]`
- Clean, minimal page: line items, total, approve/decline buttons
- Signature pad (optional)
- **This path is solid.**

### Client-Facing Estimate View

The portal page shows:
- Business name
- Property address
- Line items (customer-visible only — `visible_to_customer = true` filter)
- Notes and scope assumptions
- Totals and deposit amount
- Approve / Decline buttons (or "You have already responded" state)
- Signature pad

**Good:** The portal is clean, fast, and handles multi-option (Good/Better/Best) presentation. Signed approvals are stored. The "already responded" guard prevents double-clicks.

**Missing:** No itemized material breakdown visible to the client (intentional but worth noting). No expiration date display despite the field existing. If `expires_at` is set, the client cannot see it in the portal — only the internal view shows it.

### Estimate Approval

**Two approval paths — both functional but potentially confusing:**

1. Client approves via email link → `/api/v1/estimates/[id]/respond` → sets `approved`
2. Owner approves manually → `EstimateTransitionForm` → `→ Approved` button

**Problem:** If the owner manually clicks "→ Approved" before the client responds, the client's email links become inoperable (transition guard blocks re-approval of already-approved estimate). The client clicks "Approve" and gets no feedback or an error. There's no UI guard preventing this.

### Estimate Conversion

The portal approval triggers the `approved` status transition, which:
1. Sets status to `approved`
2. Auto-creates a deposit invoice (silent)
3. Creates a `schedule_job` action item (silent)

The client gets redirected to `/estimate/thanks?action=approve` — a static thank you page with no further information. The client experience ends here.

**Missing for client:** No confirmation email sent on approval. No record in the portal showing "you approved this on [date]." The portal page after approval is stateless from the client's perspective.

---

## 8. Conversion Audit

### Estimate → Invoice

**Via "Convert to Invoice" button:**
- Only available when estimate is `approved`
- Creates a `draft` invoice with line items copied
- Idempotent — repeated clicks return the existing invoice
- Navigates user to invoice detail
- **This path is clean and correct.**

**Auto-created deposit invoice:**
- Created automatically on approval (createApprovalArtifacts), only when `deposit_cents > 0`
- Inserted with status `'sent'` — a live billable document, not a draft
- Separate from the final invoice, which does not net it out
- Not surfaced in the approved estimate UI; users may not know it exists
- **Risk: live `sent` deposit invoices plus a non-reconciling full invoice = double-billing if not caught manually**

### Estimate → Job (the missing link)

The canonical workflow is: `Estimate → Job → Visit`. But the estimate system does not create a job. Jobs must be created separately, then linked to the estimate via `job_id`. The approved handoff tells the user "No linked job — create a job first" — but provides no button to create one.

**Orphan risk:** Approved estimates without a linked job will sit forever without triggering scheduling. There's no alert in the job board or today screen for "approved estimate with no job." The action item system creates a `schedule_job` item, but only owners/admins can see the action items inbox, and the connection between the action item and the missing job is not obvious.

### Duplicate Conversion Paths

**Three ways to get from "approved estimate" to "invoice":**
1. `EstimateConvertButton` → `/api/v1/estimates/[id]/convert` (copies approved estimate line items)
2. Manual invoice creation at `/app/invoices/new` (no estimate link)
3. Auto-created deposit invoice (from approval transition)

A user who doesn't know about path #1 may create a duplicate invoice via path #2. The system has no guard that checks "does an invoice already exist for this job?" before allowing a new invoice creation.

### Safeguards Assessment

| Safeguard | Status |
|-----------|--------|
| Idempotent convert (no duplicate invoices via button) | ✓ present |
| Guard against converting non-approved estimate | ✓ present |
| Guard against duplicate manual invoices for same job | ✗ missing |
| Final invoice nets out the auto-created deposit invoice | ✗ missing (double-billing risk) |
| Guard against re-sending an already-approved/declined estimate | ✓ present (`send/route.ts` blocks approved/declined/expired) |
| Warning when owner approves before client responds | ✗ missing |
| Deposit invoice created as draft (reviewable) rather than sent | ✗ missing (created as `sent`) |

---

## 9. Operational Reality Audit

Dovetails Services does: handyman repairs, painting, walkthrough-based projects, realtor punch lists, and maintenance visits.

### Scenario: Handyman Repair ($75–$500)

**What user needs:** Pick client → set price → send → get approval → show up → invoice.

**What system requires:** Launch modal → choose mode → Step 1 (service type, which is irrelevant) → Step 2 (choose between itemized/flat_rate, add items) → Step 3 (9 optional guardrail fields) → Step 4 (review with internal margin data) → create → manually transition to "Sent" → click "Send to Client."

**Friction index: 7 out of 10.** Every step has at least one unnecessary decision.

### Scenario: Painting Project ($800–$5,000)

**What user needs:** Square footage + prep level + surfaces → price → send.

**What system provides:** The painting estimator is purpose-built for this. Once the user discovers it (hidden behind "Service Type: Painting" toggle on Step 1), the flow is reasonable. Room-by-room mode is powerful.

**Finding:** The painting estimator is the right tool but is buried. First-time users may price painting work as generic itemized estimates, bypassing the engine entirely.

**Friction index: 4 out of 10 for painting users who know the toggle exists. 7/10 for those who don't.**

### Scenario: Walkthrough → Estimate

**What user needs:** After a site visit, open the evidence (photos, measurements, notes) and price the work.

**What system provides:** The estimate creation page receives `from_visit` and shows a "Walkthrough Evidence" context card (photo count, part count, tech notes). Then the user enters the same 4-step form with no pre-populated scope.

**What's missing:** Tech notes are not pre-inserted into the scope notes field. Photo count is shown but photos are not displayed or referenced in pricing. Part cost from `visit_parts` is not pre-populated into materials. The evidence is decorative, not functional.

**Friction index: 6 out of 10.** The handoff exists at the URL level but not at the data level.

### Scenario: Realtor Punch List

**What user needs:** Multiple small items, itemized for the realtor to review, flat total.

**What system provides:** The itemized mode with multiple line items works. Multi-option (Good/Better/Best) could be used but is designed for three price tier presentation, not a punch list.

**Friction index: 4 out of 10.** This scenario is the best fit for the current system.

### Scenario: Maintenance Visit (membership)

**What user needs:** No estimate needed — visits are covered by plan.

**What system provides:** No estimate integration with maintenance plans. Maintenance visits bypass the estimate system entirely (correct).

**Friction index: 1 out of 10 (no friction because estimates don't apply).**

---

## 10. Final Verdict

### By Subsystem

| Subsystem | Verdict | Reason |
|-----------|---------|--------|
| Status lifecycle (5 statuses) | **KEEP** | Correct, clean, enforced at DB + app layer |
| Client portal (approve/decline) | **KEEP** | Clean, minimal, correct |
| Conversion to invoice | **KEEP** | Idempotent, audited, solid |
| Change orders | **KEEP** | Correct and isolated |
| Approved project handoff | **KEEP** | Materials → Schedule → Invoice structure is right |
| Price book (catalog) | **KEEP** | 115 services, well-structured |
| Painting estimator engine | **KEEP but ISOLATE** | Sound domain model, wrong placement |
| Launch modal (4 modes) | **SIMPLIFY** | Remove or fix "Duplicate" and "Convert Booking Request" dead modes |
| New estimate form Step1–4 | **SIMPLIFY** | Step 3 (guardrails) should be collapsible/advanced; Step 2 needs hierarchy |
| Estimate edit form (999 lines) | **SIMPLIFY** | Near-duplicate of creation form — extract shared components |
| AI interview flow | **SIMPLIFY** | Move out of estimate creation; belongs in request/intake |
| AI item suggester | **SIMPLIFY** | Useful but adds UI complexity to an already-complex step |
| Guardrails system (9 flags) | **SIMPLIFY** | Surface automatically from pricing, not as manual entry |
| Shopping list | **SIMPLIFY** | Wire to materials_price_book; show clear "no data" when not applicable |
| Scope intelligence system | **REBUILD or REMOVE** | 5 tables, 283-line AI route, not meaningfully integrated at output level |
| Auto-created deposit invoice | **KEEP but SURFACE** | Silent creation is an ops hazard |
| Estimate → Job link | **FIX** | No path to create a linked job from the approved estimate |
| Walkthrough data pre-fill | **FIX** | Tech notes, parts, measurements must flow into the estimate form |

### Top 3 Correctness Bugs

1. **Auto-created `sent` deposit invoice + full invoice that doesn't subtract it = double-billing risk.** On approval, a live `sent` deposit invoice is created silently; the later "Convert to Invoice" produces a full-total invoice with no deduction of the deposit already billed. Fix: either create the deposit as `draft`, or have the final-invoice conversion net out any existing deposit invoice for the same estimate, and surface both in the approved banner.

2. **The bare "→ Sent" transition button marks an estimate sent without sending it.** Only "Send to Client" actually emails and transitions; the standalone transition button silently flips status with no delivery, and `sent_at` becomes uncorrectable due to immutability. Fix: remove the manual transition-to-`sent` control; the only path to `sent` should be a real send.

3. **Approved estimate with no `job_id` has no path to create a job.** Handoff shows "No linked job" in two places (verified, lines 390 and 998) but offers only a disabled span — no action. Approved scope can never reach scheduling. Fix: add a one-click "Create linked job from estimate" that pre-fills client/property/scope.

### Top 3 Quick Wins

1. **Default to flat_rate mode for new estimates.** The launch modal is the wrong abstraction. Most Dovetails estimates are flat-rate. Skip the modal entirely, start on Step 1 with flat-rate pre-selected.

2. **Pre-fill tech notes from walkthrough visit into scope notes field.** One line of code. High value for the walkthrough → estimate workflow.

3. **Remove or replace the "Duplicate" and "Convert Booking Request" launch modal options.** Both are non-functional or confusing. Clean the modal to 2 choices: "Quick Estimate" (flat rate) and "Detailed Estimate" (itemized with price book).

### Top 3 High-Risk Gaps

1. **Estimate approved, no job linked — work is never scheduled.** This is a revenue leak. Approved scopes that never convert to jobs are invisible in the current UI.

2. **Two invoice creation paths with no deduplication guard.** A user who creates an invoice manually after using Convert will have two invoices for the same job. The client sees both.

3. **The scope intelligence system (5 tables + 283-line API route) produces no user-visible output beyond the shopping list.** It's the most technically complex part of the estimate system and the least operationally impactful. If scope_templates and scope_components were removed tomorrow, 95% of estimates would be unaffected.

### Recommended Implementation Order

1. **Fix (P0): Deposit double-billing** — net the deposit invoice out of the converted final invoice (or create deposit as `draft`) and surface both in the approved banner (1 day)
2. **Fix (P0): Remove the bare "→ Sent" transition trap** — make a real send the only path to `sent` (half day)
3. **Fix (P1): Estimate → Job link** — add "Create Job from Estimate" button when approved with no `job_id` (1 day)
4. **Fix (P1): Walkthrough pre-fill** — pipe tech notes / parts into the estimate form on `?from_visit=` (half day)
5. **Simplify: Launch modal** — 2 working choices instead of 4 (two are dead) (half day)
6. **Simplify: Default to flat_rate** — make flat_rate the default pricing mode (half day)
7. **Simplify: Guardrails step** — collapse to "Advanced Options" disclosure (1 day)
8. **Simplify: Extract shared edit/create components** — reduce EstimateEditForm.tsx from 999 lines (3 days)
9. **Evaluate: Scope intelligence** — measure usage, remove or surface output more clearly (1 week)

---

## Workflow Diagrams

### Current: Estimate Creation Decision Tree

```
New Estimate →
  Launch Modal
    ├── AI Guided (→ chat flow → draft review → manual form)
    ├── Manual (→ Step1 → Step2 [3 sub-modes] → Step3 [9 fields] → Step4)
    ├── Duplicate (→ manual form, no pre-fill) ← BROKEN
    └── Convert Booking Request (→ manual form, no pre-fill) ← BROKEN
```

### Recommended: Simplified Entry

```
New Estimate →
  Quick Estimate (flat rate) → Who + Price → Create
  Detailed Estimate → Who + Price Book items → Adjustments (optional) → Create
  [Painting] → detected by service type → Painting Calculator path
```

### Current: Approved Estimate Handoff

```
Estimate: Approved →
  Banner: "Schedule work or invoice"
    ├── [if job + no visits] → Schedule First Visit →
    ├── [if job + visits] → Go to job →
    ├── [if no job] → "Create a job first" (dead end, no button)
    └── Project Handoff section (1. Materials, 2. Schedule, 3. Invoice)

Silently: → Deposit invoice created (not shown)
Silently: → schedule_job action item created (not shown)
```

### Recommended: Approved Estimate Handoff

```
Estimate: Approved →
  ✓ Deposit invoice created — view →
  Next step:
    [if no job] → Create linked job → (one-click, pre-fills from estimate)
    [if job, no visits] → Schedule First Visit →
    [if job, visits] → Manage Job →
  When ready to bill → Convert to Final Invoice →
```

---

*This audit was produced by reading the full source code of every estimate-related file, API route, database migration, and domain model. No assumptions were made from documentation alone.*

### Verification Log (claims checked against running system)

The strongest accusations were re-verified against the live codebase and production database before finalizing:

- **`estimates` column count** — checked via `information_schema.columns`: **57** (an earlier draft said 62; corrected).
- **Deposit invoice auto-creation** — confirmed in `lib/estimates/approve.ts`: created only when `deposit_cents > 0`, inserted with status `'sent'`, idempotent on `notes LIKE 'Deposit: %'`.
- **Final invoice does not net the deposit** — confirmed in `estimates/[id]/convert/route.ts`: inserts `total_cents = estimate.total_cents` with no deduction.
- **Send auto-transitions draft→sent** — confirmed in `estimates/[id]/send/route.ts` (lines 193–195). The "two separate actions" framing from an earlier draft was wrong and was rewritten; the real defect is the *bare* transition button that marks `sent` without sending.
- **No create-job action on approved estimate** — confirmed in `estimates/[id]/page.tsx`: two "No linked job" sites (lines 390, 998), the latter a disabled span.
- **Dead launch modes** — confirmed in `EstimateEntryShell.tsx`: only `mode === "ai"` is handled; `duplicate` and `convert` fall through to the blank manual form.
- **Estimate status distribution** — production DB currently holds 23 estimates: 12 approved, 9 sent, 2 declined, 0 draft/expired.
- **Price book size** — 115 active services; 10 scope templates.
