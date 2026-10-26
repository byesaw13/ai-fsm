# TASK-191: Person-hours on every estimate

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Parent:
TASK-188

Problem:
No estimate stores hours. `estimates` and `estimate_line_items` have no hours
columns; `labor_hours_estimate` in the PATCH body
(`apps/web/app/api/v1/estimates/[id]/route.ts`) is used for painting math and
dropped. Prepared quotes keep hours only inside `prepared_scope` JSON.

Scope:
- Migration 208 (the TASK-188 data model, all but the line type CHECK).
- Per labor line: hours_low, hours_high, hours_source (owner, price_book,
  production_rate, ai_allowance, revision). Flat-price quotes with no labor
  lines use the estimate-level range, an alternative total that is never added
  to line hours.
- Price-book lines start from `labor_hours_typical` (low/high from
  `labor_hours_low`/`labor_hours_high` when present); the owner can override,
  which sets source to owner.
- Prepare Quote and Apply to quote write each group line's range and source.
- Drafts save with missing hours as null, never 0. UI labels them person-hours,
  with the hint "2 painters x 8 h = 16 h".
- Carry hours through PATCH, create, Apply and the edit form.

Acceptance Criteria:
- [ ] A blank hours field saves as null and reloads blank.
- [ ] Adding price-book item with typical 2 h shows 2 h, source price_book;
      editing it to 3 h shows source owner.
- [ ] Apply to quote on Fixture A stores 87.75-132.25 h across its labor
      lines.
- [ ] A flat-price quote saves an estimate-level 20-30 h range.
- [ ] Existing estimates load with hours null and unchanged totals.

Effort:
2 days.
