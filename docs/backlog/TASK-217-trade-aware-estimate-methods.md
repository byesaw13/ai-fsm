# TASK-217: Trade-aware estimating methods in Prepare Quote

Status:
In Progress

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Problem:
Prepare Quote knew two kinds of work: wall painting and "other". Its prompt
told the model that ceilings, trim and drywall patching are "other", so those
tasks took the model's guessed hours and materials even though the app has
rate 5003 (trim), price book 5021 (ceiling) and 1001 to 1004 (drywall
patches). The kind of work was not stored, so the owner could not see how a
number was reached. Labor was counted twice in two ways: every task was told
to include setup and cleanup next to a whole-job setup task, and whole-room
price book entries (5020, 5022) could land on a single surface.

Business Value:
Recognized work is estimated by its own trade method, and the owner can see
which method set each number and what it is missing.

Scope:
- Classification and estimating method are separate. The model classifies
  each task (wall, ceiling or trim painting, drywall prep, generic); code picks
  the method from the data that exists and writes each limitation as a note.
  Stored on the task: `method` and `estimate_notes` (missing, limitation,
  assumption).
- Methods (existing data only):
  - Wall painting: rate 5012 (unchanged), paint from the net wall area.
  - Ceiling painting: no ceiling rate exists, so price book 5021 (per room,
    flagged as not scaling with area); paint from the ceiling area.
  - Trim painting: rate 5003, marked uncalibrated (owner decision 2026-10-27);
    price book 5003 per room only when the rate is missing; paint from length
    at 0.5 sq ft per foot (the room-by-room estimator's equivalent).
  - Drywall prep: ordinary nail-hole filling in a room whose walls are painted
    is part of rate 5012's standard prep (no extra hours). Larger patches,
    texture matching and repairs needing a return visit use price book 1001 to
    1004, once per room, not per hole. Patching materials are flagged unpriced.
  - Generic: price book or the model's allowance, noted.
- No double counting: shared setup and cleanup are one whole-job task;
  task-specific preparation and protection stay with the task; rate-based hours
  are not reduced for setup. Whole-room price book entries never price one
  surface. Touch-up in a room whose walls are repainted starts left out.
- A missing measurement leaves paint unpriced with a note, never a guess.
- Revise with a note uses the same methods and room rules for added work.
- Screen: each task shows its kind of work, hour source ("production rate
  (uncalibrated)") and notes; room rows flag missing measurements, rates or
  prices. No new customer-facing rows; owner can still override hours.

Out of Scope:
Calibrating rates (TASK-193), a ceiling production rate, patch-size and caulk
formulas (TASK-216), paint package sizes (TASK-212).

Acceptance Criteria:
- [x] Room with 400 sq ft walls, 100 sq ft ceiling, 40 LF baseboard and six
      nail holes: walls 6.75–9.25 h (rate 5012), ceiling 2–3 h (price book
      5021, limitation noted), baseboard 2.25–3 h (rate 5003, uncalibrated),
      nail holes 0 h (in wall prep); paint 3 + 1 + 1 gal; one labor and one
      materials line for the room.
- [x] Generic only for work no method fits.
- [x] Hours and materials do not depend on the selling rate.
- [x] Whole-room entries, per-hole patch hours and touch-up over repainted walls
      are not counted twice.
- [ ] Live check after deploy: Prepare Quote on a real assessment shows
      methods and notes (needs API credit).

Related:
TASK-184 (wall pace), TASK-193 (calibration), TASK-216 (formula families).
