# TASK-107: AI Day Draft (GPS + jobs + receipts → one confirm)

Status:
Done

Phase:
1

Problem:
Day Review still asks the owner to confirm visits, stops, and drives as
separate piles. The evidence is already in the system (GPS, scheduled
visits, receipts, clock). The owner should see one proposed day and only
handle exceptions.

Business Value:
End-of-day review becomes "does this look right?" instead of 20 taps.
Ready items write through the existing confirm paths. The ledger still
only changes when the owner accepts.

Scope:
- Pure `assembleDayDraft` (packages/domain): ready vs exception vs already
  logged, from segments + visit candidates + same-day expenses + clock.
- Day Review **Day draft** section: accept ready items in one tap; list
  exceptions. Confirm uses existing visit-candidate and segment PATCH
  routes (no second writer).
- Optional "Write a summary" (Anthropic) that cannot change items.

Out of Scope:
- Habit learning across days.
- Auto-accept without a tap.
- Merging split same-place stops.

Acceptance Criteria:
- [x] A scheduled high-confidence stop is ready as job work.
- [x] A supply-house stop with a matching receipt is ready as material run.
- [x] An unlabeled stop or a drive with no GPS miles is an exception.
- [x] Accept writes through existing confirm routes; nothing is written
      until the owner taps Accept.

Notes:
Draft then confirm. Evidence first — the owner does not narrate the day.

Shipped: PR #602 (2026-08-15). Daily Recap later deleted as TASK-110 (#605).
Truth-pass archive 2026-08-17.
