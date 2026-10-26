# TASK-194: Baseline panel, send rules and freeze at send

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Parent:
TASK-188

Problem:
Nothing shows the owner how a quoted price compares with the company's hourly
rate, and nothing stops sending a quote with missing hours or costs.

Scope:
- Pure `computeHourlyBaseline` in `packages/domain` (TASK-188 formula).
- Baseline panel on the estimate (owner/admin): hours range and sources,
  baseline low / mid / high, quoted price, gap in $ and %, effective labor rate
  against the cost floor, "Hours incomplete" or "Costs not confirmed" labels.
- Settings: `baseline_warning_pct`, default 10.
- Per-estimate "include handling in baseline" switch, default off; materials
  and handling shown separately.
- Other direct costs field and "Direct costs confirmed (including $0)" action.
  Any edit to lines, hours, other direct costs or the handling switch clears
  the confirmation and any cost-floor acknowledgment.
- Send route (`apps/web/app/api/v1/estimates/[id]/send/route.ts`): refuse with
  422 and a list of what is missing while hours or direct costs are
  incomplete; when complete and the effective rate is below the cost floor,
  require an acknowledgment (stored as cost_floor_ack_at/by); write
  baseline_snapshot in the draft-to-sent transaction. Warnings never block.
- "Before you can send" checklist on every draft that is not ready: one row per
  missing item (each labor line without hours, flat quote without a range,
  materials or equipment line without an amount, unconfirmed direct costs),
  each linking to its field. Shown on open, not only after a failed Send.
  Existing drafts created before this work get the same checklist.
- Good/Better/Best quotes: the panel shows "Baseline not available for option
  quotes yet (TASK-183)"; no combined baseline; the new send rules are skipped
  for them.

Acceptance Criteria:
- [ ] The TASK-188 acceptance criteria for send rules, warnings, threshold,
      handling, freeze, existing drafts and option quotes all pass.
- [ ] The panel is hidden from tech users.
- [ ] An existing draft with two labor lines missing hours shows two checklist
      rows; each link opens the matching field.

Effort:
2 days.
