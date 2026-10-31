# Build runbook: hourly baseline, estimate fixes and estimating assistant

The execution checklist for the work decided on 2026-10-26. An AI agent
follows it without being told the next step, records progress in it, and hands
over through it. It does not grant any authority by itself: authority comes
only from the "Owner approvals" table.

## How to start (prompt for any AI)

> Read `docs/working/build-runbook.md` (on `main`; if it is not on `main` yet,
> read it from branch `spec/estimating-assistant-phase3`). Check "Owner
> approvals" to see what you are allowed to do. Follow "Operating rules"
> exactly. Resume from "Current state". Work until you reach an owner gate,
> a stop condition or the end of the list, then stop and report.

## Current state

Updated by the agent at the end of every step (in the step's PR, or a
docs-only commit when there is no PR).

```
Last step           : D0 backlog for Track D (customer quote and letterhead),
                      2026-10-31. B3 (TASK-192) was the last runbook code step
                      verified (2026-10-27, squash 2842780e, #728).
In-flight PR        : #741 (D3+D5, branch task/225-228-addons-height,
                      migration 213).
Next step           : #741 through CI, merge, then deploy WITH a verified
                      backup first (migration 213). Owner allowed the agent
                      to run scripts/deploy-garonhome.sh (2026-10-31).
Blocked on          : nothing
Last known-good     : 0e1b9921 (deploy-good/0e1b9921); previous 8441846a
Notes               : Off-runbook work 2026-10-31 on prod data (Dowd
                      EST-2026-0026): switched to fixed $8,750 via the app's
                      Apply code; options a1 (son's room, $750) and a2 (foyer
                      stairwell, $1,050) added with the price in the label.
                      D1's follow-up moves those prices into price_cents.
                      Earlier notes: migration 210 applied 2026-10-27;
                      TASK-218/219 deployed 2026-10-28 (mig 211, 212).
```

## Owner approvals

Authority exists only when its row says **Active**. An approval counts when
the owner states it in a session (the agent records the exact words here with
the date) or posts it as a PR comment from the owner's GitHub account
(`byesaw13`). Session answers are not visible to later agents, so authority
over `main` and production also requires the PR comment named in the row.
Never infer an approval, and never treat a document an AI drafted, including
this one, as an approval.

| Gate | What | Status | Evidence |
| --- | --- | --- | --- |
| G0 | Agent may merge to `main` and deploy to production after every gate in this runbook passes | **Active** 2026-10-26 | Owner comment on PR #721 at 2026-10-26 21:29 UTC, from `byesaw13`: `I approve autonomous merge and deploy as described in docs/working/build-runbook.md`. Session history: owner selected **"Merge and deploy"**, then "i approve all 3". |
| G0b | Estimating assistant design, roadmap change, provisional pilot criteria (PR #721) | Approved 2026-10-26 | Owner in session: "I approve the Phase 3 estimating-assistant design and proposed roadmap changes in PR #721, including the provisional pilot criteria." |
| G1 | Hourly baseline formula document `docs/working/hourly-baseline.md` (PR #720) | Approved 2026-10-26 | Owner in session: "i approve all 3", answering a list whose first item was "Approve the formula document in #720 (G1)". |
| G5 | Emergency recovery procedure in this runbook | Approved 2026-10-26 | Owner in session: "i approve all 3", answering a list whose third item was approving the emergency recovery procedure (G5). |
| G2 | Paint pilot passed its success criteria (before TASK-216) | Pending (after the pilot) | |
| G3 | Closing each stale "sent" estimate (TASK-206) | Per estimate, non-blocking | |
| G4 | Any database restore or data repair on production | Ask every time | |
| G6 | TASK-225 table-freeze exception (one nullable column for chosen add-ons) | Approved 2026-10-31 | Owner in session: "approve both, use craftsman factors, start TASK-227", answering (1) TASK-225's one new column and (2) TASK-228's factors. |
| G7 | TASK-228 height factors: Craftsman ×1.23 (9–13 ft), ×1.46 (13–17 ft), ×1.69 (17–19 ft), ×1.92 (19–21 ft) | Approved 2026-10-31 | Same session answer as G6. |

**Without G0 active** the agent works in "PRs only" mode: it builds, tests and
opens PRs, gets them ready to merge, then stops and asks the owner to merge.
It never merges or deploys.

## Decisions register

Approved product decisions (do not change them):

| Decision | Source |
| --- | --- |
| Hourly baseline is a reference; it never changes the owner's price | TASK-188, owner 2026-10-26 |
| Cost floor uses high-end person-hours; selling warnings use the midpoint; warning threshold 10%, editable | TASK-188 |
| Send requires complete hours and confirmed direct costs; "incomplete" is a draft state | TASK-188 |
| Travel time billed at the labor rate counts as hours, once | `docs/working/hourly-baseline.md` |
| Materials and equipment have cost separate from price; markup visible; no automatic handling on marked-up lines | `docs/working/hourly-baseline.md` |
| Massachusetts adjustment documented only, not changed | `docs/working/hourly-baseline.md` |
| Estimating assistant design (D1 to D11, E1 to E10, correction passes) | `docs/working/estimating-assistant-phase3.md`, G0b |
| AI line suggestions never set a price: price book default, else price book minimum, else no price and "Price needed" | Owner in session 2026-10-26 (TASK-197) |
| Per-day production rates convert to hours with an hours-per-day setting, default 8, editable in Settings and shown next to each conversion | Owner in session 2026-10-26 (TASK-193) |

Engineering proposals (the implementing agent may refine these; it states the
final choice and why in the PR; anything that changes what the owner sees or
pays becomes a product decision and needs the owner):

- AI call timeout 120 s with one retry (TASK-204).
- Streaming the materials generator response to fit the 100 s tunnel limit
  (TASK-205); a polled background job is an acceptable alternative.
- Advisory lock per variant for cache recomputation (TASK-210).
- File and function names and signatures in the plans.

## Status of each task

A task moves through four states, each recorded with a date and evidence:

- **Implemented:** PR open, CI (including integration tests) green on it.
- **Merged:** squash-merged to `main`.
- **Deployed:** on production (code PRs only; docs-only PRs show `n/a`).
- **Verified:** its post-deploy check passed on production.

The backlog task moves to `Done` only at **Verified** (docs-only tasks: at
Merged). Never record a state before it happens: a PR does not mark its own
task merged or deployed. The agent updates this table in the next PR or a
docs-only commit after the event. Planned tests are not passing tests.

| Step | Task | Implemented | Merged | Deployed | Verified |
| --- | --- | --- | --- | --- | --- |
| S0.1 | Runbook | 2026-10-26 (PR #721) | | n/a | n/a |
| S0.3 | Merge #720 | n/a | 2026-10-26 (owner, ddd2a31b) | 2026-10-26 | 2026-10-26 (health ok, /login 200) |
| S0.4 | Merge #721 | n/a | 2026-10-26 (owner, c0544597) | n/a | n/a |
| A1 | TASK-197 | 2026-10-26 (CI 40406723540, #722) | 2026-10-26 (#722, 1a8cc54c) | 2026-10-26 (~22:05 UTC) | 2026-10-26 (health ok, /login 200, 22:06 UTC) |
| A2 | TASK-196 | 2026-10-26 (CI 40413156570, 40413164445, #723) | 2026-10-26 (#723, e7b27ef9) | 2026-10-26 (~22:51 UTC) | 2026-10-26 (health ok, /login 200, 22:51 UTC) |
| B0 | TASK-189 | doc in #720 | 2026-10-26 (#720) | n/a | n/a |
| B1 | TASK-190 | 2026-10-26 (CI 40419939119, 40419947446, #724) | 2026-10-26 (#724, f4837336) | 2026-10-27 (~00:02 UTC) | 2026-10-27 (draft split, 00:04 UTC) |
| B2 | TASK-191 | 2026-10-27 (CI 40429996387, 40430001995, #726) | 2026-10-27 (#726, 20c7d5f8) | 2026-10-27 (~01:28 UTC) | 2026-10-27 (draft hours null, totals unchanged, 01:28 UTC) |
| B3 | TASK-192 | 2026-10-27 (CI 40437008165, 40437011775, #728) | 2026-10-27 (#728, 2842780e) | 2026-10-27 (~02:32 UTC) | 2026-10-27 (equipment cost apart, 02:33 UTC) |
| B4 | TASK-193 | | | | |
| B5 | TASK-194 | | | | |
| B6 | TASK-195 | | | | |
| C1 | TASK-210 | | | | |
| C2 | TASK-211 | | | | |
| C3 | TASK-212 | | | | |
| C4 | TASK-213 | | | | |
| C5 | TASK-214 | | | | |
| C6 | TASK-215 | | | | |
| C8 | TASK-216 | | | | |
| F1 | TASK-204 | | | | |
| F2 | TASK-203 | | | | |
| F3 | TASK-198 | | | | |
| F4 | TASK-202 | | | | |
| F5 | TASK-205 | | | | |
| F6 | TASK-206 | | | | |
| F7 | TASK-207 | | | | |
| F8 | TASK-199 | | | | |
| F9 | TASK-200 | | | | |
| F10 | TASK-201 | | | | |
| F11 | TASK-208 | | | | |
| D0 | Backlog TASK-224..228 | 2026-10-31 (#740, CI green) | 2026-10-31 (#740, 0e1b9921) | n/a | n/a |
| D1 | TASK-224 | 2026-10-31 (#740, CI green) | 2026-10-31 (#740, 0e1b9921) | 2026-10-31 (~16:05 UTC) | 2026-10-31 (health ok, /login 200, Dowd portal) |
| D2 | TASK-226 | 2026-10-31 (#740, CI green) | 2026-10-31 (#740, 0e1b9921) | 2026-10-31 (~16:05 UTC) | 2026-10-31 (health ok, /login 200, Dowd portal) |
| D3 | TASK-225 | | | | |
| D4 | TASK-227 | 2026-10-31 (#740, CI green) | 2026-10-31 (#740, 0e1b9921) | 2026-10-31 (~16:05 UTC) | 2026-10-31 (health ok, /login 200, Dowd portal) |
| D5 | TASK-228 | | | | |

## Operating rules

### Before touching anything (every session)

1. **Do not disturb other work.** Run `git status` in the main checkout and
   `git worktree list`. If the main checkout has uncommitted changes or is on
   another branch, leave it alone: it may belong to the owner or another
   agent.
2. **Work in an isolated worktree:** `git worktree add ../worktrees/task-NNN
   -b task/NNN-short-name origin/main` (or the existing task branch). Never
   switch branches in a checkout you did not create.
3. **Check for another active agent:** an open PR for the same task, a branch
   pushed in the last hour, or a recent "Current state" update by another
   agent. If one is active, pick a different eligible task or stop.
4. **Processes:** only stop processes you started. Before any check, look for
   a local dev server (`ps -u nick -o pid,user,lstart,cmd | grep "next dev"`).
   If one is running and you did not start it, do not stop it: wait, or skip
   heavy checks and rely on CI. Never use `pkill -f` (it can match the
   root-owned production `next-server`). Check `free -m` before running tests.

### One task, one loop

For each eligible task in list order (a task whose dependencies are not
**Verified** is skipped; take the next eligible one):

1. **Already started?** Check this file, `gh pr list --state all --search
   "TASK-NNN"`, and `git log --oneline origin/main | grep TASK-NNN`. If a PR
   or branch exists, continue it in a worktree; never start over or
   force-push over it.
2. **Read** the backlog task in `docs/backlog/`, its plan section, the design
   it cites, and the code it changes. If the plan and the code disagree,
   follow the design, note the difference in the PR, and stop if a product
   decision is needed.
3. **Test first:** write the failing tests from the plan, see them fail,
   implement, see them pass.
4. **Local checks (memory-safe):** `pnpm lint`, `pnpm typecheck`,
   `pnpm test:unit`. Run `pnpm test:integration` locally only if a test
   database is available. Do **not** run `pnpm build` or `pnpm gate` locally
   (earlyoom kills it on garonhome and has dropped production before); CI runs
   the build. State in the PR exactly which checks ran locally.
5. **Required database tests:** every task with a migration, a data script,
   or code that writes estimates, prices, imports or expenses must have
   integration tests (`*.integration.test.ts`) that run in CI's `test` job
   against Postgres. The task cannot merge unless that job ran them and they
   passed; a skipped or missing integration test is a failure, not a pass.
6. **Database change checklist** (in the PR body, for every migration or
   data script):
   - Compatibility: the previous `main` application code works against the
     migrated schema. Prove it: run the previous release's integration tests
     against the new schema in CI or a scratch database, or show the change
     is additive only (new nullable columns or tables, no renames, drops,
     type changes or new NOT NULL without default), and list any query the
     old code runs that the change affects.
   - Reversal: the exact reversal SQL, tested on a scratch copy.
   - Data scripts (backfills, imports): a dry run first that prints what it
     would change; every row it writes is tagged with a run id; the PR
     includes the exact SQL that removes that run's rows. An application
     revert does not undo data, so this cleanup is part of the rollback.
7. **Docs in the same PR:** set the backlog task to `In progress`; update
   "Current state"; record **Implemented** only once CI is green. Delete code
   the task replaces (knip). UI changes follow
   `docs/working/ux-implementation-direction.md`; if a job step's behavior
   changes, update its bubble text in `apps/web/app/app/map/map-data.ts`.
8. **PR:** title `<summary> (TASK-NNN)`; body: changes, tests (with CI
   results, not plans), local checks, database checklist, rollback. Attribution
   reflects who actually did the work: an agent uses its own attribution
   convention (a Claude agent uses the lines its environment provides); never
   add attribution for a contributor who did not take part.
9. **Get ready to merge:** wait for `lint`, `typecheck`, `build`, `test`
   (unit and integration) and `e2e-smoke`. Read every comment from the Codex
   review bot (`chatgpt-codex-connector`); fix legitimate ones, reply to the
   rest, then resolve each thread (GraphQL `resolveReviewThread`). Ready means
   `gh pr view N --json mergeStateStatus` is `CLEAN` or `UNSTABLE`
   (`claude-review` is not required).
10. **Merge:** only with G0 Active: `gh pr merge N --squash --delete-branch`.
    Without G0: stop and ask the owner to merge.
11. **Deploy and verify:** only with G0 Active, for code PRs (see "Deploy").
12. **Record** the new states in "Status of each task" and a line in "Log"
    (next PR or docs-only commit). Remove the worktree when the task is
    Verified. Next task.

### Deploy (requires G0 Active)

1. Record the currently deployed commit as last known-good:
   `git -C /opt/business/ai-fsm/repo rev-parse HEAD`, and push it as branch
   `deploy-good/<sha>` if it is not already on origin.
2. If the change has a migration or data script: run
   `bash scripts/backup-garonhome.sh`, then verify the dump it reports
   (`ai_fsm_<timestamp>.dump` under `/opt/business/ai-fsm/backups`) is non-empty
   and readable: `pg_restore --list <file> | head` succeeds. No verified
   backup, no deploy.
3. Deploy: `bash scripts/deploy-garonhome.sh`. Run nothing heavy meanwhile.
4. Verify: `curl -sf https://app.mydovetails.com/api/health` returns
   `"status":"ok"`; `curl -sI https://app.mydovetails.com/login` returns 200
   and no redirect to `0.0.0.0:3000`; the task's post-deploy check passes.
5. Data scripts run only after step 4 passes, dry run first, then for real,
   then their own check.
6. If verification fails: follow "Emergency recovery".

### Emergency recovery (requires G5 Approved; until then: stop and report)

When production fails verification after a deploy this runbook performed:

1. Redeploy the last known-good commit with the existing script option:
   `DEPLOY_BRANCH=deploy-good/<sha> bash scripts/deploy-garonhome.sh`, then
   repeat the verification. This does not go through CI, which is why it is
   limited to a commit that was already verified on production.
2. If a migration ran: the previous code must work on the new schema (the PR's
   compatibility check). If it does not, stop: reversing a migration or
   restoring a backup is owner gate G4.
3. If a data script ran: do not run its cleanup SQL during the incident
   without the owner (G4).
4. Report immediately: what failed, what was redeployed, current health, and
   the open questions, in "Current state" and as a comment on the task's PR.
   Then open a normal revert PR for `main` through the usual gates, so `main`
   matches production again.
5. Escalate and stop if the redeploy also fails verification.

The agent never improvises other recovery steps during an outage.

### Stop conditions

Stop, write the question in "Current state" and report when:

- the next step is an owner gate that is not approved;
- the same gate or test fails three times after fixes;
- a step needs a product decision the decisions register, design, backlog
  task or plan does not make;
- production verification fails (after emergency recovery, if G5 allows it);
- a credential is needed (for example the `CLAUDE_CODE_OAUTH_TOKEN`).

While one task is blocked, continue with other eligible tasks that do not
depend on it. Stop entirely only when nothing is eligible.

### Project rules that always apply

`CLAUDE.md` non-negotiables; `docs/working/execution-doctrine.md`; migration
numbers are the next free number at implementation time (the plans name
expected numbers only; `scripts/check-migration-prefixes.mjs` rejects
duplicates); new account tables need RLS so `scripts/check-rls-coverage.mjs`
passes; redirects use `appUrl()`; AI calls follow TASK-204's rules once it has
landed.

## Task order

Stage 0, then Track A, then Track B, then Track C; fill-in tasks run whenever
their dependencies are Verified and the current track is blocked.

### Stage 0: approvals and merges

- **S0.1** Runbook written (done; revised after review).
- **S0.2** Owner gates: G1 (formula document) is required for anything below.
  G0 and G5 decide whether the agent merges and deploys or only opens PRs.
- **S0.3** Merge PR #720 (docs only, no deploy). Requires G1, and G0 or the
  owner merging.
- **S0.4** Retarget PR #721 to `main` if GitHub did not (`gh pr edit 721
  --base main`), update it with `main`, merge it (no deploy).

### Track A: high-severity fixes (plan: "Plan: Track A")

- **A1** TASK-197 AI line suggestions never set their own price.
- **A2** TASK-196 Convert copies only the right lines, and lines add up.

### Track B: hourly baseline (plan: "Plan: Track B")

- **B0** TASK-189 formula document: Merged with S0.3 once G1 is approved.
- **B1** TASK-190 Materials cost field and cost split.
- **B2** TASK-191 Person-hours on every estimate (needs B1).
- **B3** TASK-192 Equipment line type (needs B1).
- **B4** TASK-193 Production rates with calibration (needs B2).
- **B5** TASK-194 Baseline panel, send rules, freeze at send (needs B1 to B3).
- **B6** TASK-195 Review rewrite (needs B5).

### Track C: estimating assistant (plan: `docs/superpowers/plans/2026-10-26-estimating-assistant-phase3.md`)

- **C1** TASK-210 Price observation ledger (plan Task 1; needs B1). Backfill
  runs on production only after the deploy is Verified (dry run first, tagged
  run id).
- **C2** TASK-211 Duplicate-safe purchase imports (plan Task 2; needs C1).
- **C3** TASK-212 Package sizes (plan Task 3; needs C1).
- **C4** TASK-213 Price confidence (plan Task 4; needs C1, B5).
- **C5** TASK-214 Paint pilot (plan Task 5; needs C3, C4).
- **C6** TASK-215 Estimated vs actual hours (plan Task 6; needs B2).
- **C7** Tell the owner the pilot is ready: import the 24-month Pro Xtra
  export in "Price history only" mode and use the pilot on at least 5 varied
  real jobs. Not blocking.
- **C8** Owner gate G2, then TASK-216 (plan it first from `pilot_actions`
  data, as a new plan file).

### Fill-in tasks (plan: "Plan: fill-in tasks")

F1 TASK-204, F2 TASK-203, F3 TASK-198, F4 TASK-202, F5 TASK-205 (needs C1),
F6 TASK-206, F7 TASK-207, F8 TASK-199 (needs B4), F9 TASK-200, F10 TASK-201,
F11 TASK-208 (needs B5).

### Track D: customer quote and letterhead (owner 2026-10-31; plan: "Plan: Track D")

Requested by the owner in session 2026-10-31 while finishing the Angela
Dowd quote (EST-2026-0026): "fix the backlogs and then build it correctly
leaving breadcrumbs along the way ... so that I can have another ai finish
it if needed." Track D runs ahead of the remaining B, C and F steps.

- **D0** Backlog and roadmap entries for TASK-224 to TASK-228 (docs only).
- **D1** TASK-224 Customer quote: labor as an amount, priced options block,
  owner edits options.
- **D2** TASK-226 New letterhead (code), then the settings change (logo
  upload, clear the address) after Verified.
- **D3** TASK-225 Customer ticks add-ons when approving (needs D1; column
  approved, G6).
- **D4** TASK-227 Pool paint across rooms that share a color.
- **D5** TASK-228 Tall-wall height factors (factors approved, G7).

Not in this runbook: TASK-183 (deferred until Good/Better/Best is used) and
the Phase 4 items in `docs/canonical/ROADMAP.md`.

---

## Plan: Track A

### A1 · TASK-197 · AI suggestions never set a price

Product decision (owner, 2026-10-26): the AI never sets a price.

- Files: `apps/web/lib/estimates/item-suggester.ts` (the mapping that sets
  `unit_price_cents`); test `apps/web/lib/estimates/__tests__/item-suggester.unit.test.ts`.
- Produce `priceForSuggestion(pb: { default_price_cents: number | null; price_min_cents: number | null }): { cents: number | null; source: "default" | "minimum" | "none" }`.
  The model's price is not read. Remove `unit_price_cents` from the
  suggestion tool schema so the model is not asked for one.
- A suggestion with `source: "none"` is added with no price and shows "Price
  needed"; it counts as a missing cost in the send checklist once TASK-194
  exists.
- Tests: default 25000 → 25000 `default`; no default, min 10000 → 10000
  `minimum`; neither → null `none`; a model response containing a price is
  ignored.
- Post-deploy check: health only.

### A2 · TASK-196 · Convert integrity

- Files: `apps/web/app/api/v1/estimates/[id]/convert/route.ts`; create
  `apps/web/lib/estimates/approved-lines.ts`; tests
  `apps/web/lib/estimates/__tests__/approved-lines.unit.test.ts` and
  `apps/web/app/api/v1/estimates/[id]/convert/__tests__/convert.integration.test.ts`.
- Produce `approvedLines(lines, selectedOptionId: string | null)` (lines with
  no option plus the selected option's lines) and `invoiceLinesFor(estimate,
  lines)` that folds hidden lines into one visible "Included work" line, adds
  a "Risk adjustment" line for `risk_adjustment_cents > 0` and a travel line
  for a `travel_surcharge_cents` with no `travel_snapshot_id`.
- Convert refuses a multi-option estimate with no `selected_option_id` (422,
  "Choose the customer's option first").
- Tests (integration): invoice line sum equals invoice subtotal for hidden
  lines, risk adjustment, manual travel, and multi-option with Better chosen.
- Post-deploy check: health only (no production test conversions).

---

## Plan: Track B

Spec: `docs/backlog/TASK-188-hourly-baseline-every-estimate.md` and
`docs/working/hourly-baseline.md` (formula, examples A to G). Pure baseline
logic in `packages/domain/src/hourly-baseline.ts`.

### B1 · TASK-190 · Materials cost field and cost split

- Migration: `estimate_line_items.unit_cost_cents integer CHECK (unit_cost_cents >= 0)`
  (null = not entered). Additive.
- Create `apps/web/lib/estimates/cost-split.ts`:
  `splitInternalCosts(lines: { line_item_type: string; quantity: number; unit_price_cents: number; unit_cost_cents: number | null; hours_high?: number | null }[], rates: { billingCents: number; costCents: number }): { laborCostCents: number; materialCostCents: number; marginPct: number }`;
  `materialMarkupPct(line): number | null`.
- `apps/web/lib/estimates/create-estimate.ts` (itemized branch) uses it; no
  handling in margin; handling-fee, adjustment and travel lines are neither
  labor nor material cost. Price defaults to cost on new materials/equipment
  lines; marked-up lines show "marked up N%" and get no automatic handling.
- Tests: Fixture A lines → `materialCostCents` 145000, `laborCostCents`
  551250 (integration through create); cost 20000 / price 24000 → 20.
- Post-deploy check: create a draft with one labor and one materials line;
  internal costs shown split; delete the draft.

### B2 · TASK-191 · Person-hours on every estimate

- Migration: the TASK-188 data model columns (line `hours_low`, `hours_high`,
  `hours_source` incl. `travel_calc`, `production_rate_snapshot`; estimate
  `labor_hours_low/high/source`, `handling_in_baseline`,
  `other_direct_cost_cents`, `direct_costs_confirmed_at`, `cost_floor_ack_at/by`,
  `baseline_snapshot`, `review_result`, `review_for_updated_at`;
  `business_pricing_settings.baseline_warning_pct` and `hours_per_day`
  (default 8); calibration columns on `production_rates` and
  `production_rate_modifiers`). Additive.
- Carry hours through create, PATCH, `repository.ts`, Apply to quote, Prepare
  Quote, the edit form, the quick wizard, Fix now, the T&M briefing
  (`labor_hours_min/max`, source `ai_allowance`), the AI draft (price-book
  hours, source `price_book`) and the travel-time line (snapshot minutes / 60,
  source `travel_calc`).
- Tests: the 11 creation-path coverage tests from TASK-188
  (`apps/web/lib/estimates/__tests__/creation-paths.integration.test.ts`);
  blank hours persist as null; flat quote saves 20 to 30 h; Fixture A Apply
  stores 87.75 to 132.25 h; T&M 6 to 8 h → `ai_allowance`, edited → `owner`.
- Post-deploy check: an existing draft shows hours "missing" and the same
  totals.

### B3 · TASK-192 · Equipment line type

- Migration: line type CHECK on `estimate_line_items` and `invoice_line_items`
  gains `equipment`. Compatibility: the old code never writes `equipment`;
  list every reader of `line_item_type` and show none breaks on an unknown
  value, or ship the readers first. Reversal converts equipment rows to
  `materials`, then restores the CHECK (data change: tagged and listed).
- Tests: $120 equipment line leaves handling unchanged; convert yields an
  equipment invoice line; migration applies and reverses on a copy.

### B4 · TASK-193 · Production rates with calibration

- Settings page (owner/admin) for `production_rates` and
  `production_rate_modifiers` with `calibrated` and `calibrated_at`, and the
  hours-per-day setting (default 8, shown next to every per-day conversion).
- `productionRateHours(quantity: number, rate: { base_rate: number; rate_unit: string; calibrated: boolean }, modifiers: { modifier_pct: number; calibrated: boolean }[], hoursPerDay: number): { hours: number; calibrated: boolean }`
  in `packages/domain/src/production-rates.ts`.
- Square-foot calculator saves rate id, value, unit, hours-per-day,
  modifiers and calibration on the line; uncalibrated → AI hours stay the
  default, labeled "AI estimate"; exception: rate 5012 walls keeps driving
  wall hours, labeled "production rate (uncalibrated)".
- Tests: tech gets 403; uncalibrated → AI default; calibrated → source
  `production_rate`; 400 sq ft/day at 8 h = 50 sq ft/h; changing hours-per-day
  changes new conversions only.

### B5 · TASK-194 · Baseline panel, send rules, freeze

- `computeHourlyBaseline(input: BaselineInput): BaselineResult` in
  `packages/domain/src/hourly-baseline.ts`, exactly the formula document:
  - `BaselineInput = { lines: { type: "labor" | "materials" | "equipment" | "handling_fee" | "adjustment"; isTravelTime: boolean; hoursLow: number | null; hoursHigh: number | null; costCents: number | null; priceCents: number }[]; estimateHours: { low: number; high: number } | null; travelSurchargeCents: number; sellRateCents: number; costFloorCents: number; handlingPct: number; handlingOn: boolean; otherDirectCents: number | null; otherDirectConfirmed: boolean; quotedCents: number; warningPct: number }`
  - `BaselineResult = { complete: boolean; missing: { kind: "hours" | "cost" | "other_direct"; lineIndex?: number }[]; hours: { low: number; mid: number; high: number } | null; baseline: { low: number; mid: number; high: number } | null; gapCents: number | null; gapPct: number | null; effectiveRateCents: number | null; warning: "none" | "below" | "strong"; belowCostFloor: boolean | null }`
- Unit tests: examples A to G to the cent (A: 890875 / 1080000 / 1269125, gap
  +2125, +0.20%, effective 7086; B: -19625, -1.78%; C: -42500, -17.53%, 5533;
  D: -72500, -29.90%, 4533; E: incomplete, no totals; F: 74500 / 83000 /
  91500, effective 7600; G: 116500 / 133500 / 150500, +4000, +3.00%, 7679).
- Send route: 422 with the missing list while incomplete; acknowledgment
  required when `belowCostFloor` and complete (stores `cost_floor_ack_at/by`);
  writes `baseline_snapshot` in the draft-to-sent transaction; option quotes
  skip the new rules and show "Baseline not available for option quotes yet".
- Panel (owner/admin), "Before you can send" checklist, other direct costs
  with "confirmed (including $0)", handling switch, Settings warning %. Any
  edit clears confirmation and acknowledgment.
- Integration tests: TASK-188 acceptance criteria (send 422s, warning levels,
  threshold 15%, acknowledgment, freeze after a rate change, existing drafts
  get the checklist, option quotes unsupported, tech cannot see the panel).
- Post-deploy check: an existing sent estimate shows "Hours not recorded" and
  the same totals.

### B6 · TASK-195 · Review rewrite

- `apps/web/app/api/v1/estimates/[id]/review/route.ts` and
  `apps/web/lib/estimates/review.ts`: input = `BaselineResult`, all lines
  (type, hours, source), billing method, prepared-scope gaps, settings rates;
  remove the $/sq ft rules and the hard-coded $85; validate output with Zod;
  treat `max_tokens` as an error; store `review_result` with
  `review_for_updated_at`. Keep the current model ID.
- `EstimateReviewPanel.tsx`: `autoLoad` default false; stored result shown
  while current.
- Tests: opening an estimate makes no AI call (mock asserts zero calls);
  stored result reused; the prompt for Fixture A carries Pantry, Kitchen,
  Hall and Foyer as missing materials.

---

## Plan: fill-in tasks

Each follows its backlog task's scope and acceptance criteria. Items marked
"proposal" are engineering proposals (see the decisions register).

- **F1 TASK-204:** shared helper `apps/web/lib/ai/claude-call.ts` with Zod
  validation, `max_tokens` treated as an error, and usage logging (feature,
  model, tokens, duration); timeout 120 s and one retry (proposal). Move the
  nine call sites onto it one at a time. Owner/admin on ai-draft, ai-scope,
  ai-materials, ai-tm-briefing and review. Key guard on the interview. Keep
  each feature's model ID.
- **F2 TASK-203:** portal approve/decline use the same helper as the email
  path for audit log, workflow event, attention event and booking-request
  advance; non-`sent` → 409 with current status; repeated approve → 200, no
  side effects.
- **F3 TASK-198:** store the owner's deposit rule as entered; recompute
  `deposit_cents` from the rule on every change.
- **F4 TASK-202:** fixed price with no eligible groups → one "Work as
  described" labor line; T&M profit-card sell price = sum of quote lines.
- **F5 TASK-205:** stream the generator response or run it as a polled job
  (proposal) so no request waits over 100 s; assessment hand-off lines carry
  `line_item_type: "materials"` and cost.
- **F6 TASK-206:** travel route 409 for non-draft; PATCH keeps the stored tax
  rate when none is sent; list the stale sent estimates in the PR for the
  owner (G3); close none.
- **F7 TASK-207:** audit row on password change with actor and target, no
  secrets.
- **F8 TASK-199:** server builds painting lines from account rules; typed
  materials/handling lines.
- **F9 TASK-200:** create and edit store the highest option total with a
  matching subtotal including travel and risk; option lines keep type,
  visibility and price-book id.
- **F10 TASK-201:** `computeAndPersist` runs on the create transaction's
  client; failure fails the create; total includes travel and risk; tax
  recomputed; pricing review re-run.
- **F11 TASK-208:** reuse `computeHourlyBaseline` for change orders; plan the
  file list from the change-order code once B5 is Verified.

## Plan: Track D

Breadcrumbs for whoever continues. Each step lists the files, the tests and
the production follow-up. Record progress in "Current state" and "Log".

### D1 · TASK-224 · Customer quote shows labor as an amount and options that stand out

- Domain: `packages/domain/src/prepared-scope.ts` — `PreparedAlternative`
  gains `price_cents: number | null` (schema `.nullable().optional()`, so old
  scopes parse).
- Notes and lines: `apps/web/lib/estimates/prepare-quote.ts`.
  - `preparedScopeToLineItems`: the T&M description becomes
    `${label} — labor`.
  - `buildProposalNotes`: no Options section when alternatives exist, and no
    allowances sentence in fixed mode.
  - `applyScopeEdits`: merge alternatives. Keep stored ids, take
    label/price/note from incoming, add new ones with server ids `a<n>`, and
    drop removed ones.
- Customer views:
  - Portal: `app/portal/estimates/[token]/page.tsx` loads
    `prepared_scope->'alternatives'`. `EstimatePortalClient.tsx` hides Qty and
    Unit for labor rows and renders the add-ons block.
  - PDF: `lib/pdf/load.ts` passes the alternatives. `lib/pdf/document-pdf.ts`
    leaves the Qty and Unit cells blank for labor and draws the add-ons box
    after the totals.
  - Print page: `app/app/estimates/[id]/print/page.tsx`, same as the portal.
- Owner UI: `app/app/estimates/[id]/sections/PreparedScopePanel.tsx`, the
  Options list becomes editable (label, price, note, add, remove).
- Production follow-up after Verified: Dowd EST-2026-0026 has prices in its
  option labels ("(add $750)", "(add $1,050)"). Move them to `price_cents`,
  strip them from the labels, and rebuild the notes with `buildProposalNotes`.
  Dry run first, total stays 875000. The script pattern used on 2026-10-31
  (pg Pool to the postgres container IP, a transaction, an `updated_at`
  check) is described in the owner's agent memory; `option-stairs.ts` was its
  last use.

### D2 · TASK-226 · New letterhead

- `apps/web/lib/company/branding.ts`: `logoIsWordmark`, read from the PNG
  IHDR (width ≥ 2.5 × height).
- `apps/web/lib/pdf/document-pdf.ts`: the wordmark branch (bigger logo, no
  name text).
- Invoice print page: `app/app/invoices/[id]/print/page.tsx`. The estimate
  print page gets the same header.
- Logo source: `~/mydovetails-site` `origin/master`,
  `public/brand/png/dovetails-horizontal-color-1200.png`.
- Production follow-up after Verified (owner-approved 2026-10-31):
  - Address: DONE 2026-10-31 (removed before deploy; see Log).
  - Upload the logo. Use the Settings → Company logo upload, or
    `docker cp` it into `/app/uploads/account/aaaaaaaa-0000-0000-0000-000000000001/`
    and set `settings.logo_filename`. First check the uploads dir is a
    mounted volume.
  - Set `settings.company_address` to empty.
  - Check by eye one invoice PDF.

### D3 to D5

See the task files. Owner questions answered 2026-10-31 (G6, G7). Order the
owner chose: D4 next, then D3 and D5.

## Log

- 2026-10-31 · D2 · Data · logo: logo-dovetails-horizontal-2026.png (site repo dovetails-horizontal-color-1200.png) copied into /app/uploads/account/aaaaaaaa…0001/ and settings.logo_filename set (was logo-e680679f.png, file kept; reversal: set logo_filename back)
- 2026-10-31 · D1 · Data · Dowd EST-2026-0026: option prices moved from labels to price_cents (a1 75000, a2 105000), labels cleaned, foyer line says "(see Optional add-ons)", notes rebuilt with buildProposalNotes (no allowances sentence, no options list). Dry run first; total stayed 875000
- 2026-10-31 · D1/D2/D4 · Verified · 0e1b9921 deployed ~16:05 UTC (no migration, no backup needed); health ok, /login HTTP/2 200; Dowd portal shows the add-ons box with prices
- 2026-10-31 · D0/D1/D2/D4 · Merged · #740 · squash 0e1b9921 (Codex threads resolved by the agent after the owner allowed gh api graphql). Deploy pending
- 2026-10-31 · D1 · Codex review on #740: option ids reused after delete (Revise counted, now max suffix, shared lastAlternativeNumber) and PDF add-ons box overflowing one page (now continues per page); fixed in 3f041ae1, replies posted
- 2026-10-31 · D5 · In progress · local branch task/228-height-factors · Craftsman height factors replace the vaulted_ceilings pace modifier in Prepare Quote; note on each wall task. Local: lint, typecheck, unit (domain 542, web 2328), knip
- 2026-10-31 · D3 · In progress · local branch task/225-add-on-approval · migration 213 approved_add_ons (applied + reversed on the dev DB in a rolled-back transaction), portal checkboxes with running total, deposit on base + add-ons, final bill add-on lines, staff card. Local: lint, typecheck, web unit 2328, knip, migration prefixes; integration test add-on-choice.integration.test.ts for CI
- 2026-10-31 · D0–D4 · PR #740 opened (one PR for the four stacked commits)
- 2026-10-31 · D4 · In progress · local branch task/227-pool-paint · owner toggle pool_paint; pooledPaint in domain (pails, gallons, quarts under 1 gal; shares by need); buy list "Paint (bought together)". Local: lint, typecheck, unit (domain 539, web 2320) green, knip no failures
- 2026-10-31 · G6/G7 · Approved in session: "approve both, use craftsman factors, start TASK-227"
- 2026-10-31 · D2 · Data · prod account aaaaaaaa…0001 settings.company_address removed (was "85R Rockingham Rd Derry, NH 03038"; reversal: UPDATE accounts SET settings = settings || '{"company_address":"85R Rockingham Rd Derry, NH 03038"}' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'). Owner asked for it in session. Logo upload waits for D2's deploy (old code would print the name twice)
- 2026-10-31 · D2 · In progress · local branch task/226-letterhead · wordmark detection from PNG IHDR, PDF + shared Letterhead on invoice and quote print pages. Local: lint, typecheck, web unit 2316 green, knip no failures; sample PDF checked by eye
- 2026-10-31 · D1 · In progress · local branch task/224-customer-quote-options · labor amount only on portal/PDF/print, add-ons block, option editor, notes without options/allowances on fixed. Local: lint, typecheck, unit (web 2307, domain 532) green, knip no failures; integration test added (prepared-scope-apply), not run locally (no test server)
- 2026-10-31 · D0 · In progress · backlog TASK-224..228, ROADMAP Phase 3 slice, map rows, Track D plan

One line per state change: date, step, state, PR, evidence.

- 2026-10-27 · B3 · Verified · health ok and /login HTTP/2 200 at 02:32 UTC; materials cost 10000 with a $120 equipment line typed equipment; probe f75410c8 deleted; known-good deploy-good/2842780e
- 2026-10-27 · B3 · Deployed · 2842780e · web recreated and healthy ~02:32 UTC. Migration 210 applied after backup ai_fsm_20261027T022524Z.dump. Worker image left as it was.
- 2026-10-27 · B3 · Merged · #728 · squash 2842780e at 02:25 UTC
- 2026-10-27 · B3 · Implemented · #728 · CI runs 40437008165 and 40437011775 green (lint, typecheck, build, test, e2e-smoke) on 3ec687c3. equipment-line integration test passed.
- 2026-10-27 · B3 · In progress · #728 · equipment is its own line; handling and the materials total leave it out
- 2026-10-27 · B2 · Verified · health ok and /login HTTP/2 200 at 01:28 UTC; draft 237ba3cd total stayed 1082125 and its 8 labor lines have null hours; known-good deploy-good/20c7d5f8
- 2026-10-27 · B2 · Deployed · 20c7d5f8 · web recreated and healthy ~01:28 UTC. Migration 209 applied after backup ai_fsm_20261027T012137Z.dump. Worker image left as it was.
- 2026-10-27 · B2 · Merged · #726 · squash 20c7d5f8 at 01:21 UTC
- 2026-10-27 · B2 · Implemented · #726 · CI runs 40429996387 and 40430001995 green (lint, typecheck, build, test, e2e-smoke) on b4e3ddea
- 2026-10-27 · B2 · In progress · #726 · person-hours on labor lines and on a flat quote; blank stays null
- 2026-10-27 · B1 · Verified · health ok and /login HTTP/2 200 at 00:04 UTC; draft labor 10000 materials 20000 then deleted; known-good deploy-good/f4837336
- 2026-10-27 · B1 · Deployed · f4837336 · web recreated and healthy ~00:02 UTC. Migration 208 applied after backup ai_fsm_20261026T235404Z.dump. Worker image left as it was.
- 2026-10-26 · B1 · Merged · #724 · squash f4837336 at 23:53 UTC
- 2026-10-26 · B1 · Implemented · #724 · CI runs 40419939119 and 40419947446 green (lint, typecheck, build, test, e2e-smoke) on c9a4e416
- 2026-10-26 · B1 · In progress · #724 · materials cost separate from the customer price
- 2026-10-26 · A2 · Verified · health ok and /login HTTP/2 200 at 22:51 UTC; known-good deploy-good/e7b27ef9
- 2026-10-26 · A2 · Deployed · e7b27ef9 · web recreated and healthy ~22:51 UTC. No migration, so no backup. Worker image left as it was.
- 2026-10-26 · A2 · Merged · #723 · squash e7b27ef9 at 22:44 UTC
- 2026-10-26 · A2 · Implemented · #723 · CI runs 40413156570 and 40413164445 green (lint, typecheck, build, test, e2e-smoke) on 18270eb2
- 2026-10-26 · S0.4 · Merged by owner (#721, c0544597). G0 active: owner comment on #721 at 21:29 UTC.
- 2026-10-26 · A2 · In progress · #723 · chosen option plus shared lines; hidden lines fold; lines sum to the invoice subtotal
- 2026-10-26 · A1 · Verified · health ok and /login HTTP/2 200 at 22:06 UTC; known-good deploy-good/1a8cc54c
- 2026-10-26 · A1 · Deployed · 1a8cc54c · web recreated and healthy ~22:05 UTC. No migration, so no backup. Worker image left as it was (web-only change).
- 2026-10-26 · A1 · Merged · #722 · squash 1a8cc54c at 21:57 UTC
- 2026-10-26 · A1 · Implemented · #722 · CI run 40406723540 green (lint, typecheck, build, test, e2e-smoke) on 09ad83dd
- 2026-10-26 · A1 · In progress · #722 · price book price only; model price ignored
- 2026-10-26 · S0.3 · Merged by owner (#720, ddd2a31b); deployed 19:39 UTC; verified /api/health ok, /login 200, /app/map 307 to relative /login; last known-good branches deploy-good/7a68ace6 and deploy-good/ddd2a31b
- 2026-10-26 · S0.2 · G1 and G5 approved in session; G0 approved in session, awaiting PR comment to activate
- 2026-10-26 · S0.1 · Implemented · PR #721 · runbook written, then revised after an independent review (authority gated on PR comment, recovery gated on G5, database checklist, worktree isolation, four-state status, attribution by actual contributor)
