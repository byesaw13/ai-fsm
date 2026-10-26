# TASK-188: Hourly baseline on every estimate (parent)

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3 (estimate guardrails visible). Reference only: the baseline never changes
the price the owner sets. Hours driving price is a separate, later roadmap
decision.

Problem:
Each estimate path reaches a price differently and none compares it with the
company's hourly rate the same way (verified 2026-10-26):

| Path | Price comes from | Hours |
| --- | --- | --- |
| Prepare Quote (`api/v1/visits/[id]/prepare-quote`) | hours x $85 + materials | real estimated hours |
| Painting sq ft calculator (`EstimateEditForm.tsx`, `sqftPaintingToSpec`) | sq ft x $/sq ft | back-derived from price |
| Itemized / flat (`create-estimate.ts`) | owner-typed | price / billing rate (circular) |
| AI review (`lib/estimates/review.ts`) | its own $/sq ft rules, $85/h hard-coded as cost | none |

Nothing stores hours: `estimates` and `estimate_line_items` have no hours
columns; `labor_hours_estimate` in the PATCH body is used for painting math
and dropped. On Fixture A the $1,450 of materials lines was booked into
`internal_labor_cost_cents` (110.25 h x $50 + $1,450 = $6,962.50) and
`internal_material_cost_cents` is 0, so the AI review reported "$0 materials".

Business Value:
Every quote, whatever screen built it, is checked against the same hourly
rate, so prices are consistent for customers and the owner sees when a price
does not cover cost or misses the selling target before sending.

Baseline formula (written into `docs/working/hourly-baseline.md` by TASK-189
before any code):

Every figure is computed for low, midpoint and high person-hours.

```
hours          = work hours (labor lines, OR the estimate-level range on a
                 flat-price quote; never both) + travel hours (the travel-time
                 line, when driving is billed at the labor rate), counted once
labor_sell     = hours x selling rate (billingRateCentsForState: existing rule,
                 unchanged; see the MA section of the doc)
materials      = sum of materials line COSTS (unit_cost_cents x quantity)
handling       = material_handling_pct x cost of materials lines whose price
                 is not above cost; only when handling_in_baseline is on
                 (default off)
equipment      = sum of equipment line costs
other_travel   = travel lines that are not driving time (e.g. mileage charge)
baseline       = labor_sell + materials + handling + equipment + other_travel
quoted         = the quote's selling total before tax (estimate subtotal)
gap            = quoted - baseline(midpoint), shown in $ and %
other_direct   = owner-entered non-labor costs that are not lines (mileage
                 cost, tolls, parking, disposal, permits); prefilled from the
                 travel snapshot mileage cost; must be confirmed (can be $0);
                 never replaces travel hours
effective_rate = (quoted - materials - equipment - other_direct) / hours(high)
```

The selling rate already contains labor cost, overhead and profit. The
baseline adds no separate overhead or profit line. TASK-180 overhead and
reserve are cost-side figures in the profit card only. Handling is revenue,
not a cost, and is never subtracted in effective_rate. Costs, never customer
prices, are used for materials and equipment.

Worked examples A to G, with every input, are in
`docs/working/hourly-baseline.md`. Example A (Fixture A, $85/h, $50/h floor):
87.75 / 110 / 132.25 h, $1,450 materials cost, handling off, no travel, no
equipment, other_direct $0 confirmed. Baseline $8,908.75 / $10,800.00 /
$12,691.25. Quoted $10,821.25, gap +$21.25 (+0.20%). effective_rate =
($10,821.25 - $1,450) / 132.25 = $70.86/h, above the $50 floor.

Fixture A (a real interior repaint prepared from an assessment on 2026-10-26;
used as the test fixture, identified here only by its inputs), T&M, $85/h:

| Work area | Hours low-high | Materials |
| --- | --- | --- |
| Protection, setup & general prep | 9-16 | $300 |
| Bedroom | 13.25-20.25 | $295 |
| Pantry | 2-3 | none priced |
| Kitchen | 8-12 | none priced |
| Office | 7.5-10.25 | $225 |
| Hall | 7-10 | none priced |
| Foyer | 12-20 | none priced |
| Living room | 29-40.75 | $630 |
| Total | 87.75-132.25 | $1,450 |

Quote lines: one labor line per area at its quarter-hour-rounded midpoint
(12.5, 16.75, 2.5, 10, 9, 8.5, 16, 35 = 110.25 h x $85 = $9,371.25) and one
materials line per priced area; subtotal $10,821.25.

Send rules (state, not bypass): a draft may be incomplete. Send is refused
until (1) hours are complete: every labor line has a valid low <= high range,
or a flat-price quote with no labor lines has an estimate-level range; partial
line hours are never summed and shown as the total; (2) direct costs are
complete: every materials and equipment line has an amount and other_direct
is confirmed (an explicit $0 counts). Missing information blocks Send with a
message naming what is missing. A complete quote whose effective_rate is
below the cost floor can be sent only after an explicit acknowledgment that
is recorded on the estimate. Quoted below the midpoint baseline shows a
warning; at or beyond the configurable threshold (default 10%) below it, a
stronger warning. Warnings never block. Existing minimum-charge checks stay.

Owner decisions (2026-10-26):
- Scope is the whole estimating system: every creation path listed under
  "Creation paths and coverage" below. Fixture A is only the math test.
- Reference only: the baseline never changes the price the owner sets.
- Good/Better/Best (multi-option) quotes are explicitly unsupported by the new
  baseline checks until TASK-183 adds a per-option baseline: the panel says
  "Baseline not available for option quotes yet", no combined baseline is
  ever computed or shown, and the new send rules do not apply to them.
  Existing checks (pricing review, minimum charge) still apply.
- Existing quotes: sent and approved versions are preserved untouched. Existing
  drafts must meet the new send rules before sending, with a clear way to add
  what is missing (TASK-194 checklist).
- Change orders are out of scope here (TASK-208).
- Cost-floor check uses high-end person-hours; selling warnings use the
  midpoint; the full range is always shown.
- Sending requires complete hours and confirmed direct costs; "incomplete" is
  a draft state, never a way past the send rules. Below the cost floor, Send
  needs an explicit acknowledgment.
- Equipment is its own line type, separate from materials and excluded from
  materials handling (TASK-192).
- Production rate 5012 (interior walls, 400 sq ft/day, migration 207) is an
  owner-set override, uncalibrated: it keeps driving wall hours, labeled
  "production rate (uncalibrated)". Every other uncalibrated rate falls back
  to AI hours (TASK-193).
- Sent quotes keep their assumptions and earlier versions: the baseline inputs
  and rates are frozen at send, a sent estimate's lines, prices and snapshot
  are never rewritten (the existing immutability trigger), and a revision is a
  new estimate that leaves the sent one intact.
- Handling (15%) is off by default and opt-in per estimate.
- Job-related driving billed at the labor rate counts as person-hours in the
  baseline and the effective-rate denominator, once; mileage, tolls and
  parking are other direct costs and never replace travel hours.
- Materials lines have a cost separate from the customer price; the baseline
  and cost floor use costs; a marked-up line shows its markup and gets no
  automatic handling.
- Warning at any amount below the midpoint; stronger warning from 10% below
  (editable). The effective rate uses the quote's selling total before tax.
- The Massachusetts adjustment is documented only; not introduced or changed.

Clarifications (fixed decisions):
- Cost floor = `business_pricing_settings.labor_cost_cents_per_hour` ($50/h
  today). Selling rate = `billingRateCentsForState(settings, property.state)`.
- Midpoint hours = (low + high) / 2, unrounded. Money is computed in cents and
  rounded once with Math.round at the end. gap_pct = gap / baseline(mid),
  two decimals.
- A range with high = 0 is invalid for Send; effective_rate is null (not
  shown) while hours are incomplete.
- Travel: the travel-time line is the adjustment_type 'travel_surcharge' line
  that carries hours (filled from the snapshot's billable_travel_minutes / 60,
  source travel_calc, editable); its amount is not added again because its
  hours are already in labor_sell. Other 'travel_surcharge' lines (mileage
  charge) are other_travel. With no travel lines (include_in_labor mode),
  travel hours come from the snapshot and travel_surcharge_cents minus the
  snapshot's travel_time_charge_cents is other_travel. Never both lines and
  surcharge. Driving billed at a non-labor rate or unbilled is not covered yet.
- Materials and equipment lines carry unit_cost_cents (cost) separate from
  unit_price_cents (customer price); price defaults to cost. A line priced
  above cost shows its markup and is excluded from automatic handling.
- The MA adjustment (`ma_labor_rate_delta`, today 0% on the active account) is
  existing behavior, documented in the doc, not introduced or changed here.
- Any change to lines, hours, costs, other_direct or handling_in_baseline clears
  direct_costs_confirmed_at and cost_floor_ack_at/by.
- baseline_snapshot is written once, in the same transaction as draft -> sent
  (`apps/web/app/api/v1/estimates/[id]/send/route.ts`); a re-send does not
  rewrite it. Shape: `{ formula_version, rates: { sell_cents, cost_cents,
  handling_pct, warning_pct }, hours: {low, mid, high}, components: {labor_sell,
  materials, handling, equipment, travel, other_direct}, baseline: {low, mid,
  high}, quoted, gap_cents, gap_pct, effective_rate_cents }`.
- Review cache is valid while `review_for_updated_at = estimates.updated_at`.
- Legacy: sent, approved, declined and expired estimates are never rewritten
  and show "Hours not recorded" when they have none. Existing drafts open with
  the TASK-194 "Before you can send" checklist listing each missing item
  (labor lines without hours, unconfirmed direct costs) with a link to the
  field; the owner fills them in on the normal edit form.
- Migration ownership: TASK-191 adds migration 208 (all columns above except
  the line type CHECK); TASK-192 adds migration 209 (CHECK gains 'equipment';
  reversal converts equipment rows to materials first).
- Review rule for "hours but no materials price": prepared-scope groups whose
  confirmed tasks have hours and every materials_cents null.
- Production-rate hours = quantity / rate (sqft_per_hour) or quantity / rate x
  8 (per_day units, 8-hour day), multiplied by (1 + sum of applied modifier
  modifier_pct). Editing rates and calibration is owner/admin only.

Children (order and reason):

```
TASK-189 formula doc --+--> TASK-191 hours on every estimate --+--> TASK-194 baseline panel, send rules, freeze
TASK-190 cost split    |    TASK-192 equipment line type -------+       '--> TASK-195 review rewrite
                       '--> TASK-193 production rates ---------'
```

The formula is agreed on paper first; TASK-190 fixes the cost data every
later step reads; 191-193 are the inputs; 194 computes and enforces; 195 reads
the finished baseline.

| Task | Delivers | Acceptance |
| --- | --- | --- |
| 189 Baseline formula doc | `docs/working/hourly-baseline.md`: formula, what the rate includes, double-count rules (setup, protection, cleanup, travel once at the right scope; extra setup line allowed for a separate visit or work area), send rules | Fixture A numbers above reproduce from the doc |
| 190 Materials cost field and cost split | `unit_cost_cents` on materials and equipment lines (price defaults to cost; markup shown; marked-up lines get no automatic handling); `create-estimate.ts` itemized branch: labor cost from labor lines only, materials cost from line costs, no phantom handling in margin | Fixture A inputs give internal_material_cost $1,450 and internal_labor_cost $5,512.50 |
| 191 Hours on every estimate | Per-line person-hours low/high and source (owner, price_book, production_rate, ai_allowance, revision, travel_calc; the prepared-scope HoursSource vocabulary plus travel_calc); travel-time line hours from the travel calculation; estimate-level range for flat quotes; price-book lines start from labor_hours_typical, owner can override; drafts save without hours (null, never 0); UI says "person-hours (2 painters x 8 h = 16 h)" | Blank hours persist as null; price-book line shows its typical hours with source price_book; Prepare Quote lines carry their group ranges; a group's source is the least certain of its tasks (ai_allowance, then production_rate, then revision, then price_book, then owner) |
| 192 Equipment line type | `equipment` added to the line type CHECK on estimate and invoice line items; excluded from materials and handling; separate in baseline; convert keeps the type | An equipment line leaves handling unchanged and survives convert as equipment |
| 193 Production rates | `production_rates` and `production_rate_modifiers` editable in Settings (owner/admin) with `calibrated` (default false) and `calibrated_at`; sq ft calculator saves rate id, value, unit and calibration state per line; hours count as calibrated only when the rate and every applied modifier (prep, tall walls, built-in cutting) are calibrated; otherwise AI hours stay the default, labeled AI estimate | Uncalibrated rate keeps source ai_allowance; exception (owner decision 2026-10-26): rate 5012 wall painting at 400 sq ft/day (migration 207, #718) keeps driving wall hours, labeled "production rate (uncalibrated)"; editing a rate does not change saved quotes |
| 194 Baseline panel, send rules, freeze | Baseline panel (low/mid/high, quoted, gap, effective_rate vs floor, incomplete label); warning threshold setting default 10; direct-cost confirmation; send rules above; baseline inputs and rates frozen in a snapshot at send | See acceptance criteria below |
| 195 Review rewrite | Review input: baseline, lines with type/hours/source, billing method, prepared-scope gaps, settings rates; sq ft rules removed; runs on a button; result cached until the estimate changes; output schema-validated | Opening an estimate makes no AI call; on Fixture A it flags Pantry, Kitchen, Hall, Foyer with hours but no materials price and never mentions sq ft |

Data model (one additive migration, 208):

```sql
ALTER TABLE estimate_line_items
  ADD COLUMN hours_low numeric(8,2),
  ADD COLUMN hours_high numeric(8,2),
  ADD COLUMN hours_source text CHECK (hours_source IN ('owner','price_book','production_rate','ai_allowance','revision','travel_calc')),
  ADD COLUMN production_rate_snapshot jsonb,
  ADD COLUMN unit_cost_cents integer CHECK (unit_cost_cents >= 0),
  ADD CONSTRAINT eli_hours_range CHECK (hours_low IS NULL OR hours_high IS NULL OR (hours_low >= 0 AND hours_low <= hours_high));
ALTER TABLE estimates
  ADD COLUMN labor_hours_low numeric(8,2),
  ADD COLUMN labor_hours_high numeric(8,2),
  ADD COLUMN labor_hours_source text CHECK (labor_hours_source IN ('owner','price_book','production_rate','ai_allowance','revision','travel_calc')),
  ADD COLUMN handling_in_baseline boolean NOT NULL DEFAULT false,
  ADD COLUMN other_direct_cost_cents integer CHECK (other_direct_cost_cents >= 0),
  ADD COLUMN direct_costs_confirmed_at timestamptz,
  ADD COLUMN cost_floor_ack_at timestamptz,
  ADD COLUMN cost_floor_ack_by uuid REFERENCES users(id),
  ADD COLUMN baseline_snapshot jsonb,
  ADD COLUMN review_result jsonb,
  ADD COLUMN review_for_updated_at timestamptz;
ALTER TABLE business_pricing_settings
  ADD COLUMN baseline_warning_pct numeric(5,2) NOT NULL DEFAULT 10;
ALTER TABLE production_rates ADD COLUMN calibrated boolean NOT NULL DEFAULT false, ADD COLUMN calibrated_at timestamptz;
ALTER TABLE production_rate_modifiers ADD COLUMN calibrated boolean NOT NULL DEFAULT false, ADD COLUMN calibrated_at timestamptz;
-- line type CHECK on estimate_line_items and invoice_line_items gains 'equipment' (TASK-192)
```

Reversal: drop the added columns and restore the original CHECK (only if no
equipment rows exist).

Baseline is computed by one pure function in `packages/domain`
(`computeHourlyBaseline(input) -> { hours, low, mid, high, quoted, gap_cents,
gap_pct, effective_rate_cents, complete, missing[] }`), used by the panel, the
send route and the review.

Creation paths and coverage:

Every estimate is created by `createEstimate`
(`apps/web/lib/estimates/create-estimate.ts`) and sent by the send route, so
the rules live there. Each path must still pass its own hours, sources and
costs correctly, so each gets its own coverage test (create through the
path's real entry point, then assert stored line hours, sources, costs and the
baseline result):

| # | Path | Entry point | Hours come from |
| --- | --- | --- | --- |
| 1 | Prepare Quote | `api/v1/visits/[id]/prepare-quote` + Apply | task ranges and sources |
| 2 | New estimate, itemized | `app/app/estimates/new` (`useEstimateForm`) | price book or typed |
| 3 | New estimate, flat price | same | estimate-level range |
| 4 | New estimate, sq ft painting (incl. room-by-room) | same, `sqftPaintingToSpec` / engine spec | production rate or AI (TASK-193) |
| 5 | AI draft (incl. the interview, which ends in an AI draft) | `api/v1/estimates/ai-draft` then the form | price-book hours of the chosen services, source price_book |
| 6 | T&M briefing | `TmBriefingFlow` / `api/v1/estimates/ai-tm-briefing` | extracted labor_hours_min/max, source ai_allowance |
| 7 | Booking-request and assessment-materials prefills | prefilled `app/app/estimates/new` | as path 2 |
| 8 | Quick estimate wizard | `app/app/estimates/quick/QuickEstimateWizard.tsx` (creates, then sends) | entered in the wizard |
| 9 | Fix now from a visit | `app/app/visits/[id]/FixNowEstimateButton.tsx` | entered before send |
| 10 | Direct API | `POST /api/v1/estimates` | request body |
| 11 | Good/Better/Best | multi-option form | not supported: test asserts "Baseline not available" and no combined baseline |

Acceptance Criteria:
- [ ] One coverage test per path 1-11 above passes.
- [ ] `computeHourlyBaseline` reproduces the Fixture A example to the cent.
- [ ] A draft with one labor line missing hours saves, shows "Hours
      incomplete", and Send returns 422 naming that line.
- [ ] A flat-price quote with no labor lines and no estimate-level range
      cannot be sent; with a 20-30 h range it can.
- [ ] Line hours of 10-12 on one line and missing on another are never shown
      as a 10-12 h total.
- [ ] Send is refused until other_direct is confirmed; confirming $0 allows it.
- [ ] Quoted 5% below midpoint shows a warning; 10% below shows the strong
      warning; changing the threshold to 15% moves it; neither blocks Send.
- [ ] Complete quote with effective_rate $45/h cannot be sent without the
      acknowledgment; with it, Send succeeds and cost_floor_ack_at/by are set.
- [ ] Handling off: baseline excludes handling; on: includes materials x
      material_handling_pct; effective_rate never subtracts handling.
- [ ] After send, changing the billing rate in Settings leaves the sent
      estimate's baseline_snapshot and displayed baseline unchanged.
- [ ] The quoted price and line items are never changed by any baseline code.
- [ ] Existing estimates without hours display "Hours not recorded" and
      totals identical to before.
- [ ] An existing draft with no hours shows the "Before you can send"
      checklist; after filling the listed items it can be sent.
- [ ] A Good/Better/Best quote shows "Baseline not available for option quotes
      yet", never a combined baseline, and is not blocked by the new send rules.
- [ ] Unit + integration tests pass; `pnpm gate:fast` green.

Testing:
| Layer | What | Count |
| --- | --- | --- |
| Unit | computeHourlyBaseline (example, low/mid/high, incomplete, handling, flat range, equipment, other_direct, floor) | +12 |
| Unit | send-rule evaluator (missing hours, missing costs, below floor, ack) | +6 |
| Integration | PATCH hours persist null vs value; send 422s; ack path; snapshot frozen | +5 |
| Integration | One coverage test per creation path (table above) | +11 |
| E2E | Prepare Quote -> confirm costs -> panel -> send | +1 |

Rollback:
Revert the PRs; the migration is additive (drop columns to reverse). Sent
estimates keep their prices because baseline code never writes price.

Effort:
189: 0.5 d. 190: 1.5 d (cost field). 191: 3 d (incl. per-path hours and coverage tests).
192: 0.5 d. 193: 1.5 d. 194: 2 d. 195: 1 d.

Out of Scope:
- Per-option baseline for Good/Better/Best (TASK-183).
- Change orders (TASK-208).
- Hours driving price (separate roadmap decision).
- Estimated-vs-actual hours comparison: corrected 2026-10-26. Actual
  per-person job hours already exist (TASK-151: `activity_entries` type
  `job_work` on the job, its visits and work orders; 14 of 18 invoiced jobs
  have them, ~9% of job_work time is unlinked, travel time is never linked).
  The comparison is proposed as TASK-215 (Phase 3, estimating assistant
  slice); learning from actuals stays PI-007, Phase 4. This work stores the
  estimated hours it needs.
- Estimate revisions as a feature (sent quotes are already immutable; a
  revision is a new estimate).
- Moving AI calls to newer models.

Related:
TASK-180 (profit card), TASK-183 (chosen option totals), TASK-196 to TASK-207
(audit 2026-10-26), PI-004, PI-007.
