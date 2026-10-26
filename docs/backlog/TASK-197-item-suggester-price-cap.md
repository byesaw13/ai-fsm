# TASK-197: AI line suggestions cannot set their own price

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Severity:
High (price integrity).

Problem:
`apps/web/lib/estimates/item-suggester.ts` (mapping after the model call) uses
`pb.default_price_cents ?? Math.max(pb.price_min_cents, s.unit_price_cents)`:
when an item has no default price, the model's number is used with no upper
limit at `price_max_cents`.

Scope:
- Price = the item's default price; else the model's number clamped to
  [price_min_cents, price_max_cents] (min only when no max); the suggestion
  shows "AI price, check" when the model's number was used.

Acceptance Criteria:
- [ ] A model price of $9,999 on an item ranged $100-$300 becomes $300.
- [ ] Items with a default price ignore the model's price.

Related:
TASK-204.
