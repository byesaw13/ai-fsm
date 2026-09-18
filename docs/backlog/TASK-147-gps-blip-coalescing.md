# TASK-147: GPS blip coalescing — one dwell, one stop

**Epic:** 007 (Operations & Mileage / location capture)
**Status:** Done (PR #654)

## Problem

A sub-minute GPS/activity "blip" while parked at a job (a spurious
`in_vehicle` reading or a zone flicker) splits one real dwell into two stops.
The segmentation reducer (`apps/web/lib/location/segments.ts`) closes the stop,
opens a phantom drive, then opens a second stop at the same place. The phantom
drive is dismissed as noise (`classifyDrive` < 60s), but nothing merges the two
flanking same-place stops — and `classifyStop` only suppresses *short* stops,
not a long dwell cut in half. Both halves surface as separate end-of-day
stop-interview cards, so the owner is asked to close out the same job twice
(three times with a materials run added).

## Fix

Coalesce at the ingest route. When the drive that just closed was a noise blip
and the reducer opens a stop at the same place as the stop that preceded the
drive, the dwell never really ended — reopen the prior stop instead of leaving a
duplicate.

- [x] `stopsAreSamePlace(a, b)` pure helper in `segments.ts` — same zone, or
      coordinates within `STOP_ANCHOR_RADIUS_M` (40m). Unit-tested.
- [x] `apps/web/app/api/internal/location/route.ts`: on close-noise-drive →
      open-stop, look up the prior stop (`ended_at = drive.started_at`); if same
      place, clear its `ended_at` (+ un-dismiss) and skip the duplicate insert.
- [x] Regression tests in `segments.test.ts` (radius/zone decision + blip
      sequence). Full web unit suite green.

## Out of scope

- Auto-attributing a recognized supplier stop (Home Depot/Lowe's) to the day's
  active job — that's a separate stop-interview UX improvement; the store run
  already links to a job when answered "store" today.
