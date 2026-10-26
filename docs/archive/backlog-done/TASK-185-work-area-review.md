# TASK-185: Review the prepared quote by work area

Status:
Done (2026-10-25)

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Problem:
The Prepared Scope panel showed every task open, each with low hours, high
hours and materials boxes. A seven-room repaint showed 14 tasks that way, and
the owner had to read it like a spreadsheet to see what each room cost.

Business Value:
The owner sees the quote the way the customer will (one line per room)
and spends attention only where something is missing.

Scope:
- Prepared Scope opens as one row per work area: hours range, labor, materials,
  total, task count, and what needs attention (open questions, tasks without
  hours, tasks not priced). A total row closes the table.
- Labor per row matches the quote line: midpoint hours to the quarter hour at
  the rate; a fixed price uses its allocation, so rows add up to the price.
- Tapping a row opens its tasks with the existing editors. Nothing about
  saving, Apply or pricing changes.

Acceptance Criteria:
- [x] The panel opens with work areas collapsed; no task editors show.
- [x] Each row shows labor, materials and total; the totals match the quote.
- [x] Rows flag unanswered questions and missing hours or prices.
- [x] Opening a row shows and edits its tasks as before.

Notes:
Follows ux-implementation-direction Rule 6 (AI prepares, owner reviews
exceptions) and Rule 8 (progressive disclosure).
