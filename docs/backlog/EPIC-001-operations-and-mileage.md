# EPIC-001: Operations & Mileage

The daily operating loop for Dovetails: starting the day, tracking which vehicle
is in use and its odometer, recording where time goes, and keeping that data
trustworthy enough to feed tax mileage, vehicle cost, and job profitability.

## Active tasks

> The TASK-049…057 block is the **Operations Engine** program. Canonical design:
> `docs/canonical/OPERATIONS.md`. Build order and rationale: that doc + the
> approved plan. The model treats the app as an Operations Engine (the historical
> ledger is one component), keeps a live Current Operations State, and makes the
> Business Day a pure aggregate. **Freeze gate: do not start TASK-049/050/054/057
> until TASK-051/052/053/056 (Business Day + Payroll + Activity/State) are
> stable.** (Operational Intelligence moved to EPIC-008 as TASK-055 — it consumes
> these ledgers and belongs with Production Intelligence, not inside the engine.)

> **Time Truth Consolidation (TASK-061…065)** — a strictly-ordered sub-program
> that makes `activity_entries` the single source of truth for time and retires
> the legacy `visit_time_logs` table. Evidence: the audit found `visits/[id]/
> transition/route.ts` already dual-writes both tables (same start, end, and
> visit linkage), so this is a backfill + reader-swap, not a re-architecture.
> The only consumers of `visit_time_logs` are the two invoice-labor readers
> (`lib/invoices/final-invoice.ts`, `lib/invoices/line-items.ts`) — which cross
> into EPIC-004 (billing). **Run in order: 061 → 062 → 063 → 064 → 065. Do not
> touch Job vs Work Order during this program** — the interim model is fixed:
> `Job → Visit → activity_entries`; Work Order stays separate until the time
> truth is clean.

# TASK-061: Backfill legacy visit time into activity_entries

Status:
Done

Problem:
`visit_time_logs` (legacy per-visit timer) and `activity_entries` (the Operations
Engine time ledger) both record visit time. The transition route already
dual-writes, so new visit time lands in both — but the 7 historical
`visit_time_logs` rows predate the dual-write and are missing from
`activity_entries`. Before `activity_entries` can be the single time truth, the
old time must be visible in it.

Business Value:
Old visit time becomes visible in the new time truth, so invoice-labor and
profitability rollups built on `activity_entries` see complete history.

Scope:
- Backfill existing `visit_time_logs` rows into `activity_entries`.
- `activity_type='job_work'`, `entity_type='visit'`, `entity_id=visit_id`,
  carrying `started_at`/`ended_at` from the source row.
- Join visit → job only where a rollup needs `job_id` (activity_entries links to
  the visit; `job_id` is recovered via `visits`).
- Idempotent guard: rerunning must not duplicate entries (skip where a matching
  open/closed `job_work`+`visit` entry already exists).
- Additive, reversible migration; verify in a rolled-back transaction first.

Out of Scope:
- Changing any reader or writer (TASK-062…065).

Acceptance Criteria:
- [ ] Every closed `visit_time_logs` row has a corresponding `activity_entries`
      row (job_work / visit / matching timestamps).
- [ ] Rerunning the backfill creates zero new rows.
- [ ] No invoice or report output changes (this step only adds ledger rows).

Notes:
Risk: low. Depends on nothing. Do not apply out-of-band on garonhome.

# TASK-062: Invoice labor parity test

Status:
Done

Problem:
The two invoice-labor readers sum `visit_time_logs` by `job_id`. Before switching
them to `activity_entries`, we must prove the new source yields identical labor —
this is the money path; a silent drift changes what customers are billed.

Business Value:
Proves invoices do not change before the reader swap; converts a medium-risk
change into a gated, evidence-backed one.

Scope:
- Compare labor minutes/cents from the old source (`visit_time_logs`) vs the new
  bridge (`activity_entries JOIN visits ON v.id=ae.entity_id AND
  ae.entity_type='visit'`, filtered to billable job_work) for the same job.
- Cover the final-invoice labor fallback (`lib/invoices/final-invoice.ts`).
- Cover the manual "pull labor from tracked time"
  (`upsertLaborLineFromTrackedTime` in `lib/invoices/line-items.ts`).
- Use real seeded job/visit examples where possible.
- Must pass (cent-for-cent parity) before TASK-063 ships.

Out of Scope:
- Changing the readers themselves (TASK-063).

Acceptance Criteria:
- [ ] Parity test asserts identical billable labor cents (old vs bridge) for the
      seeded jobs, for both the final-invoice path and the manual pull.
- [ ] Test is wired into the gate and is green before TASK-063 merges.

Notes:
Risk: medium — the money path. Depends on TASK-061 (backfilled history must be
present for parity to hold on historical jobs).

# TASK-063: Swap invoice labor readers to activity_entries

Status:
Done

Problem:
`visit_time_logs` is the de-facto invoice-labor source only because the readers
still point at it. With time truth in `activity_entries`, the readers should sum
the ledger.

Business Value:
Makes `activity_entries` the invoice-labor source so the engine has one time
truth — **a strict source swap, not a billing change.** The bridge is scoped to
reproduce exactly the time `visit_time_logs` recorded (the visit timer's
`auto_visit` `job_work` segments, mirrored 1:1 by the dual-write and backfilled
for history), so billed cents are identical.

Scope:
- Update `apps/web/lib/invoices/final-invoice.ts` and
  `apps/web/lib/invoices/line-items.ts`.
- Replace the `visit_time_logs` sums with the `activity_entries + visits` bridge:
  - `JOIN visits v ON v.id = ae.entity_id AND ae.entity_type='visit'`,
    rolled up by `v.job_id`.
  - Filters: `entity_type='visit'`, `activity_type='job_work'`,
    `voided_at IS NULL`, `started_at IS NOT NULL`, `ended_at IS NOT NULL`.
- The filter set must select exactly the visit-timer segments (and the TASK-061
  backfill of them), so the bridge result equals the old `visit_time_logs` sum.

Out of Scope:
- Removing the `visit_time_logs` writer (TASK-064) — both still exist; only the
  read source moves.
- **Billing any time the old timer never recorded.** Manually-logged billable
  `job_work` time that has no `visit_time_logs` counterpart is deliberately *not*
  pulled in here — that would change billed cents and break the TASK-062 parity
  contract. Whether to start billing such time is a separate, opt-in product
  decision (a future task), not part of this swap. If the parity test surfaces
  such rows, the swap's filter must exclude them (e.g. require the backfilled/
  `auto_visit` provenance), not absorb them.

Acceptance Criteria:
- [ ] Both readers source labor from `activity_entries` via the bridge.
- [ ] TASK-062 parity test passes against the new readers.
- [ ] Invoice labor cents unchanged on every seeded job — including any job that
      has manual `job_work` time with no `visit_time_logs` row.

Notes:
Risk: medium. **Gated behind TASK-062** — do not merge until parity is green.
Note on `labor_bucket='billable'`: only add that filter if it does not change the
result vs. the visit-timer set; the parity contract wins over filter elegance.

# TASK-064: Remove visit_time_logs writer

Status:
Done

Problem:
After TASK-063, nothing reads `visit_time_logs`, but the transition route still
writes it alongside `activity_entries` — a redundant dual-write.

Business Value:
Stops dual-writing time; one write path, one source of truth.

Scope:
- Remove the `visit_time_logs` INSERT (in_progress) and UPDATE-close
  (completed/cancelled) from `apps/web/app/api/v1/visits/[id]/transition/
  route.ts`.
- Keep the adjacent `activity_entries` write unchanged.
- Update `apps/web/app/api/v1/visits/__tests__/visits.unit.test.ts` to assert the
  activity-entry behavior instead of the visit-timer behavior.

Out of Scope:
- Dropping the table (TASK-065).

Acceptance Criteria:
- [ ] No code writes `visit_time_logs`.
- [ ] Visit transitions still produce the correct `activity_entries` job_work
      segment (start on in_progress, close on completion/cancel).
- [ ] Tests assert activity-entry behavior; gate green.

Notes:
Risk: low after TASK-063 (the write is already redundant once readers have moved).

# TASK-065: Retire visit_time_logs table

Status:
Done

Problem:
Once nothing reads or writes `visit_time_logs`, the table is dead weight and a
second, drift-prone time source.

Business Value:
Removes the old time source; `activity_entries` is the sole time truth.

Scope:
- Confirm no readers, no writers (grep + gate).
- Confirm invoices source labor from `activity_entries` (TASK-063 deployed).
- Drop `visit_time_logs` in a reversible migration (recreatable from
  `db/migrations/043_visit_time_logs.sql`).
- The historical time already lives in `activity_entries` via TASK-061 — the drop
  loses no data.

Out of Scope:
- Job vs Work Order promotion (explicitly deferred; interim model is
  `Job → Visit → activity_entries`).

Acceptance Criteria:
- [x] `visit_time_logs` no longer exists in the schema.
- [x] Down-migration recreates it cleanly.
- [x] No reader/writer references remain.

Notes:
Merged in PR #410 (migration `134_drop_visit_time_logs.sql` + helper/test cleanup,
gate green). The drop is reversible per migration 043. Applying the migration to
garonhome production remains a deploy step — do not apply out-of-band; run it
through the normal migration path after confirming invoices read from
`activity_entries`.

# TASK-059: My Day start-surface consolidation (remove odometer-unlocks-day framing)

Status:
In Progress

Problem:
After the Operations Engine landed, My Day still carried the old framing that
fought the new model: a "Start Your Workday — log starting odometer to unlock day
tracking" hero (the day does NOT start via mileage anymore) and a "Complete &
Close Day" button that faked a close (toast + navigate, no business_days change)
and re-coupled mileage to the day ("close your mileage session before you can
close your day").

Business Value:
The Today header (Clock In / Open Day) is the unambiguous day-start; the rest of
My Day stops contradicting it.

Scope:
- Reframe the start_day hero to a Mileage Session (it lives under the "Start
  Mileage Session" tab), not "your workday"; drop the odometer-unlocks-day copy
  and the hardcoded name.
- Remove the fake, mileage-coupled "Complete & Close Day" button; the real,
  checklist-gated close is the Business Day control in the header. The tab becomes
  end-of-day review only.

Out of Scope:
- A full visual merge of the header + stepper into one block (later if wanted).

Acceptance Criteria:
- [ ] No "unlock day tracking" / "Start Your Workday" framing on the mileage tab.
- [ ] One day-close path (header); closing mileage/timer never closes the day.

Notes:
Follow-up to TASK-051/052. Verified against the live app via screenshots.

# TASK-051: Business Day aggregate (decouple day close)

Status:
Proposed

Problem:
"End Day" conflates four unrelated lifecycle events — stopped driving, stopped
tracking time, job done, day over. Ending one must not end the others.

Business Value:
A flexible day container that never auto-closes; the foundation every other
Operations Engine concern hangs off.

Scope:
- New `business_days` table (migration 127): account/user/date, status
  `OPEN|ACTIVE|PAUSED|READY_TO_CLOSE|CLOSED|REOPENED`, opened/closed_at,
  reopened_reason, notes. Owns nothing — records reference it; it summarizes.
- Replace "End Day" with "Review & Close Day" in `my-day/MyDayView.tsx`; migrate
  `WorkdayPanel` start/end onto the container.

Out of Scope:
- Day Close checklist (TASK-054); payroll/activity/mileage internals.

Acceptance Criteria:
- [ ] Ending a trip / activity / job, or returning home, leaves the day OPEN.
- [ ] Only an explicit close sets CLOSED; Reopen works with a reason.
- [ ] Migration additive + reversible; account-scoped RLS.

Notes:
Phase 1. Foundation for the freeze gate.

# TASK-052: Payroll clock + payroll policies

Status:
Proposed

Problem:
There is no record of paid working time distinct from what task was being done.

Business Value:
Employee-style "was this person working?" time, independent of activity — the
basis for payroll and true labor burden.

Scope:
- New `time_clock_sessions` table (migration 128): business_day_id, clock_in/out,
  status, `pay_type (hourly|salary|piecework|subcontractor|owner_draw)`,
  hourly_rate_snapshot, break_policy, voided_at, correction_reason.
- All pay types derive from the one clock; only the calculation differs.
- Field Clock In / Clock Out; after clock-in prompt "What are you doing now?".

Out of Scope:
- Payroll calculation/payout; activity coupling (must stay independent).

Acceptance Criteria:
- [ ] Clock spans many activities; switching activity never touches the clock.
- [ ] Corrections void + re-add, never delete.
- [ ] Account-scoped RLS; additive migration.

Notes:
Phase 2.

# TASK-053: Activity + Assignment model

Status:
In Progress

Problem:
Activity today conflates the verb (driving, working) with the business object
(Job #241), so "same job, switched task" can't be expressed cleanly.

Business Value:
Clean job-costing: Activity = verb, Assignment = object; labor_bucket derives.

Scope:
- Extend `activity_entries` (migration 129, additive): `business_day_id`,
  `time_clock_session_id`, `labor_bucket (billable|overhead|personal|warranty)`,
  non-entity `assignment_kind (office|shop|inventory|training|none)`.
- Reuse `entity_type/entity_id` as the assignment link; extend the activity-verb
  enum + labels in `packages/domain/src/activities.ts`; map activity+assignment →
  labor_bucket. Reuse `/api/v1/activities/switch` for Change Activity/Assignment.

Out of Scope:
- Current Operations State (TASK-056); presence (TASK-057).

Acceptance Criteria:
- [ ] Activity verb and Assignment object are independently settable.
- [ ] labor_bucket mapping is a unit-tested pure rule.
- [ ] Switching keeps payroll running; one-active invariant preserved.

Notes:
Phase 3.

# TASK-056: Current Operations State (live state machine)

Status:
In Progress

Problem:
Nothing describes the user's current operational state, so automation has to
search/reconstruct context every time.

Business Value:
The app always knows NOW (clocked-in? · activity · assignment · vehicle ·
presence · pending question), making one-tap automation cheap.

Scope:
- A derived read-model (one API) computed from the open rows (clock session,
  activity entry, vehicle session, latest presence) — derive-first, no
  sync-prone cache table unless proven necessary.
- Expose current state + valid transitions; power proactive prompts.

Out of Scope:
- The inbox UI (TASK-049); persisting state history.

Acceptance Criteria:
- [ ] One endpoint returns the live state from open records.
- [ ] State transitions are documented and unit-tested.

Notes:
Phase 3. Pairs with TASK-053.

# TASK-050: Link mileage ↔ travel-time + capture-method + reconcile

Status:
Proposed

Problem:
`vehicle_sessions` has no link to travel-time, no record of how a mileage number
was captured, and a drive can be logged twice (manual odometer + auto GPS).

Business Value:
Trustworthy mileage: one tap yields linked mileage + travel-time, every number
shows its capture method, duplicates reconcile.

Scope:
- Extend `vehicle_sessions` (migration 130, additive): `business_day_id`,
  `activity_entry_id` FK, `miles_source (odometer|manual_miles|gps_estimate|
  bt_gps_estimate)`, `status (open|closed|voided)`.
- One hybrid "Confirm trip" in `activities/segments/[id]`: atomic travel entry +
  linked session + segment stamp; segment is the dedup key. Odometer-vs-GPS
  reconcile (odometer wins, void never delete). Reuse `lib/mileage/sessions.ts`.

Out of Scope:
- BT pre-fill UI (rides this via TASK-025).

Acceptance Criteria:
- [ ] Confirming a drive yields one travel entry + one linked session; idempotent.
- [ ] Enclosing odometer close offers reconcile and voids GPS estimates.
- [ ] Capture method recorded and shown.

Notes:
Phase 5. Advances TASK-027; closes TASK-025's confirm UI.

# TASK-054: Day Close checklist + Reopen

Status:
Proposed

Problem:
The blunt End Day button closes everything at once with no review.

Business Value:
A deliberate close after review; Reopen is normal, not an error.

Scope:
- Checklist gating `business_days → CLOSED` (payroll, activities, mileage,
  materials/expenses, inbox cleared/deferred, notes). Reopen with reason → ACTIVE.

Out of Scope:
- Locking historical records on close.

Acceptance Criteria:
- [ ] Close requires the checklist; Reopen records a reason and returns to ACTIVE.

Notes:
Phase 7.

# TASK-023: Daily Command Center UX Modernization

Status:
Completed

Goal:
Redesign the Daily Command Center so it feels like the supplied mockups: clean, mobile-first, visually polished, fast to use, and organized around the technician's real workday.

Scope:
- State-driven dashboard UI (Before Day Starts, Active Day, End of Day).
- Mobile-first responsive layout matching mockup aesthetics.
- Quick activity chips for single-tap switching on the NowBar.
- Inline checklist wizard for End of Day closing.

Out of Scope:
- Business Ledger.
- New database tables.
- Core business logic changes.

Acceptance Criteria:
- [x] Dashboard has a clear state-driven layout.
- [x] Start Day is visually dominant before the day starts.
- [x] Active NowBar is visually dominant during the workday.
- [x] Quick activity chips support one-tap switching.
- [x] End Day checklist is visually dominant when closing the day.
- [x] Mobile layout resembles the clarity and polish of the supplied mockups.
- [x] Desktop layout uses sidebar + clean card grid.
- [x] Existing mileage/session/activity functionality still works.
- [x] No new untracked feature work is introduced.
- [x] pnpm gate:fast passes.

# TASK-035: MCP Write Tools v1 (low-risk operations writes)

Status:
Proposed

Problem:
The MCP server (TASK-033) is read-only. Once it proves useful in daily use, the
highest-value next step is a small set of **low-risk** write tools that support
the Daily Operations Log vision — capturing notes, time, and mileage from an AI
client without opening the app.

Business Value:
- Lets the owner log the day's work conversationally from the field.
- Directly feeds the time ledger and daily operations log that already exist.
- Keeps writes small and reversible so the safety model can be proven on
  low-stakes actions before anything financial.

Scope:
First write tools, each layered on the existing service layer:
- `create_job_note`
- `log_activity_entry`
- `log_mileage`
- `start_day`
- `end_day`

Cross-cutting requirements for every write tool:
- Explicit confirmation flag on the tool input (no silent writes).
- Audit log entry written for each mutation.
- Workflow event emitted where the action has downstream automations.
- Account scoped (and owner/admin gated) exactly as the read tools are.
- Idempotency protection where appropriate (e.g. `start_day` must not create a
  second open day; `log_mileage` should dedupe a repeated submission).
- Writes go through the web app's service layer, not new parallel SQL.

Out of Scope:
- Invoice creation, payment recording, job status editing.
- Any Square / payment-provider action.
- Any Home Assistant action.
- Bulk or destructive operations.

Acceptance Criteria:
- [ ] The five tools above create the correct records, account-scoped.
- [ ] Each write requires an explicit confirmation flag.
- [ ] Each write produces an audit log entry (and workflow event where relevant).
- [ ] Idempotency is enforced where it matters (start/end day, mileage).
- [ ] Unit + integration tests cover happy path, scoping, and idempotency.

Notes:
Originally framed as `EPIC: MCP-WRITE-V1`; recorded here as a single task under
Operations because all five tools are operations-centric. Split into multiple
tasks if the build proves large. Do **not** start until TASK-033 has been in
real daily use and TASK-034 (non-superuser RLS verification) is considered.

## Completed

- [TASK-001: Vehicle Mileage Sessions](done/TASK-001-vehicle-mileage-sessions.md) — Done
- [TASK-002: Vehicle Session Recovery](done/TASK-002-vehicle-session-recovery.md) — Done
- [TASK-003: Wrong Vehicle Correction](done/TASK-003-wrong-vehicle-correction.md) — Done
- [TASK-004: Daily Operations Log](done/TASK-004-daily-operations-log.md) — Done
- [TASK-005: Activity Tracking](done/TASK-005-activity-tracking.md) — Done
- [TASK-019: Activity Timeline Correction](done/TASK-019-activity-timeline-correction.md) — Done
- [TASK-021: Quick Activity Switching](done/TASK-021-quick-activity-switching.md) — Done
- [TASK-022: Smart Start Day](done/TASK-022-smart-start-day.md) — Done
