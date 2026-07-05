# TASK-027: Hybrid tracking — manual mileage, auto time

Status:
Done

Phase:
1

Problem:
The old manual flow (Start Day → vehicle session + tapping activity chips) and
the new auto location capture both record the same hours, so they collide: a
manual `travel` entry overlaps the auto drive/stop segments, and the overlap
guard then blocks confirming the auto data ("conflicts with time already
marked"). GPS also can't match the odometer for mileage accuracy.

Decision (owner, 2026-06-20):
**Hybrid — manual mileage, auto time.** Keep Start Day's odometer session as the
mileage record (odometer accuracy); let auto-capture own activities/time. Interim
"until tracking is close to flawless."

Approach (this pass):
- Auto **drives confirm as a `travel` activity** (time), same as stops — not as
  GPS mileage. The drive→mileage "Log trip" UI is removed from the segments panel
  (the `log_trip` API stays for later); mileage comes from Start Day's odometer.
- Guidance: don't tap the NowBar activity chips when auto-capture is on — let the
  timeline fill and confirm there, so nothing overlaps.

Out of Scope (this pass / follow-ups):
- Overlap *resolution* (offer to replace an overlapping manual entry instead of a
  hard block) — a follow-up if collisions still happen.
- Suppressing/hiding the NowBar activity chips during an auto-captured day.
- Trusting GPS mileage (revisit when tracking is tighter).

Acceptance Criteria:
- [x] An auto drive can be confirmed as a `travel` activity in one tap.
- [x] Start Day mileage and auto activities no longer double-count the same time
      when the owner stops manually tapping activities.

Test gap (documented):
This pass is a UI-wiring change — the segments panel now invokes the existing,
already-exercised `confirm` action for drives (same path stops use) instead of
`log_trip`. No new business logic: the segmentation reducer is unit-tested
(`segments.test.ts`) and the `confirm` endpoint/overlap guard are unchanged and
covered by integration/e2e. The web app has no React-component test harness
(`@testing-library/react` is not a dependency), so a focused panel unit test is
not added here; standing up RTL is out of scope for this fix.

Notes:
Archived during north-star reconciliation (2026-07-03). Shipped in
`apps/web/app/app/LocationSegmentsPanel.tsx`.