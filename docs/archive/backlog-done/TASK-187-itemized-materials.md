# TASK-187: Itemized materials per work area

Status:
Done (2026-10-25)

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Problem:
Each work area's materials on a prepared quote were one allowance ("$750
materials") the owner had no way to judge. The app already had a materials
generator that prices from the owner's saved materials and feeds the buy
list, but Prepare Quote did not use it.

Business Value:
The owner sees what the quote intends to buy, with where each price came
from, and the same list becomes the job's buy list.

Scope:
- Itemize materials per work area (or every area at once) with the existing
  generator: the area's included tasks and quantities, its rooms (with the
  TASK-184 wall areas), and the account's saved materials.
- Each line shows quantity, unit price and where it came from: your price
  (saved material), AI estimate, or yours (edited). Unpriced lines are
  counted, not zeroed. Customer-supplied items and assumptions are listed.
- An itemized area's materials come from its lines in every total (work-area
  row, T&M range, fixed-price allocation, modeled profit). Other areas keep
  their allowance. "Use the allowance instead" removes the list.
- The owner edits quantity and price, or removes lines. A list made before
  the area's tasks changed is flagged.
- Apply writes the itemized lists to `shopping_list_json`, one section per
  area, so the job's buy list seeds from them. Nothing itemized: the buy list
  is left as it was.

Acceptance Criteria:
- [x] Itemizing an area replaces its allowance with priced lines.
- [x] Saved prices are used first and labeled; other prices say AI estimate.
- [x] Totals, fixed-price lines and modeled profit follow the lines.
- [x] Apply feeds the buy list from the same lines.
- [x] A failed area keeps its allowance and is reported.

Notes:
Live supplier prices are out of scope: the big-box stores have no public price
API. Saved materials are the reliable price source; the more the owner saves,
the fewer lines say AI estimate. Not run against the live model locally (the
development key has no API credit).
