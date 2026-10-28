# TASK-219: Owner review of production rates against Craftsman

Status:
In Progress

Epic:
EPIC-002 Estimating & Assessments

Phase:
3 (estimating assistant slice; see ROADMAP Phase 3 bullet "TASK-219 production rate review")

Owner approval:
Build approved 2026-10-27. Owner rate decisions made 2026-10-27 (below).
Nothing here needs a new table or column.

Depends on:
None. TASK-218 (Craftsman reference beside the price book) is related but not required.

Problem:
Prepare Quote turns measurements into hours with `production_rates`: wall and trim painting today, and
the per-unit rates for fixtures, assembly, carpentry and flooring. All 21 rows are seeded estimates.
Every row has `calibrated = false`, and only 5012 (wall painting) has ever been reviewed (migration 207).
Craftsman has repair-work hours for 15 of the 21 that can be compared side by side. Some match ours.
Others are far off, in both directions: our faucet time is 1.5x Craftsman's, and our trim pace is about
4x slower.

Scope:
- **Owner review session.** Walk the table below. For each rate the owner picks one of:
  - **Keep** our rate.
  - **Adopt** the Craftsman figure, converted at the hours-per-day setting (default 8).
  - **Set a new value.**

  Record the reason in one line.
- **One data migration** applies the decisions, following the migration 207 pattern:
  - Each `UPDATE` changes a row only while it still holds the seeded value.
  - The file carries a reversal comment.
  - Each changed row's `notes` gets the source, for example "Reviewed 2026-11 against Craftsman RIR
    vinyl plank 0.053 h/SF; owner kept 175/day".
- `calibrated` stays `false`. It means "confirmed by our own job actuals", which comes from TASK-215
  data, not from Craftsman.
- The decisions table, with the owner's choices filled in, is copied into this task file when done.

Out of scope:
- New rate rows for work that has none (ceilings, baseboard install, crown, drywall patch). A row only
  matters once Prepare Quote reads it. That is a separate change; coordinate with TASK-217 (trade-aware
  methods), which today uses price book 5021 for ceilings because no ceiling rate exists.
- Price book flat hours (`labor_hours_*`). TASK-218 shows Craftsman beside those; the owner edits them
  by hand.
- Setup/trip allowance and per-trade minimums in the hourly baseline. That needs an owner decision on
  the TASK-189 formula, so it is filed separately if wanted.
- Any automatic use of Craftsman numbers.

Comparison (8 h per day; Craftsman hours exclude travel and setup):

| Code | Rate today | Our hrs per unit | Craftsman line (book) | Craftsman hrs per unit | Craftsman as per day | Read |
|---|---|---|---|---|---|---|
| 2001 Faucet | 6 / day | 1.33 | Faucet replace 0.557 + remove 0.356 (RIR) | 0.91 | 8.8 | Ours 1.5x. R&R small volume says 3.56 (install only), so the books disagree. |
| 2002 Showerhead | 12 / day | 0.67 | no head-only line | none | none | Keep. |
| 2003 Flapper / fill valve | 10 / day | 0.80 | no tank-parts line | none | none | Keep. |
| 2005 Toilet swap | 3 / day | 2.67 | Toilet 1.33 + finish plumbing 0.345 (RIR) | 1.68 | 4.8 | Ours higher. R&R small volume demo 0.89 + install 2.67 = 3.56. Range 1.7 to 3.6. |
| 2006 P-trap | 6 / day | 1.33 | Sink finish plumbing (feeds, P-trap, escutcheons) (RIR) | 0.475 | 16.8 | Ours 2.8x. R&R strainer & drain assembly 1.33 matches ours. |
| 2007 Disposal | 4 / day | 2.00 | Disposal 1.51 + remove 0.628 (RIR) | 2.14 | 3.7 | Match. |
| 4001 Flat-pack furniture | 7 / day | 1.14 | none | none | none | Keep. |
| 4002 Bed frame | 7 / day | 1.14 | none | none | none | Keep. |
| 4003 Bookshelf / entertainment center | 5 / day | 1.60 | none (built-ins only) | none | none | Keep. |
| 4004 Closet organizer | 4 / day | 2.00 | Shelf, brackets & rod 0.332 / LF (RIR) | 2.0 for a 6 ft closet | 4 | Match at 6 ft. Organizer system 0.304 / SF. |
| 4005 Floating shelf pair | 9 / day | 0.89 | Glass bath shelf 0.283 each (RIR, closest) | 0.57 per pair | 14 | Weak match; keep unless actuals say otherwise. |
| 4007 Deck board set (~3) | 5 / day | 1.60 | Treated 2x6 decking 0.037 + remove 0.026 / SF (RIR) | 1.04 for 3 x 12 ft boards | 7.7 | Ours 1.5x. Ours includes sanding exposed ends. |
| 4009 Stair / step repair | 4 / day | 2.00 per step | Straight stairs 0.474 to 0.517 + remove 0.122 per step (RIR) | 0.60 to 0.64 | 12.5 | Craftsman prices a run of steps; a single-step repair carries more setup. |
| 4010 Handrail run | 4 / day | 2.00 per run | no wall-handrail line; deck railing 0.275 / LF | none | none | Keep. |
| 5002 Interior door paint | 6 / day | 1.33 per door | Paint interior door, 2 coats 0.538; with primer 0.878 (RIR) | 0.54 to 0.88 | 9 to 15 | Ours higher. Check whether RIR's door line is both sides. |
| 5003 Trim paint | 120 LF / day | 0.067 / LF | Jamb & casing, 2 coats 0.017 / LF (RIR) | 0.017 / LF | 470 LF | Ours about 4x slower. Already flagged uncalibrated by TASK-217. Painting book: 270 LF/h per coat cut-in. |
| 5012 Wall paint | 400 SF / day | 0.020 / SF | Closest RIR 2-coat per-SF lines (wallpaper, acoustic) 0.017 / SF | 0.017 / SF | 470 SF | Close. The painting book's 538 SF/h per coat is roll time only, new-construction speed. |
| 9010 LVP | 175 SF / day | 0.046 / SF | Vinyl plank flooring 0.053 / SF (RIR) | 0.053 / SF | 151 SF | Close; Craftsman slightly slower. |
| 9011 Subfloor prep | 100 SF / day | 0.080 / SF | Floor underlayment 0.167 / SY (RIR) | 0.019 / SF | 431 SF | Different job (board underlayment, not grinding/skim). Keep. |
| 9012 Self-leveler | 200 SF / day | 0.040 / SF | none | none | none | Keep. |
| 9013 Flooring removal | 300 SF / day | 0.027 / SF | Remove: sheet vinyl 0.019 / SF, carpet 0.007 / SF, tile 0.080 / SF (RIR) | 0.007 to 0.080 | 100 to 1,160 SF | Ours sits in the middle. Consider separate tile and carpet rates. |

Owner decisions (2026-10-27), applied by migration 212:

| Code | Was | Now | Decision |
|---|---|---|---|
| 2001 Faucet | 6 / day | **7 / day** | New value, between ours and Craftsman |
| 2005 Toilet swap | 3 / day | **4 / day** | New value (2 h each) |
| 2006 P-trap | 6 / day | **9 / day** | New value, between the two books |
| 4007 Deck board set | 5 / day | **6 / day** | New value, between ours and Craftsman |
| 4009 Stair / step repair | 4 / day | **12.5 / day** | Adopt Craftsman |
| 5002 Interior door paint | 6 / day | **9 / day** | Adopt Craftsman (prime + 2 coats) |
| 5003 Trim paint | 120 LF / day | **470 LF / day** | Adopt Craftsman |
| 9013 Flooring removal | 300 SF / day | **410 SF / day** | New value (sheet vinyl pace) |
| 4005 Floating shelf pair | 9 / day | 9 / day | Keep (weak Craftsman match) |
| 2007, 4004, 5012, 9010 | | unchanged | Keep (match Craftsman) |
| 2002, 2003, 4001, 4002, 4003, 4010, 9011, 9012 | | unchanged | Keep (no usable Craftsman line) |

Candidate new rates (not built here; listed for the owner's next decision):
- **Ceiling paint:** 350 SF/h first coat, 375 second (painting book, roll, textured).
- **Baseboard install (4011):** 0.038 / LF, plus 0.022 / LF to remove old.
- **Crown (1012):** 0.046 / LF, 0.098 complex.
- **Chair rail (1013):** 0.038 / LF.
- **Drywall patch (1001):** 1.42 each.
- **Wall framing (4013):** 0.241 / LF.

Acceptance Criteria:
- [x] Owner has marked every row Keep / Adopt / New value; the filled table is in this file.
- [x] One migration applies only the changed rows, each guarded on its seeded value, with a reversal
      comment; `calibrated` untouched.
- [x] Each changed row's `notes` names the source and review date.
- [ ] A unit test pins the new values. Prepare Quote's existing rate tests still pass. Hours for a
      sample quote change only on the rows that changed.
- [ ] After deploy, owner prepares one quote that uses a changed rate and confirms the hours look right.

Source:
`docs/working/craftsman-reference-pricebook.md`; `production_rates` read from prod 2026-10-27.

Effort:
1 h owner review / 2 h build
