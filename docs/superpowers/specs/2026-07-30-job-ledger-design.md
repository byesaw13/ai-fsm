# Job Ledger — Design Spec

**Date:** 2026-07-30  
**Status:** Approved (Approach A — ledger on project page)  
**Roadmap:** Phase 3 — Estimate & Billing Closure (EPIC-004 billing)  
**Related:** Claremont T&M reconciliation (EST-2026-0016 / CO-001 draft),  
`docs/superpowers/specs/2026-07-14-job-materials-receipt-review-design.md`,  
`docs/superpowers/specs/2026-07-20-invoice-deposit-policy-design.md`,  
`docs/working/claremont-change-order-CO-001-draft.md`,  
`docs/working/claremont-CO-001-exhibit-materials-schedules.md`  

---

## Goal

Put the **customer commercial story** on the project (`/app/jobs/[id]`) so estimate vs actual, billable hours, materials vs allowance, lift, deposits, and change-order drafting are **findable and navigable without AI**.

v1 means: open the job → read one **Job Ledger** → draft a change order or invoice from live variance. It does **not** auto-send client documents or replace internal P&L math.

---

## Problem

Everything needed for a T&M money conversation already exists in the system, but is **scattered**:

| Fact | Today’s home | Gap |
|------|----------------|-----|
| Estimate / allowances | Estimate detail | Linked from job, not compared to actual |
| Deposit | Invoice list / deposit invoice | Overview cell only; not netted into a balance |
| Hours by day | Tracked work days | Hours only — **not × customer rate** |
| Materials purchased | Job Materials panel | Receipt dump — **no vs allowance** |
| Materials plan | Estimate shopping list | Never meets spend on one surface |
| Change orders | Estimate `#change-orders` | Storage is right; **discovery is wrong** |
| Margin | Profitability card | **Internal burdened cost**, not client bill |

Claremont required an AI session to assemble what a single ledger should show in one glance: labor @ $115, materials over $1,500 allowance, lift under $2,000, deposit, CO draft with Schedule A/B.

**Root cause:** The job has a *document index* (Commercial links) and an *internal cost card* (Profitability), but no **customer commercial ledger**.

---

## Principles

1. **Project is the money home.** Estimates, invoices, and change orders are *artifacts*. The ledger is the *spine*.
2. **Compose, don’t invent.** Ledger rows are projections of estimate lines, `job_work` activity, job-linked expenses, paid invoices, and change orders.
3. **Customer rates for the ledger; cost rates for P&L.** Ledger uses billable T&M / allowance lines. Existing Profitability stays as collapsed **Internal P&L**.
4. **Robot proposes; human confirms.** “Draft CO from variance” pre-fills a **draft** only. No auto-send.
5. **One place to look.** No new sidebar section. No dedicated money route required for v1 (optional deep-link anchors only).
6. **YAGNI.** No SKU-matching plan↔receipt engine, no client portal ledger, no second inventory system in v1.

---

## Locked product decisions

| Decision | Choice |
|---|---|
| Placement | **Job Ledger card on `/app/jobs/[id]`** (Approach A) — under Overview / What next; replaces thin Commercial list as the primary money surface |
| Dedicated `/money` page | **Not v1** — drill-downs use existing estimate / expense / invoice / CO pages |
| Audience | Owner/manager (same visibility gate as today’s Profitability); techs do not need ledger |
| Primary estimate | Approved estimate on the job when present; else latest sent/draft with clear “not approved” badge |
| Multi-estimate | v1: one **active commercial estimate** (approved preferred). List others as links only |
| Pricing modes | **T&M (`hourly_internal`)**: full ledger. **Flat rate**: ledger shows sold total + change orders + deposits + materials spend (labor actual optional for internal awareness only) |
| Labor actual | Closed `job_work` activity minutes → hours; display both raw and (for invoice draft) quarter-hour rounded where billing uses it |
| Labor rate | From estimate labor line unit price when present; else domain `LABOR_CUSTOMER_RATE_CENTS_PER_HOUR` |
| Materials actual | Sum of job-linked expenses in materials category (existing `fetchJobMaterialExpenses`) |
| Materials estimate | Materials **allowance** line(s) on the commercial estimate (not full shopping-list MSRP unless no allowance line) |
| Lift / equipment | Estimate lift/access **allowance** line vs expenses tagged `equipment` (or category/heuristic match in v1) |
| Deposits | Paid deposit invoices (and other paid amounts on the job) subtract from “to collect” |
| Change orders | Remain `estimate_id`-scoped (existing table). Job ledger **lists and drafts** them; does not re-parent to job |
| CO draft action | Prefill draft CO from positive variance (materials overage default; optional labor over budget) |
| Materials A/B | Lightweight **commercial tags** on expenses (or expense lines) — not a new materials module |
| Internal P&L | Keep today’s cost/margin card, **collapsed** under or beside ledger, labeled Internal P&L |

---

## Non-goals (v1)

- Client portal ledger or public CO PDF polish beyond existing CO UI
- Auto-approve or auto-send change orders / invoices
- Perfect matching of shopping-list SKUs to receipt line items
- Replacing `visit_parts` / internal cost rates
- Full multi-currency or multi-rate crew bill rates
- New top-level app navigation item
- Automatic “condition found on site” narrative generation beyond a short form stub

---

## Information architecture

```
/app/jobs/[id]
├── Overview            Estimate | Deposit | Invoice | Field | Tasks | WOs  (existing cells; keep)
├── What next           Stage engine (existing)
├── ★ Job Ledger        Estimate vs actual, deposits, balance, Draft CO / Draft invoice
│     ├── Labor         → tracked days + billable $
│     ├── Materials     → receipts + allowance + A/B tags
│     ├── Equipment     → lift vs allowance
│     ├── Change orders → list + draft from variance
│     └── Invoices      → deposits + finals (links)
├── Tracked work days   Keep; add billable $ column when ledger rate known
├── Materials panel     Keep; enhance with allowance remaining + tags
├── Internal P&L        Today’s profitability (cost margin), collapsed
└── Field spine         WOs, tasks, visits — unchanged
```

**Success criterion:** On a Claremont-class job, open the project → read the ledger → draft CO — **zero chat**.

---

## UI design

### Header strip (always visible when ledger has a commercial estimate or any actuals)

```
{EST number} · {T&M $rate/hr | Fixed bid} · {status}
Sold $X  ·  Actual to date $Y  ·  Paid $Z  ·  Balance $B
[ Draft CO from variance ]  [ Draft invoice ]
```

- **Sold** = original estimate commercial total + approved CO totals  
- **Actual** = sum of ledger actual column (labor billable + materials + equipment + other tagged billables)  
- **Paid** = sum of paid invoice amounts on the job (deposits + progress + final)  
- **Balance** = Actual − Paid (T&M live) or Sold − Paid when flat and no actuals billed yet  

Buttons:

- **Draft CO from variance** — enabled when materials (or selected labor) variance > 0 and an approved estimate exists; creates draft via existing change-order API  
- **Draft invoice** — deep-link to existing invoice create with `job_id` (+ approved estimate when present)

### Main grid

| Bucket | Estimate (sold) | Actual | Variance | Cue |
|--------|-----------------|--------|----------|-----|
| Labor | hrs × rate (budget + cap if present) | tracked hrs × rate | Δ hrs / $ | “Under cap” / “Over budget” |
| Materials | allowance $ | receipt sum $ | Δ $ | “Over allowance” |
| Lift / equipment | allowance $ | tagged spend $ | Δ $ | |
| Other (optional) | — | tagged spend | | |
| **Subtotal** | | | | |
| Paid / deposits | | −$ | | link to invoice |
| **To collect** | | | | |

Rows expand or link:

- Labor → `#tracked-work-days` (or in-card expand)  
- Materials → materials panel / expenses  
- Lift → filtered expenses  
- Variance badge when |variance| exceeds a soft threshold (default: any materials overage, or labor past budget but under cap = info; past cap = warning)

### Empty / partial states

| State | UI |
|-------|-----|
| No estimate, no actuals | Hide ledger or show “No commercial estimate yet” + Create estimate |
| Estimate only | Show sold column; actual zeros; no CO draft |
| Actuals only (rare) | Show actual; estimate “—” |
| Flat rate in progress | Sold = estimate total; actual materials optional; labor actual in Internal P&L only unless owner enables “show labor actual on ledger” (default off for flat) |

---

## Domain model (compose layer)

### New pure helper (domain or `apps/web/lib/jobs/`)

```ts
// Conceptual shape — names may match repo conventions
type JobLedgerBucket =
  | "labor"
  | "materials"
  | "equipment"
  | "other";

type JobLedgerRow = {
  bucket: JobLedgerBucket;
  label: string;
  estimateCents: number | null;
  estimateHours: number | null;      // labor
  estimateCapHours: number | null;   // labor T&M max
  actualCents: number;
  actualHours: number | null;
  varianceCents: number | null;
  rateCentsPerHour: number | null;   // labor
};

type JobLedgerSummary = {
  jobId: string;
  estimateId: string | null;
  pricingMode: "flat_rate" | "hourly_internal" | null;
  soldCents: number | null;       // estimate + approved COs
  actualCents: number;
  paidCents: number;
  balanceCents: number;
  rows: JobLedgerRow[];
  changeOrders: { id: string; numberOrTitle: string; status: string; totalCents: number }[];
  suggestedCoCents: number;       // materials overage (+ optional labor over budget)
};
```

**Computation rules (v1):**

1. **Pick commercial estimate:** approved on job → else latest non-declined linked estimate (badge if not approved).  
2. **Classify estimate lines** into buckets via existing completion-criteria / pricing prose heuristics + line item type when present:
   - Labor / T&M budget → labor  
   - Materials allowance → materials  
   - Lift / equipment allowance → equipment  
   - Everything else sold → other (or roll into sold total only)  
3. **Labor actual cents** = `trackedHours × customerRate` (display); invoice path may continue to use quarter-hour rounding.  
4. **Materials actual** = sum `amount_cents` of job materials expenses.  
5. **Equipment actual** = sum of expenses with commercial tag `equipment` (or category equipment if already exists).  
6. **Approved COs** add their `total_cents` into **Sold** (not into Actual — actual is field truth).  
7. **Suggested CO** default lines = materials actual − materials allowance (if > 0); optional second line labor actual − labor budget if > 0 and under/over cap called out in description.

Keep **Internal P&L** on existing cost rates (`LABOR_COST_CENTS_PER_HOUR`, parts, receipts) — do not mix into ledger Sold/Actual.

### Materials commercial tags (Schedule A/B)

Add a small nullable field on expenses (preferred) or a join table:

| Tag | Meaning | CO exhibit |
|-----|---------|------------|
| `in_allowance` | Finishing / expected under allowance | Schedule A |
| `supply_gap` | Missing prior-contractor / owner-assumed stock | Schedule B |
| `scope_add` | True scope expansion | Separate CO language |
| `equipment` | Lift, rental, etc. | Equipment bucket |

**Auto-assign heuristic (editable):** for T&M jobs with a materials allowance, assign receipt dollars FIFO to `in_allowance` until allowance exhausted, remainder `supply_gap`. Owner can retag.

No new inventory entities. Tags exist only for **client narrative and CO exhibits**.

Migration: e.g. `expenses.commercial_tag TEXT NULL` with check constraint on allowed values — or `ledger_tag` naming to match product language.

---

## Change order from variance

### Flow

1. Owner opens job ledger → **Draft CO from variance**.  
2. Server (or client using existing POST `/api/v1/change-orders`) creates **draft** CO on commercial estimate with:
   - Title default: “Materials supply / cost adjustment” (or labor variant)  
   - Description stub: original allowance assumption + free-text “condition found” field pre-opened  
   - Line items: suggested overage lines (materials; optional labor)  
   - Notes: optional auto-appendix listing tagged receipt totals (A vs B)  
3. Redirect or inline link to estimate CO section / CO editor (existing `ChangeOrdersClient`).  
4. Send / approve / decline unchanged.

### Rules

- Requires approved estimate (or explicit override confirm if only draft estimate — **v1: approved only**).  
- Never auto-transitions CO past `draft`.  
- Idempotency: button may create multiple drafts over time (CO-001, CO-002); no silent overwrite. Optional warning if open draft already exists with similar total.

---

## API / page wiring

### Job page data load (extend existing `page.tsx` queries)

Single aggregate loader, e.g. `loadJobLedger(session, jobId)`:

- Commercial estimate + line items  
- Approved CO totals  
- Tracked labor minutes / day rows (reuse `mapTrackedLaborDayRows`)  
- Materials expenses (reuse `fetchJobMaterialExpenses`)  
- Equipment-tagged expenses  
- Paid invoice totals on job  

### Mutations

- Existing change-order create API + optional `?prefill=variance` query or body `{ source: "job_ledger", job_id }` for audit  
- PATCH expense commercial tag  

No new public portal APIs in v1.

---

## Navigation & Overview integration

- **Overview** keeps Estimate / Deposit / Invoice cells.  
- When ledger balance or materials overage is material, Overview may show a one-line cue: `Ledger · balance $X · materials over` linking to `#job-ledger`.  
- Commercial **count-only** card is **subsumed**: counts appear inside ledger footer links (“1 estimate · 2 invoices · 1 CO”).  
- Change orders always reachable from job without opening estimate first.

---

## Permissions

| Action | Who |
|--------|-----|
| View Job Ledger | Same as profitability / commercial (not tech-only field view) |
| Retag expense | `canManageExpenses` |
| Draft CO from variance | `canCreateEstimates` or existing CO create permission |
| Draft invoice link | Existing invoice create permission |

---

## Testing

1. **Unit:** ledger math — labor hrs×rate, materials overage, sold = estimate + approved COs, balance = actual − paid, FIFO allowance tagging.  
2. **Unit:** flat-rate vs T&M row visibility.  
3. **Integration / UI:** job with Claremont-like fixtures shows header strip + variance + draft CO creates draft with expected line totals.  
4. **Regression:** Internal P&L still uses cost rate; techs still don’t see ledger; materials panel still lists receipts.

---

## Implementation sketch (for planning)

1. Domain/helper `buildJobLedger` + unit tests.  
2. Migration for `expenses.commercial_tag` (or equivalent).  
3. `JobLedgerCard` component on job page; wire loader.  
4. Enhance materials panel: allowance remaining + tag chips.  
5. Tracked work days: optional billable $ column.  
6. Draft CO from variance action + tests.  
7. Collapse/relabel Profitability → Internal P&L; fold Commercial counts into ledger.  
8. Manual dogfood on Claremont job in prod/staging.

Order prefers **read-only ledger first** (steps 1, 3, 7), then tags + CO draft (2, 4, 6).

---

## Out of scope follow-ups (v2+)

- Dedicated `/app/jobs/[id]/money` full page if ledger outgrows the card  
- PDF export of CO exhibits from tags  
- Portal “approved scope + extras” view  
- Multi-estimate sold column / allocation  
- Auto equipment matching from vendors  
- Labor past 110-hr cap hard-stop workflow  

---

## Spec self-review checklist

- [x] No TBD placeholders for v1 decisions  
- [x] Consistent: job is home; CO remains estimate-scoped  
- [x] Scope fit for one implementation plan (phased read-only → CO draft)  
- [x] Claremont success criterion explicit  
- [x] Internal P&L vs customer ledger not mixed  

---

## Approval

**Approach A** approved in product conversation (2026-07-30).  
This document is the written source of truth before the implementation plan.
