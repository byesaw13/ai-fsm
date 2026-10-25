# TASK-184: Wall area and painting hours that match the room

Status:
Done (2026-10-25)

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Problem:
A real assessment (seven rooms, interior repaint) prepared a quote whose
quantities did not match the house. The owner's notes said "13 feet of paint",
"small wall 7 ft", "one wall built in 13.6, cabinet 5.3", and "entertainment
center 18 x 8"; the room record had no place for any of it, so every wall was
counted at full height. A vaulted living room used its 18 ft peak as the height
of every wall. Large unpainted areas typed into the opening box (inches) took
off almost nothing. Wall painting hours came from a flat per-room price book
entry (7–11 h for both a 466 and a 277 sq ft room) or the model's guess, and
the wall production rate (200 sq ft a day) was too slow to use.

Business Value:
The quote's area, hours and paint follow what is actually painted, so the
price can be trusted without redoing the math by hand.

Scope:
- Room fields: walls to paint (label, length ft), areas not painted (label,
  width and height ft), and a vaulted peak height. Listed walls replace the
  perimeter; skip areas are deducted; a peak adds a gable triangle to both end
  walls. Opening widths are labelled in inches.
- Prepare Quote: the model marks wall painting tasks; they use the net wall
  area, hours from the owner's pace (production rate 5012, slower above
  10 ft by its vaulted modifier, plus or minus 15%) ahead of the price book's
  flat hours, and paint gallons from the area (two coats, 350 sq ft per gallon,
  10% waste) at the grade asked for.
- Migration 207: production rate 5012 from 200 to 400 wall sq ft a day
  (owner: average pace).

Acceptance Criteria:
- [x] A room with listed walls is measured from those walls only.
- [x] Built-ins and cabinets entered as areas are deducted by their size.
- [x] A vaulted room counts the gable ends, not the peak on every wall.
- [x] Wall painting hours scale with area and slow down for tall walls.
- [x] Paint materials come from the area, not a guess.
- [x] Rooms saved before this change measure the same as before.

Notes:
Unit tests use the real rooms as fixtures (foyer, office, living room).
Prepare Quote keeps one draft per visit; an existing draft is not re-prepared.
