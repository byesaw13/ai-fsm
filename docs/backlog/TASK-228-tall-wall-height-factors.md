# TASK-228: Tall walls take more hours in Prepare Quote

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3 (ROADMAP Phase 3 slice "customer quote presentation and letterhead", owner 2026-10-31)

Related:
TASK-219 (production rate review). TASK-218 (Craftsman reference).

Owner decision needed before build:
Adopt the Craftsman height factors below, or set our own.

Problem:
Prepare Quote turns wall square feet into hours with one production rate (code 5012, 400 sq ft/day) and
the same pace at any height. On the Dowd quote the foyer (walls up to 18 ft on staging) came out at
$2.55/sq ft before prep, cheaper per foot than the 9 ft pantry. The owner said "this should be a higher
per sq ft for the level of difficulty".

Craftsman's National Painting Cost Estimator ("High Time Difficulty Factors", captured in
`~/craftsman-reference/raw2/Painting--stair_.txt`) gives these factors relative to an 8–9 ft wall:

| Wall height | Time factor |
| --- | --- |
| up to 9 ft | 1.0 |
| 9–13 ft | ×1.23 |
| 13–17 ft | ×1.46 |
| 17–19 ft | ×1.69 |
| 19–21 ft | ×1.92 |

Scope:
- Wall-paint tasks (`method: "wall_paint"`) multiply their hours by the factor for the room's
  `peak_height_ft` (or `height_ft` when there is no peak). The task's `estimate_notes` say which factor
  was used.
- The factors live in code as a named constant, with the source cited, after the owner approves them.
  No table.
- Hours the owner has already set (`hours_source = "owner"`) are never changed.

Acceptance Criteria:
- [ ] Unit test: a 400 sq ft room at 18 ft gets 1.69× the hours of the same room at 9 ft.
- [ ] Owner-set hours are untouched.
- [ ] The factor shows in the task's notes on the prepared scope panel.

Effort:
0.5 d
