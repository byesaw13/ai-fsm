# TASK-021: Quick Activity Switching

Status:
Done

Problem:
Switching activities mid-day costs too many taps, so in practice the owner
doesn't switch — travel stays running through job work, a tool run never gets
recorded, and the day's ledger drifts. The best correction is preventing bad
data in the first place. If a switch is slower than the work it interrupts, it
won't happen.

Business Value:
- More accurate activity data at the source (fewer corrections needed later).
- Less friction in the field → higher logging compliance.
- Better mileage, job costing, and utilization because the timeline reflects
  reality as it happens.

Scope:
- Surface the top ~4 activities as one-tap chips on the Daily Command Center.
- One-tap switching (no modal, no extra confirmation).
- Prioritize recently/most-used activities so the common switch is always front
  and center.
- Reuse the existing `/api/v1/activities/switch` endpoint (atomic close-and-open
  already implemented).

Out of Scope:
- The full activity picker (the existing bottom sheet stays for the long tail).
- Timeline correction (TASK-019) — this is prevention, that is repair.

Acceptance Criteria:
- [x] Top 4 activities shown as chips.
- [x] One-tap switching with no modal.
- [x] Last-used activities prioritized.
- [x] Switch completes (perceived) under 500ms.

Notes:
Shipped. The Now bar (`apps/web/app/app/ActivityTracker.tsx`) renders one-tap
quick-switch chips with an optimistic update (the tapped activity shows
immediately, reverting on error) for perceived sub-500ms switching; the full
activity sheet stays behind a "More…" button for the long tail. Chip ordering is
a pure, tested policy in `apps/web/lib/activities/quick-switch.ts`
(`pickQuickActivities`: most-recently-used-today first, topped up with field
defaults). The same-type no-op guard intentionally lets a tap through when the
active entry is entity-linked (e.g. job_work started by a visit) so the user can
move to unlinked work. Reuses the idempotent `/api/v1/activities/switch`.
Embodies the Mobile First Field Rule. Builds on TASK-005 (`activity_entries`).
