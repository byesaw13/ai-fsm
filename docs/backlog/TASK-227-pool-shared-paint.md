# TASK-227: Itemized paint pools rooms that share a color

Status:
Proposed

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
A painter buys that as three 5-gallon pails plus a few gallons. Room-by-room quantities overstate
cost, and the buy list doesn't match what is bought.

Scope:
- When the prepared scope's answers or the owner say rooms share a color, the itemizer adds the paint
  for those rooms into one line on the prep (or first) area. Rooms that share a color are found from a
  question answer like "one paint color", or from an owner toggle "All rooms one color" in
  PreparedScopePanel.
- The pooled line rounds up to whole containers: 5-gal pails, then gallons, then a quart only under
  1 gal.
- Each room's materials allowance then carries its share of the pooled cost, by square feet, so room
  totals still add up.
- Paint price comes from the price book or catalog when there's a match. Otherwise it is labeled
  "Price needed", following the TASK-197 rule.

Acceptance Criteria:
- [ ] Unit test: nine rooms, one color, 16.75 gal of need gives 3 pails + 2 gal. The room shares add up
      to the pooled cost.
- [ ] Rooms with different colors are not pooled.
- [ ] The buy list (shopping_list_json) shows the pooled line.

Effort:
1 d
