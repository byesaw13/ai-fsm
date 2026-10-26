# TASK-202: Prepared quote edge cases

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Severity:
Medium.

Problem:
- `allocateFixedPrice` (`packages/domain/src/prepared-scope.ts`) returns no
  lines when no group has hours or materials, so a fixed price silently
  disappears from the quote.
- `modelPreparedProfit` sells at expected hours (or the exact midpoint) while
  the quote lines bill each group's quarter-hour-rounded midpoint, so the
  profit card and the quote total differ when expected hours are set.

Scope:
- Fixed price with no eligible groups: one "Work as described" labor line for
  the full price.
- The profit card's T&M sell price equals the quote lines' total; expected
  hours affect cost only.

Acceptance Criteria:
- [ ] Fixed $2,000 with no hours gives one $2,000 line.
- [ ] With expected hours set, the profit card's sell price equals the sum of
      the quote lines.

Related:
TASK-188.
