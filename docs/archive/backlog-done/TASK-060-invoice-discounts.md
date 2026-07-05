# TASK-060: Invoice discounts (negative adjustment lines)

Status:
Done

Phase:
3

Problem:
Invoices had no way to apply a discount. The `adjustment` line type existed but
the API/DB capped unit price at >= 0, so it couldn't subtract.

Business Value:
Apply a discount (loyalty, goodwill, promo) directly on a draft invoice.

Scope:
- Migration 132: `invoice_line_items` allows negative `unit_price_cents`/
  `total_cents` ONLY for `adjustment` lines; other types stay >= 0.
- API line-item schemas allow negatives only for `adjustment` (refine).
- `recalculateInvoiceTotals` clamps the invoice rollup at $0 (no negative owed).
- Editor: relabel the type "Adjustment / Discount"; unit-price inputs accept
  negatives.

Out of Scope:
- A dedicated invoice-level discount field (percent/amount) or coupon system.

Acceptance Criteria:
- [x] A negative `adjustment` line subtracts from the invoice total.
- [x] A negative non-adjustment line is rejected (API 400 + DB check).
- [x] An over-discount floors the invoice at $0, never negative.

Notes:
Archived during north-star reconciliation (2026-07-03). Shipped in
`db/migrations/132_invoice_line_item_discounts.sql`,
`apps/web/lib/invoices/line-items.ts`, and
`apps/web/app/app/invoices/[id]/InvoiceLineItemsEditor.tsx`.