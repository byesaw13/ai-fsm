# TASK-220: Price book refresh from job history and Craftsman

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3 (estimating slice; see ROADMAP Phase 3 bullet "TASK-220 price book refresh")

Owner approval:
Direction asked for by the owner 2026-10-29 ("updating the pricing book with more of the jobs from
craftsman might be a smart play", "look back at all jobs and see what is done the most"). The owner
still decides each item on the review sheet before any build. No new tables or routes.

Depends on:
- TASK-218 (Craftsman reference hours beside the price book): supplies the reference column.
- TASK-219 (production rate review): supplies the reviewed per-unit rates.
- TASK-189 formula document (approved 2026-10-26): the price = hours × rate rule.

Problem:
The price book is not used when estimating: 0 of 84 estimate lines carry a price book code, and big
jobs are priced as hours or T&M lines. The owner's view is that the book's prices "didn't seem to
match what is produced".

The review sheet (`docs/working/price-book-refresh-review.md`) found why:
- Most prices are already typical hours × $85. The rate math is fine; the **hours** are unreviewed
  guesses.
- Measurable work (trim, crown, deck boards, fence, flooring, larger drywall, painting) is one flat
  price whatever the size.
- 21 small-job codes carry hand-added bumps of 15% to 76%: a minimum charge with no rule behind it.
- 16 codes have no hours and 11 have no price, including the flooring codes and the 9xxx placeholders.
- The work done most (interior painting, drywall and ceiling repair, exterior wood repair, custom
  builds, doors) has the thinnest codes. Small roofing, cleanout, garage door panels, shut-off valves,
  vanity installs and bath fans have none.

Scope:
- **Owner review session** on the review sheet: decisions A1 to A3 (rate, minimum rule, small-job
  overrides), the per-unit rows (B), the new codes (C), codes to hide (D) and placeholders (E).
- **Guarded data migrations** apply the decisions, following the TASK-219 pattern: each change applies
  only while the row still holds today's value, with a reversal comment and the source in `notes`.
  - Prices recomputed as hours × the chosen rate, where the owner chose that.
  - Per-unit codes get `pricing_method = 'per_unit'`, hours per unit, and a unit.
  - New codes inserted with hours, unit, category and price.
  - Hidden codes set `is_active = false` (kept for old estimates).
- **Craftsman capture session** (owner signs in) for the new codes marked "capture": window sill,
  skim coat, prehung door, door frame, garage door panel, shut-off valve, small roof repair. Results go
  into the reference sheet and the TASK-218 CSV, not into prices.
- **Link estimate lines to codes.** Wherever an estimate line is created from the price book (Prepare
  Quote, AI items, price book picker), `estimate_line_items.price_book_id` is set. Today it never is.
  Needed so the book's use can be measured, and by TASK-221.

Out of scope:
- New tables, columns or routes.
- Any automatic use of Craftsman numbers in prices. Craftsman stays reference only (TASK-218); the
  owner sets each hours value.
- A licensed Craftsman catalog import or Craftsman-written codes (ROADMAP Phase 4 exclusion). Codes are
  ours, one per kind of work the owner actually sells.
- Materials checklists and per-code parts lists (TASK-221).
- Calibration from actual hours (TASK-215 data).

Acceptance criteria:
- [ ] Owner decisions recorded in the review sheet and copied into this file.
- [ ] Every active code has typical hours and a price, or is marked hourly (price = hours entered ×
      rate).
- [ ] The per-unit codes the owner chose price by quantity in Prepare Quote.
- [ ] New codes exist for the kinds of work the owner approved.
- [ ] Estimate lines created from the price book carry `price_book_id` (integration test).
- [ ] Migrations are guarded and reversible; unit test pins every changed row, like TASK-219's.
- [ ] Owner prepares one estimate from the refreshed book and confirms the prices look right.

Test plan:
- Unit test parsing each data migration (pattern: `production-rate-review.unit.test.ts`).
- Integration test: a line created from the price book picker stores `price_book_id`.
