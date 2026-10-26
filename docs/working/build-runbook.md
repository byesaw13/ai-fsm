# Build runbook: hourly baseline, estimate fixes and estimating assistant

This is the single document an AI agent follows to build everything decided on
2026-10-26, without being told the next step. It is also the progress record:
the agent ticks boxes and updates "Current state" as it goes, so another agent
can continue where the last one stopped.

## How to start (prompt for any AI)

> Read `docs/working/build-runbook.md` (on `main`; if it is not on `main` yet,
> read it from branch `spec/estimating-assistant-phase3`). Follow "Operating
> rules" exactly. Resume from "Current state". Work until you reach an owner
> gate or the end of the list, then stop and report.

## Current state

The agent updates this block at the end of every step, in the same PR as the
work (or a docs-only commit when a step has no PR).

```
Last completed step : S0.1 (runbook written, 2026-10-26)
In-flight PR        : none
Next step           : S0.2 (owner approval of the formula document) — OWNER GATE
Blocked on          : owner approval G1
Last deploy         : none from this runbook
Notes               : PR #720 and #721 are open, docs only; #721 is stacked on #720.
```

## Owner approvals

| Gate | What | Status | Evidence |
| --- | --- | --- | --- |
| G0 | Autonomy: agent may merge and deploy after all gates pass | Approved 2026-10-26 | Owner, in session |
| G0b | Estimating assistant design, roadmap change, provisional pilot criteria (PR #721) | Approved 2026-10-26 | Owner, in session |
| G1 | Hourly baseline formula document `docs/working/hourly-baseline.md` (PR #720) | **Pending** | |
| G2 | Paint pilot passed its success criteria (before TASK-216) | Pending (after pilot) | |
| G3 | Each stale "sent" estimate to close (TASK-206) | Pending, per estimate, non-blocking | |
| G4 | Database restore from backup (only if a deploy corrupts data) | Ask every time | |

An approval counts only when the owner states it in a session (the agent
records it here with the date) or in a comment on the PR from the owner's
GitHub account (`byesaw13`). Never infer approval.

## Operating rules

### Autonomy (G0)

The agent may, without asking: create branches, write code and tests, open
PRs, answer and resolve review-bot comments, merge when every merge gate
passes, deploy to production after a merge, run the post-deploy checks, and
revert its own change if production breaks. It must stop and ask only at the
owner gates listed above, or under "Stop conditions".

### One task, one loop

For every unchecked task, in list order (a task whose dependencies are not
done is skipped and the next eligible one taken):

1. **Sync.** `git fetch && git switch main && git pull --ff-only`. Confirm the
   task is not already done: check this file, `gh pr list --state all --search
   "TASK-NNN"`, and `git log --oneline main | grep TASK-NNN`. If a PR exists,
   continue it instead of starting over.
2. **Branch.** `git switch -c task/NNN-short-name`.
3. **Read.** The task file in `docs/backlog/`, its section of the plan named
   in the task list below, and the design it cites. Read the code before
   changing it.
4. **Build test first.** Write the failing tests from the plan, see them fail,
   implement, see them pass.
5. **Check locally (memory-safe).** Before any check, confirm no local dev
   server runs (`ps -u nick -o pid,cmd | grep "next dev"`; stop it by PID,
   never `pkill -f`) and `free -m` shows room. Run `pnpm lint`,
   `pnpm typecheck`, `pnpm test:unit`; run `pnpm test:integration` when the
   task has integration tests and `TEST_DATABASE_URL` is set. Do **not** run
   `pnpm build` or `pnpm gate` locally (earlyoom kills it on garonhome and it
   has dropped production before); CI runs the build. Say so in the PR.
6. **Docs in the same PR.** Tick the task in this file, update "Current
   state", set the backlog task's Status (`In progress` while open, `Done` with
   date at merge and move it to `docs/archive/backlog-done/`, update
   `docs/backlog/README.md` and `apps/web/app/app/map/work-items.json` (Done
   rows come off the map; the map unit test must pass), and update the bubble
   text in `apps/web/app/app/map/map-data.ts` when a job step's behavior
   changes. Delete code the task replaces (knip gate).
7. **PR.** Title `<summary> (TASK-NNN)`; body: what changed, tests, which
   local checks ran and that CI runs the build, migration notes, rollback.
   End commit messages with `Co-Authored-By: Claude Opus 5.5
   <noreply@anthropic.com>` and PR bodies with the Claude Code line.
8. **Merge gates.** Wait for `lint`, `typecheck`, `build`, `test`, and
   `e2e-smoke` (about 4 minutes). Read every comment from the Codex review bot
   (`chatgpt-codex-connector`): fix legitimate ones, reply to the rest, then
   resolve each thread (GraphQL `resolveReviewThread`; pushing only marks them
   outdated). `claude-review` is not required; its failure (state UNSTABLE)
   does not block. Merge only when `gh pr view N --json mergeStateStatus`
   is `CLEAN` or `UNSTABLE`: `gh pr merge N --squash --delete-branch`.
   Never bypass protections.
9. **Deploy** (code PRs only; docs-only PRs skip this). See "Deploy".
10. **Record.** Append a line to "Log" and update "Current state". Go to 1.

### Deploy

1. If the PR adds a migration or runs a data script, take a backup first:
   `bash scripts/backup-garonhome.sh` and confirm it reports success.
2. Deploy: `bash scripts/deploy-garonhome.sh` (syncs `/opt/business/ai-fsm/repo`
   to `origin/main`, runs migrations, rebuilds, restarts). Run nothing else
   heavy while it builds.
3. Verify: `curl -sf https://app.mydovetails.com/api/health` returns
   `"status":"ok"`; `curl -sI https://app.mydovetails.com/login` returns 200
   (redirects must not point at `0.0.0.0:3000`); check the task's "post-deploy
   check" in the plan.
4. If verification fails: revert. Open a revert PR (`git revert` of the squash
   commit), let the gates pass, merge, deploy again, verify. Migrations are
   additive, so the old code runs on the new schema. Restoring the database
   from backup is owner gate G4. Record what happened in "Log" and stop.

### Stop conditions (ask the owner, then wait)

- An owner gate is next and not approved.
- The same gate or test fails three times after fixes.
- A step needs a decision the design, backlog task or plan does not make
  (do not invent product decisions; write the question in "Current state").
- A deploy fails verification and the revert also fails.
- The `CLAUDE_CODE_OAUTH_TOKEN` or any other credential needs the owner.

While blocked on one task, continue with any other eligible task that does
not depend on it. Stop entirely only when nothing is eligible.

### Handoff

Everything an agent knows must be in git: this file, the PR, and the backlog
task. A new agent starts at "How to start". If a branch exists with unpushed
or half-done work, the new agent reads the branch diff and the PR before
continuing; it never force-pushes over someone else's commits.

### Project rules that always apply

`CLAUDE.md` non-negotiables (quality gates, no secrets in code, additive and
reversible migrations, tests for business logic, production on garonhome via
`infra/compose.garonhome.yml`); `docs/working/execution-doctrine.md`; the UX
direction `docs/working/ux-implementation-direction.md` for any UI change;
migration numbers are the next free number at implementation time (the plans
name expected numbers only; `scripts/check-migration-prefixes.mjs` rejects
duplicates); new account tables need RLS so `scripts/check-rls-coverage.mjs`
passes; redirects use `appUrl()`; AI calls follow TASK-204's rules once it has
landed.

## Task list (tick as you go)

Order: Stage 0, then Track A, then Track B, then Track C; fill-in tasks run
whenever their dependencies are met and the current track is blocked.

### Stage 0: approvals and merges

- [x] **S0.1** Write this runbook (2026-10-26).
- [ ] **S0.2** OWNER GATE G1: owner approves `docs/working/hourly-baseline.md`.
  Record it in "Owner approvals". Until then, stop (nothing below is eligible).
- [ ] **S0.3** Merge PR #720 (docs only, no deploy) through the merge gates.
- [ ] **S0.4** Retarget PR #721 to `main` if GitHub did not (`gh pr edit 721
  --base main`), update it with `main`, merge it through the gates (no
  deploy). After this, this runbook is on `main`.

### Track A: high-severity fixes (plan: "Plan: Track A")

- [ ] **A1** TASK-197 AI line suggestions cannot set their own price.
- [ ] **A2** TASK-196 Convert copies only the right lines, and lines add up.

### Track B: hourly baseline (plan: "Plan: Track B")

- [ ] **B0** TASK-189 formula document: done when G1 is approved (move the task
  to Done in the S0.3 PR or the first Track B PR).
- [ ] **B1** TASK-190 Materials cost field and cost split.
- [ ] **B2** TASK-191 Person-hours on every estimate (needs B1).
- [ ] **B3** TASK-192 Equipment line type (needs B1).
- [ ] **B4** TASK-193 Production rates with calibration (needs B2).
- [ ] **B5** TASK-194 Baseline panel, send rules, freeze at send (needs B1–B3).
- [ ] **B6** TASK-195 Review rewrite (needs B5).

### Track C: estimating assistant (plan: `docs/superpowers/plans/2026-10-26-estimating-assistant-phase3.md`)

- [ ] **C1** TASK-210 Price observation ledger (plan Task 1; needs B1). After
  deploy, run the backfill script on production (backup first).
- [ ] **C2** TASK-211 Duplicate-safe purchase imports (plan Task 2; needs C1).
- [ ] **C3** TASK-212 Package sizes (plan Task 3; needs C1).
- [ ] **C4** TASK-213 Price confidence (plan Task 4; needs C1, B5).
- [ ] **C5** TASK-214 Paint pilot (plan Task 5; needs C3, C4).
- [ ] **C6** TASK-215 Estimated vs actual hours (plan Task 6; needs B2).
- [ ] **C7** Tell the owner the pilot is ready: import the 24-month Pro Xtra
  export in "Price history only" mode and use the pilot on at least 5 varied
  real jobs. Not blocking for other tasks.
- [ ] **C8** OWNER GATE G2, then TASK-216 (plan it from `pilot_actions` data
  first, as a new plan file, then build it).

### Fill-in tasks (plan: "Plan: fill-in tasks")

- [ ] **F1** TASK-204 Harden the estimating AI calls.
- [ ] **F2** TASK-203 Portal approval parity.
- [ ] **F3** TASK-198 Keep the deposit rule at create.
- [ ] **F4** TASK-202 Prepared quote edge cases.
- [ ] **F5** TASK-205 Materials generator timeout and hand-off (needs C1).
- [ ] **F6** TASK-206 Estimate API cleanup (code only; closing stale estimates is G3).
- [ ] **F7** TASK-207 Password change audit.
- [ ] **F8** TASK-199 Painting edit uses account rates (needs B4).
- [ ] **F9** TASK-200 Multi-option totals and line types.
- [ ] **F10** TASK-201 Room-by-room engine path atomic.
- [ ] **F11** TASK-208 Change-order baseline (needs B5).

Not in this runbook: TASK-183 (deferred until Good/Better/Best is used) and
the Phase 4 items in `docs/canonical/ROADMAP.md`.

---

## Plan: Track A

### A1 · TASK-197 · AI suggestion price cap

- Files: `apps/web/lib/estimates/item-suggester.ts` (the mapping that sets
  `unit_price_cents`); test `apps/web/lib/estimates/__tests__/item-suggester.unit.test.ts`.
- Produce `clampSuggestedPrice(pb: { default_price_cents: number | null; price_min_cents: number; price_max_cents: number | null }, aiCents: number): { cents: number; usedAi: boolean }`.
- Tests: model 999900 on an item 10000–30000 → 30000, `usedAi: true`; item
  with default 25000 → 25000, `usedAi: false`; no max → `max(min, ai)`.
- UI shows "AI price, check" when `usedAi`.
- Post-deploy check: none beyond health.

### A2 · TASK-196 · Convert integrity

- Files: `apps/web/app/api/v1/estimates/[id]/convert/route.ts` (line query and
  copy); create `apps/web/lib/estimates/approved-lines.ts`; tests
  `apps/web/lib/estimates/__tests__/approved-lines.unit.test.ts` and an
  integration test for convert.
- Produce `approvedLines(lines: Line[], selectedOptionId: string | null): Line[]`
  (lines with no option plus the selected option's lines) and
  `invoiceLinesFor(estimate, lines): InvoiceLineDraft[]` that folds hidden
  lines into one visible "Included work" line, adds a "Risk adjustment" line
  for `risk_adjustment_cents > 0` and a travel line for a
  `travel_surcharge_cents` with no `travel_snapshot_id`.
- Convert refuses a multi-option estimate with no `selected_option_id` (422,
  "Choose the customer's option first").
- Tests: invoice line sum equals invoice subtotal for: hidden lines, risk
  adjustment, manual travel, multi-option with Better chosen.
- Post-deploy check: convert one approved test estimate on production only if
  the owner has a test client; otherwise health only.

---

## Plan: Track B

Spec for every Track B task: `docs/backlog/TASK-188-hourly-baseline-every-estimate.md`
and `docs/working/hourly-baseline.md` (formula, examples A–G). Pure baseline
logic lives in `packages/domain/src/hourly-baseline.ts`.

### B1 · TASK-190 · Materials cost field and cost split

- Migration: `estimate_line_items.unit_cost_cents integer CHECK (unit_cost_cents >= 0)`
  (null = cost not entered).
- Create `apps/web/lib/estimates/cost-split.ts`:
  `splitInternalCosts(lines: { line_item_type: string; quantity: number; unit_price_cents: number; unit_cost_cents: number | null; hours_high?: number | null }[], rates: { billingCents: number; costCents: number }): { laborCostCents: number; materialCostCents: number; marginPct: number }`;
  `materialMarkupPct(line): number | null` (null when price equals cost or cost missing).
- Modify `apps/web/lib/estimates/create-estimate.ts` (itemized branch) to use
  `splitInternalCosts`; no handling added to margin; handling-fee, adjustment
  and travel lines count as neither labor nor material cost.
- Price defaults to cost on new materials/equipment lines; marked-up lines
  show "marked up N%" and are excluded from automatic handling.
- Tests: Fixture A lines → `materialCostCents` 145000, `laborCostCents` 551250;
  cost 20000 / price 24000 → `materialMarkupPct` 20; handling line changes
  neither cost.
- Post-deploy check: create a draft estimate with one labor and one materials
  line; internal costs shown split.

### B2 · TASK-191 · Person-hours on every estimate

- Migration: the TASK-188 data model columns (line `hours_low`, `hours_high`,
  `hours_source` incl. `travel_calc`, `production_rate_snapshot`; estimate
  `labor_hours_low/high/source`, `handling_in_baseline`, `other_direct_cost_cents`,
  `direct_costs_confirmed_at`, `cost_floor_ack_at/by`, `baseline_snapshot`,
  `review_result`, `review_for_updated_at`; `business_pricing_settings.baseline_warning_pct`;
  calibration columns on `production_rates` and `production_rate_modifiers`).
- Carry hours through create, PATCH (`apps/web/app/api/v1/estimates/[id]/route.ts`),
  `apps/web/lib/estimates/repository.ts`, Apply to quote
  (`apps/web/app/api/v1/estimates/[id]/prepared-scope/route.ts`), Prepare Quote,
  the edit form, quick wizard (`apps/web/app/app/estimates/quick/QuickEstimateWizard.tsx`),
  Fix now (`apps/web/app/app/visits/[id]/FixNowEstimateButton.tsx`), T&M
  briefing (`labor_hours_min/max`, source `ai_allowance`), AI draft
  (price-book hours, source `price_book`), and the travel-time line (snapshot
  minutes / 60, source `travel_calc`).
- Tests: the 11 creation-path coverage tests listed in TASK-188 "Creation
  paths and coverage" (`apps/web/lib/estimates/__tests__/creation-paths.integration.test.ts`);
  blank hours persist as null; flat quote saves 20–30 h; Fixture A Apply
  stores 87.75–132.25 h; T&M 6–8 h → source `ai_allowance`, edited → `owner`.
- Post-deploy check: open an existing draft; hours show "missing", nothing
  else changes.

### B3 · TASK-192 · Equipment line type

- Migration: line type CHECK on `estimate_line_items` and `invoice_line_items`
  gains `equipment`; reversal converts equipment rows to `materials` first.
- Update line editors, convert (keeps the type), handling (excludes equipment).
- Tests: $120 equipment line leaves handling unchanged; convert yields an
  equipment invoice line; migration applies and reverses on a copy.

### B4 · TASK-193 · Production rates with calibration

- Settings page (owner/admin) to edit `production_rates` and
  `production_rate_modifiers` with `calibrated` and `calibrated_at`.
- `productionRateHours(quantity: number, rate: { base_rate: number; rate_unit: string; calibrated: boolean }, modifiers: { modifier_pct: number; calibrated: boolean }[]): { hours: number; calibrated: boolean }`
  in `packages/domain/src/production-rates.ts` (per-day units use an 8-hour day).
- Square-foot calculator saves rate id, value, unit, modifiers and calibration
  on the line; uncalibrated → AI hours stay the default, labeled "AI estimate";
  exception: rate 5012 walls keeps driving wall hours, labeled "production rate
  (uncalibrated)".
- Tests: tech gets 403; uncalibrated → AI default; calibrated rate and
  modifiers → source `production_rate`; editing a rate leaves saved lines
  unchanged.

### B5 · TASK-194 · Baseline panel, send rules, freeze

- `computeHourlyBaseline(input: BaselineInput): BaselineResult` in
  `packages/domain/src/hourly-baseline.ts`, exactly the formula in
  `docs/working/hourly-baseline.md`:
  - `BaselineInput = { lines: { type: "labor" | "materials" | "equipment" | "handling_fee" | "adjustment"; isTravelTime: boolean; hoursLow: number | null; hoursHigh: number | null; costCents: number | null; priceCents: number }[]; estimateHours: { low: number; high: number } | null; travelSurchargeCents: number; sellRateCents: number; costFloorCents: number; handlingPct: number; handlingOn: boolean; otherDirectCents: number | null; otherDirectConfirmed: boolean; quotedCents: number; warningPct: number }`
  - `BaselineResult = { complete: boolean; missing: { kind: "hours" | "cost" | "other_direct"; lineIndex?: number }[]; hours: { low: number; mid: number; high: number } | null; baseline: { low: number; mid: number; high: number } | null; gapCents: number | null; gapPct: number | null; effectiveRateCents: number | null; warning: "none" | "below" | "strong"; belowCostFloor: boolean | null }`
- Tests: examples A–G from the formula document, to the cent (A: 890875 /
  1080000 / 1269125, gap +2125, +0.20%, effective 7086; B: −19625, −1.78%;
  C: −42500, −17.53%, 5533; D: −72500, −29.90%, 4533; E: incomplete, no
  totals; F: 74500 / 83000 / 91500, effective 7600; G: 116500 / 133500 /
  150500, +4000, +3.00%, 7679).
- Send route `apps/web/app/api/v1/estimates/[id]/send/route.ts`: 422 with the
  missing list while incomplete; acknowledgment required when
  `belowCostFloor` and complete (stores `cost_floor_ack_at/by`); writes
  `baseline_snapshot` in the draft-to-sent transaction; option quotes skip
  the new rules and show "Baseline not available for option quotes yet".
- Panel (owner/admin), "Before you can send" checklist, other direct costs
  with "confirmed (including $0)", handling switch, Settings warning %.
  Any edit clears confirmation and acknowledgment.
- Tests: TASK-188 acceptance criteria (send 422s, warning levels, threshold
  15% moves the strong warning, acknowledgment, freeze after a rate change,
  existing drafts get the checklist, option quotes unsupported, tech cannot
  see the panel).
- Post-deploy check: an existing sent estimate shows "Hours not recorded" and
  the same totals.

### B6 · TASK-195 · Review rewrite

- `apps/web/app/api/v1/estimates/[id]/review/route.ts` and
  `apps/web/lib/estimates/review.ts`: input = `BaselineResult`, all lines
  (type, hours, source), billing method, prepared-scope gaps, settings rates;
  remove the $/sq ft rules and the hard-coded $85; validate output with Zod;
  treat `max_tokens` as an error; store `review_result` with
  `review_for_updated_at`.
- `apps/web/app/app/estimates/[id]/EstimateReviewPanel.tsx`: `autoLoad`
  default false; shows the stored result while it is current.
- Tests: opening an estimate makes no AI call (mock asserts zero calls);
  stored result reused; Fixture A input names Pantry, Kitchen, Hall, Foyer as
  missing materials (with a mocked model response, assert the prompt carries
  those gaps).

---

## Plan: fill-in tasks

Each follows its backlog task's scope and acceptance criteria; the notes below
fix the decisions the task leaves open.

- **F1 TASK-204:** one shared helper `apps/web/lib/ai/claude-call.ts`
  (`callTool<T>(opts: { model: string; system; tools; toolName: string; schema: ZodType<T>; maxTokens: number; userContent }): Promise<T>` with timeout 120000 ms, `maxRetries: 1`, Zod validation, `max_tokens` → error, usage logged via `logger.info("ai.usage", { feature, model, input, output, cacheRead, ms })`). Move the nine call sites onto it one by one. Owner/admin on ai-draft, ai-scope, ai-materials, ai-tm-briefing, review. Key guard on the interview. Keep each feature's existing model ID (model upgrades are out of scope).
- **F2 TASK-203:** portal approve/decline call the same helper as the email path for audit log, workflow event, attention event and booking-request advance; non-`sent` estimate → 409 with current status; repeated approve on approved → 200, no side effects.
- **F3 TASK-198:** store the owner's deposit rule as entered; `deposit_cents` recalculated on every change from the rule.
- **F4 TASK-202:** fixed price with no eligible groups → one "Work as described" labor line; T&M profit-card sell price = sum of quote lines.
- **F5 TASK-205:** stream the materials generator response (server-sent events through the existing route; the client reads the stream), keep the request alive under 100 s per chunk; assessment hand-off lines carry `line_item_type: "materials"` and cost.
- **F6 TASK-206:** travel route 409 for non-draft; PATCH keeps the stored tax rate when none is sent; produce the list of stale sent estimates in the PR body for the owner (G3); close none.
- **F7 TASK-207:** audit row on password change with actor and target, no secrets.
- **F8 TASK-199:** server builds painting lines from account rules; typed materials/handling lines.
- **F9 TASK-200:** create and edit store the highest option total with matching subtotal including travel and risk; option lines keep type, visibility and price-book id.
- **F10 TASK-201:** `computeAndPersist` runs on the create transaction's client; failure fails the create; total includes travel and risk; tax recomputed; pricing review re-run.
- **F11 TASK-208:** reuse `computeHourlyBaseline` for change orders; add line type and hours to change-order lines; same send rules; plan this task's file list from the change-order code when B5 is done.

## Log

Append one line per finished step: date, step, PR, deploy result.

- 2026-10-26 · S0.1 · runbook written on branch `spec/estimating-assistant-phase3` (PR #721) · no deploy
