# TASK-134: Complete fork — done vs coming back

Status:
Proposed

Phase:
3

Problem:
Every Complete path (`NextVisitHero`, visit `CompletionChecklist` /
`VisitTransitionForm`, dashboard Jobs Today) is a single visit transition.
Nothing asks whether the **job** is finished.

Business Value:
Bonnie (done today) and Landing (coming back) stop sharing one button that always
means “left the driveway.”

Scope:
- After a successful visit `completed` transition (or wrapping it), show a
  required fork: **Done with this job** / **Coming back**.
- Persist the choice on the visit (nullable additive column, e.g.
  `visits.closeout_kind` = `done` | `return` — **or** derive: `done` iff job
  transitioned to `completed` in the same closeout. Prefer a column so a crash
  between visit complete and job complete is recoverable).
- All field Complete entry points use the same fork. Do not fork only My Day.
- Coming back must **not** let `syncWorkOrderStatus` mark the work order
  completed when more days are expected.
- Business day stays open (TASK-119). Quick-job photo packet skip unchanged.

Out of Scope:
- Invoice copy (TASK-136)
- Next-visit scheduling (TASK-135)
- Briefing UI (TASK-137)
- Changing completion packet / signature rules

Acceptance Criteria:
- [ ] Completing a visit without answering done vs coming back is impossible on
      phone Complete (My Day, visit page, dashboard)
- [ ] Done is stored and can complete the project in TASK-136
- [ ] Coming back leaves job `in_progress` and does not auto-complete the WO
- [ ] Quick-book visit still skips photos/signature; day does not close
- [ ] Unit tests: WO stays open on return; job does not complete on return
- [ ] Existing visit complete still stops open `activity_entries` on that visit

Notes:
API today: `POST /api/v1/visits/:id/transition`. Job complete today is a separate
`POST /api/v1/jobs/:id/transition`. Keep those lifecycles; the fork is the seam
between them.
