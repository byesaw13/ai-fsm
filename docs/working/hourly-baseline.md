# Hourly baseline

Status: draft for owner review (TASK-189). No code is built from this until the
owner approves it. Parent task: `docs/backlog/TASK-188-hourly-baseline-every-estimate.md`.

## What it is

Every estimate is compared with what the same work costs at the company's
hourly rate. That comparison is the **hourly baseline**.

It is a reference. It never changes the price the owner sets. It answers two
questions:

1. **Is this priced to meet the business target?** Quoted price against the
   baseline at the midpoint of the hours range.
2. **Will this cover costs?** The labor rate left after direct costs, against
   the labor cost floor, using the high end of the hours range.

It applies to every estimate, whichever screen built it. Good/Better/Best
quotes are not covered until each option gets its own baseline (TASK-183);
change orders come later (TASK-208).

## Inputs

| Input | Where it comes from | Notes |
| --- | --- | --- |
| Person-hours, low and high | Each labor line; or one estimate-level range on a flat-price quote with no labor lines | Person-hours: 2 painters for 8 hours is 16 h. A missing value stays missing, never 0. |
| Hours source | Owner, price book, production rate, AI estimate, revision | Shown next to the hours. |
| Selling rate | Settings, billing rate per hour; Massachusetts properties add the MA percentage from Settings | Today $85/h in NH. |
| Cost floor | Settings, labor cost per hour | Today $50/h. |
| Materials | Materials lines, entered at cost | Consumables: paint, tape, caulk, patch. |
| Handling | Materials x handling % from Settings | Off by default. Turned on per estimate. |
| Equipment | Equipment lines | A rental or an explicit use charge, never the full price of a reusable tool. No handling. |
| Travel | Travel lines, or the travel surcharge when there are no travel lines | Counted once. Never both. |
| Other direct costs | Entered on the estimate | Non-labor costs that are not lines: mileage cost, disposal, permits. Prefilled with the travel calculation's mileage cost when there is one. Must be confirmed, and $0 is a valid confirmed answer. |
| Quoted price | The estimate's subtotal before tax | |

## The formula

Every figure is worked out three times: at the **low** hours, the
**midpoint** hours and the **high** hours.

```
midpoint hours  = (low + high) / 2

labor           = hours x selling rate
baseline        = labor + materials + handling (only if on) + equipment + travel

gap             = quoted price - baseline at the midpoint
gap %           = gap / baseline at the midpoint

labor left      = quoted price - materials - equipment - other direct costs
effective rate  = labor left / HIGH hours
```

Money is worked out in cents and rounded once, at the end. Hours are not
rounded. The gap percentage is shown to two decimals.

## What the selling rate already includes

The selling rate covers **labor cost, overhead and profit**. So:

- The baseline adds no separate overhead line and no profit line.
- Materials and equipment pass through at cost. The only markup is handling,
  and only when it is turned on.
- The overhead and reserve on the profit card (TASK-180) are costs used only
  on that card. They are never added to the baseline.
- Handling is income, not a cost. It is never subtracted when working out the
  effective rate.
- The effective rate uses what things cost Dovetails, not what the customer
  is charged for them.

## Counting things once

- Setup, protection, cleanup and travel are each one line at the level where
  they happen: once for the job, not once per room.
- An extra setup line is allowed when a separate visit or a separate work area
  really needs its own setup. Its description says why.
- Line hours and the estimate-level range are never added together. The
  estimate-level range is only for a flat-price quote with no labor lines.
- A travel charge on the quote is income. What the driving costs belongs in
  other direct costs.

## Warnings and checks

| Situation | What happens |
| --- | --- |
| Quoted below the baseline midpoint | Warning. Sending is not blocked. |
| Quoted 10% or more below the midpoint | Stronger warning. Sending is not blocked. 10% is a starting value, changeable in Settings. |
| Effective rate below the cost floor, with hours and costs complete | Send needs an explicit acknowledgment. Who acknowledged and when is saved. |
| Hours or direct costs incomplete | No cost-floor result is shown. Send is refused until they are complete. |
| Existing minimum-charge checks | Unchanged. |

## Before a quote can be sent

A draft can be incomplete. A quote cannot be sent until:

1. **Hours are complete.** Every labor line has a range (low no more than
   high, high above 0), or a flat-price quote has an estimate-level range. If
   some lines have hours and others do not, no total is shown. The completed
   lines are never summed and presented as the whole job.
2. **Direct costs are complete.** Every materials and equipment line has an
   amount, and other direct costs are confirmed, even when the answer is $0.

Missing information blocks sending. A deliberately low price only needs an
acknowledgment. Each draft shows a "Before you can send" list of what is
missing, with a link to each field. Older drafts get the same list.

Any change to the lines, hours, other direct costs or the handling switch
clears the cost confirmation and any acknowledgment, so they are given again
for the quote as it now stands.

## After sending

When a quote is sent, its baseline is frozen with the rates, the handling
setting and the warning threshold that were used. Later changes in Settings do
not change a sent quote. A sent quote is never rewritten. A revision is a new
estimate, and the sent one stays as it was.

Quotes sent before this change keep their numbers and show "Hours not
recorded".

## Worked examples

All examples use the $85/h selling rate and the $50/h cost floor.

### A. Prepared repaint (Fixture A)

A real interior repaint prepared from an assessment on 2026-10-26, used as the
test case.

| Work area | Hours | Materials |
| --- | --- | --- |
| Protection, setup and general prep | 9 - 16 | $300 |
| Bedroom | 13.25 - 20.25 | $295 |
| Pantry | 2 - 3 | not priced |
| Kitchen | 8 - 12 | not priced |
| Office | 7.5 - 10.25 | $225 |
| Hall | 7 - 10 | not priced |
| Foyer | 12 - 20 | not priced |
| Living room | 29 - 40.75 | $630 |
| **Total** | **87.75 - 132.25** (midpoint 110) | **$1,450** |

Handling off, no equipment, other direct costs confirmed at $0. Quoted
$10,821.25.

| | Low | Midpoint | High |
| --- | --- | --- | --- |
| Labor at $85/h | $7,458.75 | $9,350.00 | $11,241.25 |
| + Materials | $1,450.00 | $1,450.00 | $1,450.00 |
| **Baseline** | **$8,908.75** | **$10,800.00** | **$12,691.25** |

- Gap: $10,821.25 - $10,800.00 = **+$21.25 (+0.20%)**. No warning.
- Effective rate: ($10,821.25 - $1,450) / 132.25 h = **$70.86/h**. Above the
  $50 floor.
- The review would still point out that Pantry, Kitchen, Hall and Foyer have
  hours but no paint priced.

### B. The same quote with handling turned on

Handling 15% of $1,450 = $217.50. The baseline midpoint becomes $11,017.50.
The quote has no handling line, so the gap is **-$196.25 (-1.78%)**: a warning
that the price leaves out the handling you turned on. The effective rate is
unchanged at $70.86/h, because handling is never subtracted.

### C. Flat-price quote, priced low

No labor lines. Estimate-level range 20 - 30 h. Materials $300. Other direct
costs $40 (disposal), confirmed. Quoted $2,000.

| | Low | Midpoint | High |
| --- | --- | --- | --- |
| **Baseline** | $2,000.00 | $2,425.00 | $2,850.00 |

- Gap: **-$425.00 (-17.53%)**. Stronger warning (10% or more below).
- Effective rate: ($2,000 - $300 - $40) / 30 h = **$55.33/h**. Above the floor,
  so no acknowledgment is needed. It can be sent with the warning showing.

### D. The same flat quote at $1,700

- Gap: **-$725.00 (-29.90%)**. Stronger warning.
- Effective rate: ($1,700 - $300 - $40) / 30 h = **$45.33/h**. Below the $50
  floor, so Send needs the acknowledgment.

### E. Incomplete hours

Two labor lines: one at 10 - 12 h, one with no hours. No total is shown (not
"10 - 12 h"), no baseline or effective rate is shown, and the "Before you can
send" list names the line with no hours. It saves as a draft and cannot be
sent until that line has hours.

## Questions for the owner

These need an answer before TASK-190 to TASK-195 start:

1. **Travel time.** When a quote charges travel time at the labor rate, should
   those driving hours count toward the high-end hours for the cost floor?
   Leaving them out makes the effective rate look better than it is, because
   the travel income is in the quoted price while the time it takes is not in
   the hours.
2. **Materials at cost.** This assumes materials lines are entered at what
   they cost you, with any markup only in handling. If you sometimes mark up
   materials inside the line price, the effective rate will read too high.
   Should materials lines carry a separate cost?
3. **The stronger warning.** Confirm 10% below the midpoint as the starting
   threshold.
