# TASK-157: Invoice work summary by area + customer itemized receipts link

Status:
In Progress

Phase:
3

Epic:
EPIC-004 Billing & Profitability

Problem:
A T&M final invoice reads as a few money lines with one long labor
description crammed under the 500-character line limit. The client can't see
the work completed room by room, and there's no honest way to show what the
materials total is made of. Found 2026-09-23 on a multi-room renovation:

- Time is tracked per job, not per room (`activity_entries.task_id` is empty),
  so labor can't be split into per-room dollar lines without inventing numbers.
- Completed work *is* recorded per room: `work_order_tasks` labels follow
  `Area — task` and carry `status = 'done'`.
- The billed materials figure was hand-computed and could not be reproduced
  from the job's receipts. Receipts mix billable items with non-billable ones
  (drinks, storage bins, a tool, items billed to someone else), but
  `expenses.billable` has no UI or API, and there is no per-item flag.

Business Value:
The client sees a professional, room-by-room account of the work, and can open
an itemized receipts page that adds up exactly to the materials billed. The
owner controls exactly which receipts and items are billed.

Scope:
- **Billable receipts and items (owner).**
  - Migration 193: `expense_line_items.billable boolean NOT NULL DEFAULT true`.
  - Expense PATCH accepts `billable`; the receipt page gets a "Bill to client"
    checkbox (whole receipt) and a per-item "Bill" checkbox in the line-items
    editor (PUT preserves it).
  - Materials-from-receipts billing (`buildMaterialLineDraftsForExpense`) skips
    non-billable items, so every path agrees.
- **Work summary on the invoice.**
  - Migration 193: `invoices.work_summary text` (draft-only edit, frozen once
    sent, same as notes: immutability trigger updated from its live definition).
  - Owner invoice edit form: "Work completed" textarea + "Build from completed
    tasks" (groups done top-level `Area — task` labels by area; owner edits
    before sending).
  - Rendered as a "Work completed" section above the line items on the client
    portal and the PDF.
- **Itemized receipts link (customer).**
  - Migration 193: `invoices.show_itemized_receipts boolean NOT NULL DEFAULT false`
    (owner opts in per invoice).
  - Public page `/portal/invoices/[token]/receipts`: the job's billable receipts,
    each with its billable items (qty × unit = line), receipt subtotal, and a
    grand total. Unitemized receipts show one "receipt total" row. Internal
    receipt notes are never shown.
  - Linked from the portal invoice page and printed as a URL on the PDF.
  - Owner invoice page shows the itemized receipts total next to the materials
    billed on the invoice so the owner can reconcile before sending.

Out of Scope:
- Per-room labor dollars (needs task-level time capture; separate task).
- Receipt photos on the public page.
- Auto-rewriting invoice money lines from the work summary.

Acceptance Criteria:
- [ ] A receipt or a single receipt item can be marked non-billable in the app; materials billing and the itemized page both exclude it.
- [ ] "Build from completed tasks" produces an area-grouped summary from done top-level tasks; owner can edit it; it's frozen once sent.
- [ ] Portal and PDF show "Work completed" above line items when set.
- [ ] With the toggle on, the portal shows a "View itemized receipts" link; the receipts page total equals the sum of billable items / unitemized receipt totals.
- [ ] Toggle off (default): no link; the receipts page 404s.
- [ ] Unit tests: summary grouping (order, done-only, child tasks skipped, no-dash labels), itemized totals (excluded items, unitemized receipts, excluded receipts).
