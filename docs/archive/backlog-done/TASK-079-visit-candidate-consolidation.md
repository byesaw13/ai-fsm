# TASK-079: Visit-candidate consolidation + Day Review de-noise

Status:
Done

Phase:
1

Problem:
A single field day at one property produces dozens of visit candidates and a wall
of "Likely noise" micro-drives. `detectVisitCandidate` creates a candidate for
*every* closed stop with no dwell floor, so 0/1/2-minute GPS-jitter stops each
become a card. Day Review lists them 1:1 (35 identical "Joseph Legerstee · 68
Claremont · N min" cards), so the owner can't tell them apart or confirm them, and
"Confirm All" would write 35 ledger rows for one job. The Time list shows every
auto-dismissed noise drive too. (TASK-076 anchors a stop's pin but does not reduce
candidate count or the drive churn.)

Business Value:
Day Review becomes reviewable: one row per property to classify, jitter stops
never become candidates, and the noise drives collapse out of the way — without
touching the honest per-session ledger entries.

Scope:
- **Dwell floor (capture):** `detectVisitCandidate` skips a stop under
  `VISIT_CANDIDATE_MIN_DWELL_MINUTES` (~3) when there is no scheduled visit today
  for the property. Scheduled visits still capture (you did arrive). Pure gate,
  unit-tested.
- **Group Day Review by property (display):** the candidate list groups pending
  candidates by property — one row showing "N visits · total min"; a classification
  applies to every candidate in that group (confirm-all-as-job-work, or ignore-all).
  Confirming still writes one honest activity_entry per real session — the
  consolidation is the *review*, not a fake merged duration. Handles the already-
  captured backlog too (no migration).
- **Collapse noise drives (display):** the Time list collapses consecutive
  auto-dismissed `is_likely_noise` segments into one "N low-signal segments"
  expandable line instead of a wall.

Out of Scope:
- Merging stops into one candidate at capture / rewriting durations (kept honest:
  one entry per real on-site session).
- The drive-open displacement guard in the reducer (follow-on to TASK-076).
- Retroactively deleting already-captured jitter candidates (the grouping makes
  them reviewable; the dwell floor prevents new ones).

Acceptance Criteria:
- [x] A sub-dwell stop with no scheduled visit does not create a candidate; the
      gate is a pure, unit-tested predicate.
- [x] Day Review shows one row per property with the visit count + total minutes;
      a classification confirms/ignores all of that property's candidates at once.
- [x] The Time list collapses auto-dismissed noise segments; a real stop/drive
      still shows.
- [x] No migration; per-session ledger entries are unchanged on confirm.

Notes:
Phase 1 maintenance of the shipped capture pipeline (TASK-024/040–044). Pairs with
TASK-076 (pin anchoring). Reuses the existing confirm flow — no ledger-duration
change.

Notes (Wave 0b close):
Wave 0b verify 2026-08-05: PASS (app complete).
Evidence:
- shouldCreateVisitCandidate + VISIT_CANDIDATE_MIN_DWELL_MINUTES pure + visit-matching.test.ts (30 tests)
- location ingest uses dwell floor (apps/web/app/api/internal/location/route.ts)
- groupVisitsByProperty + VisitsSection Confirm All + group-visits.unit.test.ts (4 tests)
- TimeSection collapses is_likely_noise into "N low-signal segments hidden"
