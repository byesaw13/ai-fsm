# TASK-178: Door, window and opening counts on assessment rooms

Status:
Done (#711, deployed 2026-10-23)

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Problem:
`AssessmentRoom` stores only length, width, height and notes. The painting
room editor fills in one door and two windows for every room
(`RoomByRoomEditor.tsx`, `Step2Pricing.tsx`), so its net wall area is a guess
presented as a measurement.

Business Value:
Wall, baseboard and trim quantities come from what was seen in the room, and
an unknown stays visibly unknown.

Scope:
- Optional door count, window count and other opening widths (for example a
  20 in closet door) on assessment rooms. Update the domain type, the visit
  assessment API schema, the persisted-row loader and the estimate handoff
  normalizer together.
- Empty means unknown. Show gross area and flag it. No default counts.
- Each room shows gross, deductions and net, with an explicit override.

Out of Scope:
- Wall segmentation, drawings, photo markup.

Acceptance Criteria:
- [x] The reference bathroom saves one door, one 20 in closet door and one
      window, and reloads unchanged.
- [x] A room with no openings entered shows gross area marked "openings
      unknown", never a net figure.
- [x] Existing assessments load unchanged.

Notes:
Fixture: reference scenario above.

Shipped: rooms record doors, windows, other openings by width and a wall-area
override; `computeAssessmentRoomGeometry` returns quantities with their source;
the materials generator receives the counts and honors an override.
