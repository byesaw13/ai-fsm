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
| Work person-hours, low and high | Each labor line; or one estimate-level range on a flat-price quote with no labor lines | Person-hours: 2 painters for 8 hours is 16 h. A missing value stays missing, never 0. |
| Travel person-hours, low and high | The travel-time line, when driving time is billed at the labor rate (filled from the travel calculation's billable minutes, editable) | Job-related driving only. Counted once. See "Travel". |
| Hours source | Owner, price book, production rate, AI estimate, revision, travel calculation | Shown next to the hours. |
| Selling rate | Settings: billing rate per hour, through the existing state rule (see "Massachusetts adjustment") | Today $85/h on the active account. |
| Cost floor | Settings: labor cost per hour | Today $50/h. |
| Materials cost | The cost field on each materials line | What Dovetails pays. See "Materials cost and price". |
| Handling | Handling % from Settings x the cost of materials lines that are not marked up | Off by default. Turned on per estimate. Today 15%. |
| Equipment cost | The cost field on each equipment line | A rental or an explicit use charge, never the full price of a reusable tool. No handling. |
| Other travel charges | Travel lines that are not driving time (for example a mileage charge) | Income on the quote. Counted once. |
| Other direct costs | Entered on the estimate | Non-labor costs that are not lines: mileage cost, tolls, parking, disposal, permits. Prefilled with the travel calculation's mileage cost when there is one. Must be confirmed, and $0 is a valid confirmed answer. These do not replace travel hours. |
| Quoted price | The quote's selling total before tax (the estimate subtotal) | Includes every customer-facing line: labor, materials at their customer price, handling, equipment, travel. |

## The formula

Every figure is worked out three times: at the **low** hours, the
**midpoint** hours and the **high** hours.

```
hours           = work hours + travel hours            (low, midpoint, high)
midpoint hours  = (low + high) / 2

labor           = hours x selling rate
baseline        = labor
                + materials cost
                + handling (only if on; only on lines not marked up)
                + equipment cost
                + other travel charges

gap             = quoted price - baseline at the midpoint
gap %           = gap / baseline at the midpoint

labor left      = quoted price (before tax)
                - materials cost - equipment cost - other direct costs
effective rate  = labor left / HIGH hours
```

Money is worked out in cents and rounded once, at the end. Hours are not
rounded. The gap percentage is shown to two decimals.

## What the selling rate already includes

The selling rate covers **labor cost, overhead and profit**. So:

- The baseline adds no separate overhead line and no profit line.
- Materials and equipment enter the baseline at cost. The only markup the
  baseline adds is handling, and only when it is turned on.
- The overhead and reserve on the profit card (TASK-180) are costs used only
  on that card. They are never added to the baseline.
- Handling is income, not a cost. It is never subtracted when working out the
  effective rate.
- The effective rate uses what things cost Dovetails, never what the customer
  is charged for them.

## Materials cost and price

- Each materials line has two amounts: the **cost** (what Dovetails pays) and
  the **price** (what the customer sees). The price defaults to the cost.
- Handling is a separate line, added on top when handling is turned on.
- If a line's price is above its cost, the line shows that it is marked up
  (for example "marked up 20%"), and handling is not added to it
  automatically, so markup is never charged twice.
- The baseline and the effective rate always use the cost. A materials or
  equipment line with no cost counts as a missing direct cost.

## Travel

- Driving time for the job, billed at the labor rate, is person-hours. It is
  added to the hours in the baseline and in the effective-rate denominator,
  once. Its charge is already covered by "hours x selling rate", so the
  travel-time line's amount is not added again.
- Other travel charges on the quote (such as a mileage charge) are income and
  are added to the baseline as entered.
- What the driving costs Dovetails (mileage, tolls, parking) goes in other
  direct costs. These are in addition to the travel hours, not instead of them.
- Not yet decided: driving time billed at a rate other than the labor rate, or
  not billed at all. This document does not cover that case; today travel time
  is billed at the labor rate.

## Massachusetts adjustment (existing behavior, unchanged)

Documented here because the baseline uses the same selling rate as the quote's
labor lines. This work does not introduce or change it.

- Setting: `business_pricing_settings.ma_labor_rate_delta`, a fraction from 0
  to 1 (migration 151, default 0.15).
- Rule: `billingRateCentsForState` in `packages/domain/src/pricing-settings.ts`.
  When the property's state is "MA" or "Massachusetts", the selling rate is
  `labor_billing_cents_per_hour x (1 + ma_labor_rate_delta)`, rounded to the
  cent. Any other state, or no state, uses `labor_billing_cents_per_hour`.
- Used today by: Prepare Quote and Apply to quote (labor line price), the T&M
  briefing (labor and travel-time rate), and the estimate summary card.
- Current values (2026-10-26): the active account has $85/h and an MA
  adjustment of 0%, so it has no effect. The older historical account has
  $115/h and 15%.
- The baseline calls the same rule, so it matches the rate the quote lines
  were priced at. Whether Massachusetts work should cost more is a separate
  decision and is not part of this work.

## Counting things once

- Setup, protection, cleanup and travel are each one line at the level where
  they happen: once for the job, not once per room.
- An extra setup line is allowed when a separate visit or a separate work area
  really needs its own setup. Its description says why.
- Line hours and the estimate-level range are never added together. The
  estimate-level range is only for a flat-price quote with no labor lines.
- Travel hours are counted once, as hours; the travel-time charge is not also
  added as a travel charge.

## Warnings and checks

| Situation | What happens |
| --- | --- |
| Quoted below the baseline midpoint, by any amount | Warning. Sending is not blocked. |
| Quoted 10% or more below the midpoint | Stronger warning. Sending is not blocked. The 10% is editable in Settings. |
| Effective rate below the cost floor, with hours and costs complete | Send needs an explicit acknowledgment. Who acknowledged and when is saved. |
| Hours or direct costs incomplete | No cost-floor result is shown. Send is refused until they are complete. |
| Existing minimum-charge checks | Unchanged. |

## Before a quote can be sent

A draft can be incomplete. A quote cannot be sent until:

1. **Hours are complete.** Every labor line has a range (low no more than
   high, high above 0), or a flat-price quote has an estimate-level range. If
   some lines have hours and others do not, no total is shown. The completed
   lines are never summed and presented as the whole job. A travel-time line
   needs hours too.
2. **Direct costs are complete.** Every materials and equipment line has a
   cost, and other direct costs are confirmed, even when the answer is $0.

Missing information blocks sending. A deliberately low price only needs an
acknowledgment. Each draft shows a "Before you can send" list of what is
missing, with a link to each field. Older drafts get the same list.

Any change to the lines, hours, costs, other direct costs or the handling
switch clears the cost confirmation and any acknowledgment, so they are given
again for the quote as it now stands.

## After sending

When a quote is sent, its baseline is frozen with the rates, the handling
setting and the warning threshold that were used. Later changes in Settings do
not change a sent quote. A sent quote is never rewritten. A revision is a new
estimate, and the sent one stays as it was.

Quotes sent before this change keep their numbers and show "Hours not
recorded".

## Worked examples

All examples use the $85/h selling rate and the $50/h cost floor. Every input
needed to check the math is listed.

### A. Prepared repaint (Fixture A)

A real interior repaint prepared from an assessment on 2026-10-26, used as the
test case. No travel line. Materials priced at cost. Handling off, no
equipment, other direct costs confirmed at $0.

| Work area | Hours low | Hours high | Materials cost |
| --- | --- | --- | --- |
| Protection, setup and general prep | 9 | 16 | $300 |
| Bedroom | 13.25 | 20.25 | $295 |
| Pantry | 2 | 3 | not priced |
| Kitchen | 8 | 12 | not priced |
| Office | 7.5 | 10.25 | $225 |
| Hall | 7 | 10 | not priced |
| Foyer | 12 | 20 | not priced |
| Living room | 29 | 40.75 | $630 |
| **Total** | **87.75** | **132.25** | **$1,450** |

Midpoint hours: (87.75 + 132.25) / 2 = 110.

The quote lines: one labor line per area at its midpoint rounded to the
quarter hour (12.5, 16.75, 2.5, 10, 9, 8.5, 16, 35 = 110.25 h x $85 =
$9,371.25), plus the four materials lines at $1,450. Quoted price before tax:
$10,821.25.

| | Low (87.75 h) | Midpoint (110 h) | High (132.25 h) |
| --- | --- | --- | --- |
| Labor at $85/h | $7,458.75 | $9,350.00 | $11,241.25 |
| + Materials cost | $1,450.00 | $1,450.00 | $1,450.00 |
| **Baseline** | **$8,908.75** | **$10,800.00** | **$12,691.25** |

- Gap: $10,821.25 - $10,800.00 = **+$21.25**; 21.25 / 10,800 = **+0.20%**.
  No warning. (The quote is $21.25 above the midpoint because the quote lines
  round each area's hours to the quarter hour: 110.25 h against 110 h.)
- Effective rate: ($10,821.25 - $1,450) / 132.25 = $9,371.25 / 132.25 =
  **$70.86/h**. Above the $50 floor.
- Not a math issue, but the review would still point out that Pantry, Kitchen,
  Hall and Foyer have hours and no paint priced.

### B. Fixture A with handling turned on

Handling: 15% x $1,450 = $217.50 (no line is marked up). Baseline midpoint:
$10,800.00 + $217.50 = $11,017.50. The quote has no handling line, so the
quoted price stays $10,821.25.

- Gap: $10,821.25 - $11,017.50 = **-$196.25**; -196.25 / 11,017.50 =
  **-1.78%**. Warning: the price leaves out the handling you turned on.
- Effective rate: unchanged at **$70.86/h**, because handling is never
  subtracted.

### C. Flat-price quote, priced low

No labor lines. Estimate-level range 20 to 30 h (midpoint 25). One materials
line, cost $300, price $300. Handling off, no travel, no equipment. Other
direct costs $40 (disposal), confirmed. Quoted price before tax $2,000.

| | Low (20 h) | Midpoint (25 h) | High (30 h) |
| --- | --- | --- | --- |
| Labor at $85/h | $1,700.00 | $2,125.00 | $2,550.00 |
| + Materials cost | $300.00 | $300.00 | $300.00 |
| **Baseline** | **$2,000.00** | **$2,425.00** | **$2,850.00** |

- Gap: $2,000 - $2,425 = **-$425.00**; -425 / 2,425 = **-17.53%**. Stronger
  warning (10% or more below).
- Effective rate: ($2,000 - $300 - $40) / 30 = $1,660 / 30 = **$55.33/h**.
  Above the floor; no acknowledgment needed.

### D. The same flat quote at $1,700

- Gap: $1,700 - $2,425 = **-$725.00**; -725 / 2,425 = **-29.90%**. Stronger
  warning.
- Effective rate: ($1,700 - $300 - $40) / 30 = $1,360 / 30 = **$45.33/h**.
  Below the $50 floor, so Send needs the acknowledgment.

### E. Incomplete hours

Two labor lines: one at 10 to 12 h, one with no hours. No total is shown (not
"10 to 12 h"), no baseline or effective rate is shown, and the "Before you can
send" list names the line with no hours. It saves as a draft and cannot be
sent until that line has hours.

### F. Travel time counted as hours

One labor line 6 to 8 h, quoted at 7 h x $85 = $595. One materials line, cost
$120, price $120. A travel-time line: 1 h of driving (one round trip) at the
labor rate, $85, hours 1 to 1. A mileage charge line, $30. Mileage cost to
Dovetails $26, entered as other direct costs and confirmed. Handling off, no
equipment. Quoted price before tax: $595 + $120 + $85 + $30 = $830.

Hours: low 6 + 1 = 7, midpoint 7 + 1 = 8, high 8 + 1 = 9.

| | Low (7 h) | Midpoint (8 h) | High (9 h) |
| --- | --- | --- | --- |
| Labor (work + travel) at $85/h | $595.00 | $680.00 | $765.00 |
| + Materials cost | $120.00 | $120.00 | $120.00 |
| + Other travel charges (mileage charge) | $30.00 | $30.00 | $30.00 |
| **Baseline** | **$745.00** | **$830.00** | **$915.00** |

- Gap: $830 - $830 = **$0.00 (0.00%)**. No warning.
- Effective rate: ($830 - $120 - $26) / 9 = $684 / 9 = **$76.00/h**.
- Without the travel hour in the denominator it would read $684 / 8 =
  $85.50/h, which overstates what the job pays per hour worked.

### G. A marked-up materials line, handling on

One labor line 10 to 14 h, quoted at 12 h x $85 = $1,020. Materials line 1:
cost $200, price $240, shown as "marked up 20%", so no handling is added to
it. Materials line 2: cost $100, price $100. Handling on at 15%: applies only
to line 2, so $15, shown as a handling line on the quote. No travel, no
equipment, other direct costs confirmed at $0. Quoted price before tax:
$1,020 + $240 + $100 + $15 = $1,375.

| | Low (10 h) | Midpoint (12 h) | High (14 h) |
| --- | --- | --- | --- |
| Labor at $85/h | $850.00 | $1,020.00 | $1,190.00 |
| + Materials cost ($200 + $100) | $300.00 | $300.00 | $300.00 |
| + Handling (15% x $100) | $15.00 | $15.00 | $15.00 |
| **Baseline** | **$1,165.00** | **$1,335.00** | **$1,505.00** |

- Gap: $1,375 - $1,335 = **+$40.00**; 40 / 1,335 = **+3.00%** (the $40 is the
  markup on line 1). No warning.
- Effective rate: ($1,375 - $300) / 14 = $1,075 / 14 = **$76.79/h**. Costs,
  not customer prices, are subtracted.

## Owner decisions (2026-10-26)

- Driving time for the job, billed at the labor rate, counts as person-hours
  in both the baseline and the effective-rate denominator, once. Mileage,
  tolls and parking are separate direct costs and do not replace travel hours.
- Materials lines get a cost separate from the customer price. The price
  defaults to the cost; handling is added separately; a marked-up line shows
  its markup and gets no automatic handling. The baseline and the cost floor
  use costs.
- Warning at any amount below the midpoint; stronger warning from 10% below,
  editable.
- The effective rate uses the quote's selling total before tax.
- The Massachusetts adjustment is documented, not introduced or changed.
