# TASK-227: Itemized paint pools rooms that share a color

Status:
Done (2026-10-31, verified on production; PRs #740, #741)

Epic:
EPIC-002 Estimating & Assessments

Phase:
3 (ROADMAP Phase 3 slice "customer quote presentation and letterhead", owner 2026-10-31)

Related:
TASK-212 (package sizes), TASK-214 (paint pilot). Build after TASK-212 if it has landed. Otherwise use
the fixed container sizes below.

Problem:
"Itemize materials" (TASK-187, `lib/estimates/itemize-materials.ts`) lists paint per room in fractional
gallons. On the Dowd quote (2026-10-31), one color across nine rooms came out as about 17 gallons in
nine separate lines at $85/gal. The paint was priced by `ai_estimate`, not from the owner's price book.
A painter buys that as three 5-gallon pails plus a few gallons. Fractional per-room gallons are not
what gets bought: the buy list doesn't match the store run, and the price doesn't match the cans.

Scope:
- An owner toggle on the prepared scope, "One color everywhere: buy paint together"
  (`prepared_scope.pool_paint`). It shows only when a priced gallon product is listed in two or more
  rooms. Built as an explicit toggle, not inferred from a question answer, so existing quotes never
  change price silently (implementation choice 2026-10-31).
- Pooled paint is one "Paint (bought together)" section on the buy list. The room sections no longer
  list it.
- The pooled line rounds up to whole containers: 5-gal pails, then gallons, then a quart only under
  1 gal.
- Each room's materials allowance then carries its share of the pooled cost, by its gallons (which follow its square feet), so room
  totals still add up.
- Price: the line's own per-gallon price. A pail is priced as 5 gallons and a quart as a quarter. No
  discount is assumed, and the owner edits the price on the buy list. Price-book matching for paint
  stays with TASK-213/214.

Acceptance Criteria:
- [x] Unit test: nine rooms, one color, 16.75 gal of need gives 3 pails + 2 gal. The room shares add up
      to the pooled cost. (`packages/domain/src/__tests__/pooled-paint.unit.test.ts`)
- [x] Different products (names or prices) are not pooled.
- [x] The buy list (shopping_list_json) shows the pooled line. (`itemize-materials.unit.test.ts`)

Effort:
1 d
