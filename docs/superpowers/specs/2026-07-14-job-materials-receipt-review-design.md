# Job Materials — Receipt Review & Margin — Design Spec

**Date:** 2026-07-14
**Status:** Approved (2026-07-14)
**Roadmap:** Phase 3 — Estimate & Billing Closure (EPIC-004 billing)
**Context:** Receipts sync into Paperless correctly, but linking a receipt to a job produces no visible result. Itemized line items exist in the schema but are unreachable from the UI. Job margin ignores receipts entirely.

---

## Problem

Three separate gaps, discovered by tracing the actual code paths (not assumed from symptoms):

1. **Linked receipts are invisible.** The job detail page renders exactly one receipts-related panel — `LinkForgottenExpensesPanel` — which explicitly filters out any expense already linked to the job (`already_on_job` rows are dropped by `/api/v1/jobs/[id]/linkable-expenses`). Once a receipt is correctly saved with `job_id` set, nothing on the job page ever shows it again.

2. **Itemization exists but is orphaned.** `expense_line_items`, `fetchExpenseLineItems`/`replaceExpenseLineItems`, an AI line-item prompt (`RECEIPT_LINE_ITEMS_PROMPT`), and a parsing endpoint (`/api/v1/expenses/[id]/parse-line-items`) all exist and work. But the "Scan a Receipt" button used in the actual expense-creation flow (`ExpenseForm.tsx`) calls a different, older endpoint (`/api/v1/expenses/scan-receipt`) that only extracts vendor/total/date/category — never line items — and nothing in the UI ever calls the itemizing endpoint.

3. **Margin ignores receipts.** The job page already computes and displays gross margin, but its cost side (`partsCostCents`, sourced from `jobs.actual_cost_cents`) is maintained exclusively by a separate, manual "visit parts" entry system (`visit_parts` table, updated from `/api/v1/visits/[id]/parts`). Material expenses linked via receipts never enter this calculation.

---

## Goals

1. A receipt linked to a job (`category = 'materials'`) is visible on that job's page, itemized, with vendor/date/total and a billed/unbilled status.
2. The receipt-scan flow the user actually uses extracts line items in the same AI call — no separate step required.
3. Line items are editable (fix a misread quantity/price, delete a bad line, add a missed one) directly on the expense.
4. Job margin includes linked-receipt material cost as a distinct, additive cost line alongside the existing visit-parts cost — nothing already displayed gets hidden or double-counted.

## Non-goals

- No formal "reviewed/confirmed" approval gate on line items — edits save directly, no workflow state machine.
- No change to non-`materials` category expenses (fuel, tools, etc.) — they continue to live only in the general Expenses list, matching every other piece of this system (forgotten-receipts panel, auto-invoicing, job cost rollup are all `materials`-scoped today).
- No replacement of the `visit_parts` cost-tracking system — it stays; receipts become a second, additive cost source.
- No schema migrations — `expense_line_items` and its indexes already exist (migration 143).

---

## Decision summary

| Topic | Decision |
|---|---|
| Where receipts show | New "Materials" panel on the job detail page, alongside (not replacing) the existing Forgotten Receipts panel |
| Category scope | `materials` only — matches every existing piece of this system |
| Line-item review | Correctness-check only; inline edit/delete/add, no approval gate |
| Itemize-on-scan | Yes — swap the primary scan endpoint's prompt to the itemizing one; one AI call does both |
| Billed receipts | Line items become read-only once any line is on an invoice, to prevent the expense record drifting from what the client was actually billed |
| Margin cost source | Additive — job cost = existing visit-parts cost **+** sum of linked materials-receipt totals, shown as two separate breakdown rows |

---

## Data flow

```
Receipt scan (ExpenseForm)
  → POST /api/v1/expenses/scan-receipt   (now returns vendor/total/date/category + line_items)
  → POST /api/v1/expenses                (creates expense, job_id/client_id as selected)
  → PUT  /api/v1/expenses/[id]/line-items (new — saves the scanned line items)
  → POST /api/v1/expenses/[id]/receipt   (existing — uploads photo, syncs to Paperless)

Job detail page render
  → fetchJobMaterialExpenses(jobId)      (new — all materials expenses with job_id = X,
                                           itemized lines, billed flag)
  → JobMaterialsPanel                    (new — itemized list + running unbilled total)
  → cost calc: partsCostCents (existing, visit_parts)
             + materialsReceiptCostCents (new, from fetchJobMaterialExpenses)

Expense detail page
  → ExpenseLineItemsEditor               (new — inline edit/add/remove rows)
  → PUT /api/v1/expenses/[id]/line-items (rejects edits if any line is already billed)
```

---

## Components & files touched

**New:**
- `apps/web/components/jobs/JobMaterialsPanel.tsx` — server-rendered list of linked materials receipts, itemized, with billed/unbilled badges and a running unbilled total. Follows the job page's existing pattern of inline SQL in the server component.
- `apps/web/app/api/v1/expenses/[id]/line-items/route.ts` (PUT) — thin wrapper around the existing `replaceExpenseLineItems`; validates `quantity > 0` and `unit_cost_cents >= 0`; rejects with a clear error if any current line is already referenced by an `invoice_line_items` row.
- `apps/web/app/app/expenses/[id]/ExpenseLineItemsEditor.tsx` — client component for itemized display/edit on the expense detail page, read-only when billed.

**Modified:**
- `apps/web/lib/invoices/job-expenses.ts` — add `fetchJobMaterialExpenses(client, accountId, jobId)`: all `materials`-category expenses with `job_id = jobId`, each enriched with itemized lines (`fetchExpenseLineItems`) and a `billed: boolean` (EXISTS in `invoice_line_items` by `source_expense_id`).
- `apps/web/app/app/jobs/[id]/page.tsx` — render `JobMaterialsPanel`; extend the cost calc with `materialsReceiptCostCents` as a second breakdown row next to "Parts Cost".
- `apps/web/app/api/v1/expenses/scan-receipt/route.ts` — swap `RECEIPT_PROMPT` for `RECEIPT_LINE_ITEMS_PROMPT`, parse and return `line_items` via `normalizeParsedReceiptLineItems`.
- `apps/web/app/app/expenses/new/ExpenseForm.tsx` — after creating the expense, if the scan returned line items, `PUT` them to the new line-items endpoint before/alongside the receipt photo upload.
- `apps/web/app/app/expenses/[id]/page.tsx` — render `ExpenseLineItemsEditor` when the expense has line items or is `materials` category.

**Untouched (pre-existing in-progress work, unrelated to this feature):**
- `apps/web/components/invoices/LinkForgottenExpensesPanel.tsx` (uncommitted search/collapse UI changes)
- `apps/web/lib/invoices/receipt-po.ts` and its test (PO-tag extraction for the forgotten-receipts search box)

---

## Error handling

- AI itemization failure on scan is non-fatal, matching the existing best-effort pattern: totals/vendor/date still populate, `line_items` comes back empty, the save is not blocked.
- Line-item edits validate client-side (qty > 0, unit cost ≥ 0) before submit; the PUT endpoint re-validates server-side.
- Editing line items on an already-billed expense returns a 409 with a clear message ("This receipt is already on an invoice — edit the invoice instead"); the UI renders the editor read-only in that state rather than letting the request fail silently.
- `fetchJobMaterialExpenses` failures on the job page follow the page's existing pattern: the section fails independently (try/catch → empty state), not blocking the rest of the job page render.

---

## Testing

- Unit test for `fetchJobMaterialExpenses`: job_id filter correctness, `materials`-only category scope, `billed` flag correctness (linked to `invoice_line_items.source_expense_id`).
- Unit test for `scan-receipt` route returning `line_items` (mocked Anthropic response, including the AI-failure fallback path).
- Unit test for the new line-items PUT endpoint: validation rejects (qty ≤ 0, negative cost), and the billed-lock rejection path.
- Business-logic change per project rules — no test gap.
