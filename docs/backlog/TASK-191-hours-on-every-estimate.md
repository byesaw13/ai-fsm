# TASK-191: Person-hours on every estimate

Status:
Done (#726, 20c7d5f8, verified 2026-10-27)

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
- Travel-time line: hours from the travel calculation (billable travel minutes
  / 60), source travel_calc, editable; counted once in the baseline hours.
  Mileage, tolls and parking stay other direct costs.
- Every creation path in TASK-188 "Creation paths and coverage" passes hours
  and sources:
  - Quick estimate wizard and Fix now: an hours field (low-high person-hours)
    on each labor entry, shown before the Send step, with "Hours missing"
    visible as soon as a labor line has none. The quick wizard, which creates
    and sends in one go, collects hours and the direct-cost confirmation
    before its send step instead of failing at Send.
  - T&M briefing: save the extracted labor_hours_min/max as the hours of the
    labor line(s), source ai_allowance; the owner edits them on the review
    screen and in the edit form without retyping.
  - AI draft (and the interview that feeds it): save each chosen service's
    price-book hours, source price_book; editable the same way.
- One coverage test per creation path (TASK-188 table), asserting stored
  hours, sources and costs.

Acceptance Criteria:
- [x] A T&M briefing of "6-8 hours on site" creates a labor line with 6-8 h,
      source ai_allowance, editable to 7-8 h (source becomes owner).
- [x] An AI draft with a price-book service of typical 2 h creates a line with
      2 h, source price_book.
- [x] The quick wizard shows "Hours missing" before its send step and does not
      call Send until hours and direct costs are complete.
- [x] Fix now shows the hours field before Send.
- [x] Coverage tests for paths 1-11 pass.
- [x] A travel calculation of 60 billable minutes gives the travel-time line
      1-1 h, source travel_calc (doc Example F).
- [x] A blank hours field saves as null and reloads blank.
- [x] Adding price-book item with typical 2 h shows 2 h, source price_book;
      editing it to 3 h shows source owner.
- [x] Apply to quote on Fixture A stores 87.75-132.25 h across its labor
      lines.
- [x] A flat-price quote saves an estimate-level 20-30 h range.
- [x] Existing estimates load with hours null and unchanged totals.

Effort:
3 days.
