# TASK-152: Job materials → invoice line items — clean labels, classification, order

Status:
In Progress (slice 3)

Phase:
3

Epic:
EPIC-004 Billing & Profitability

Problem:
A job carries materials in three unreconciled models: `job_material_lines` (the
buy-list plan, has `store_section`/`source`/`status`), `expenses` category=materials
(receipt actuals, vendor + amount + notes, NO section), and `invoice_line_items`
(the bill, flat `materials` type + a description string). Turning receipts into
invoice lines is rough:

- A receipt with no itemized SKU lines becomes ONE opaque line: description = the
  tech's raw internal `notes` (truncated 120) or bare `Materials — {vendor}`,
  priced at the whole receipt total (`buildMaterialLineDraftsForExpense`,
  `apps/web/lib/invoices/job-expenses.ts`).
- Material and equipment lines are BOTH `line_item_type = 'materials'`; equipment is
  only a description prefix, not a class.
- Order is purely chronological (`expense_date`), materials then equipment then the
  handling fee. No grouping by kind, vendor, or store section — the plan's
  `store_section` is discarded at billing time.

Business Value:
The customer-facing invoice reads professionally (clean, dated labels; grouped by
kind), and the owner can trust materials billing instead of hand-fixing a flat list.

Scope (sliced):
- **Slice 1 (this task, active): clean the default label.** Receipt lines with no
  itemized SKUs get a consistent, dated label (`Materials — {vendor} · {Mon D}`,
  `Lift / equipment — {vendor} · {Mon D}`) instead of a bare vendor blob. Owner
  can still rename any line in `InvoiceLineItemsEditor` (existing affordance).
- **Slice 2 (built): classify + group.** `invoice_line_items.material_kind`
  (migration 190) stamps material vs equipment at line creation; a shared
  `groupInvoiceLineItems()` helper sections lines (Labor / Materials / Equipment &
  rentals / Handling / Adjustments) with per-section subtotals in a fixed order.
  Applied to the owner invoice detail view. **"consumable" is allowed in the CHECK
  but not populated — it needs a capture-time signal (slice 2b).** Grouped display
  for the editor / print / customer portal is a follow-up (they render separately).
- **Slice 3 (built): store section on the bill.** No data link exists from receipt
  actuals to the buy-list sections, so (per owner decision) the owner SETS the
  section on a bill line: `invoice_line_items.store_section` (migration 191), a
  Section input on material rows in `InvoiceLineItemsEditor` (PATCH persists it),
  and the owner invoice view sub-groups Materials by section (alpha, "Other" last)
  with sub-subtotals. **Auto-fill from a receipt's SKU → buy-list section is a
  follow-up (3b)** — rarely fires (few itemized receipts) and needs jobId + a
  buy-list lookup threaded into the billing path.

Out of Scope:
- Itemized SKU extraction from receipt photos (separate capability).
- Changing material handling-fee behavior.

Open question (owner decision, before slice 1b):
- Should the tech's internal `notes` be shown verbatim on the customer invoice
  (current behavior when present), or kept internal with a clean generated label?
  Slice 1 keeps notes-when-present and only improves the no-notes fallback.

Acceptance Criteria (slice 1):
- [ ] A materials receipt with no SKU lines invoices as `Materials — {vendor} · {date}`.
- [ ] An equipment receipt invoices as `Lift / equipment — {vendor} · {date}`.
- [ ] Falls back to `Materials — {vendor}` when the date is missing; unit tests cover
      date present / absent / notes present.
- [ ] Owner rename still works (unchanged).

Acceptance Criteria (slice 2):
- [x] Material lines carry `material_kind` (material/equipment) from creation (migration 190).
- [x] Owner invoice view groups lines into ordered sections with per-section subtotals.
- [x] Equipment bills under "Equipment & rentals"; legacy/untagged materials group under "Materials".
- [x] Unit tests cover section keying, order, subtotals, empty-section omission.

Acceptance Criteria (slice 3):
- [x] Material lines carry `store_section` (migration 191); owner sets it per line in the editor.
- [x] Owner invoice view sub-groups Materials by section (named alpha, "Other" last) with sub-subtotals.
- [x] No section on any line → flat Materials list, unchanged.
- [x] Unit tests cover sub-grouping order, subtotals, and the no-section flat case.
