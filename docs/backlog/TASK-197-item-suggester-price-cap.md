# TASK-197: AI line suggestions never set a price

Status:
Done (2026-10-26). Verified on production: /api/health ok and /login HTTP/2 200 at 22:06 UTC. Squash 1a8cc54c (#722).

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
Owner decision (2026-10-26): the AI never sets or proposes a price.
- Price = the item's default price; else its minimum price; else no price,
  shown as "Price needed" (a missing cost for the send checklist).
- The model's price is never read; the suggestion tool no longer asks the
  model for a price.

Acceptance Criteria:
- [x] An item with a default price uses it; with no default but a minimum,
      uses the minimum; with neither, has no price and shows "Price needed".
- [x] A model response containing a price never changes the line's price.

Related:
TASK-204.
