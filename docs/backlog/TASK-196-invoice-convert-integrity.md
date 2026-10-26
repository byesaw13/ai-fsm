# TASK-196: Convert to invoice copies only the right lines, and lines add up

Status:
In progress

Epic:
EPIC-004 Billing & Profitability

Phase:
3

Severity:
High (wrong customer-facing amounts). Latent today: production has no
multi-option estimates and no hidden lines on approved estimates (checked
2026-10-26).

Problem:
`apps/web/app/api/v1/estimates/[id]/convert/route.ts` (step 4) copies every
estimate line with no `option_id` or `visible_to_customer` filter: hidden lines
appear on the customer's invoice, and a multi-option estimate puts every
option's lines on one invoice. The invoice total is copied from the estimate,
but `risk_adjustment_cents`, and a `travel_surcharge_cents` with no travel
snapshot, are in the total with no line, so lines sum to less than the total.

Scope:
- Copy lines with no option plus the chosen option's lines (the TASK-183
  rule); refuse to convert a multi-option estimate with no chosen option.
- Hidden lines: fold into a visible line or show as one "Included work" line;
  never show a hidden line's own text.
- Add a line for risk adjustment and for a non-snapshot travel surcharge so
  invoice lines sum to the invoice subtotal.

Acceptance Criteria:
- [ ] For every converted estimate, sum(invoice lines) = invoice subtotal.
- [ ] No line marked hidden on the estimate appears by its own text.
- [ ] Converting Good/Better/Best with Better chosen copies only Better's lines.

Related:
TASK-183, TASK-192 (equipment type survives convert).
