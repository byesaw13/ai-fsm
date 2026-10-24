# TASK-180: Price, profitability and proposal from the same draft

Status:
Done (2026-10-24)

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Problem:
The general engine derives labor hours from selling price divided by billing
rate (`estimate-engine/general.ts`), so hours, T&M and margin are computed
from the price instead of the work. The summary card comparison (TASK-100)
inherits this.

Business Value:
The owner sees how long the job should take, what it costs, and what is left,
before choosing a price.

Scope:
- Edit hours and materials per group; totals recalculate at once.
- T&M range = hours × account billing rate + materials. A fixed-price field
  sits beside it. The selected pricing mode is always shown. Rates come from
  Settings; a pasted rate is never used.
- Modeled profitability uses the labor cost rate from Settings, allocated
  overhead and an optional reserve, labeled "modeled remainder", not net
  profit. Overhead already inside a billing rate is not counted twice.
- Owner-approved alternatives (paint blend vs whole wall, floor options,
  fixture packages) carry their own prices or stay marked unpriced.
- Customer proposal preview shows scope, options, exclusions and allowances,
  never internal cost or margin. Save and Send stay separate actions.
- Approved hours are stored so they can later be compared with actual hours.
- Sent or accepted estimates keep their reviewed amounts and are never
  recalculated.

Out of Scope:
- Market comparison; automatic calibration from actuals.

Acceptance Criteria:
- [x] The numeric fixture totals 32–51 hours, $1,305 materials and
      $4,025–$5,640 at a test-only $85/hour.
- [x] The profitability scenario (42 h × $50 cost, $300 overhead, 12% reserve
      of modeled cost, $5,500 fixed) shows $3,705 modeled cost, $444.60
      reserve, $1,350.40 remainder, 24.55%.
- [x] The fixed scenario and the T&M range are never shown as the same offer.
- [x] Customer-supplied items stay out of materials cost; tax, handling and
      deposit survive save and reload.
- [x] Historical estimates show the same totals as before.

Notes:
Depends on TASK-179. Absorbs TASK-100; close TASK-100 when this ships.
Owner must set a real labor cost rate in Settings before margins mean
anything.

Shipped: Pricing in the Prepared scope section (T&M range or fixed price;
fixed price becomes per-room labor and materials lines summing to the price);
modeled profit for owner/admin (expected hours × cost rate, materials,
per-quote overhead and reserve %, modeled remainder and %); Apply records the
pricing lane and internal labor/material cost from the owner's hours, and
writes a customer "What's included" into blank notes (or notes it wrote
before). The print preview now shows Scope & assumptions like the portal.
Owner decisions 2026-10-24: one line per room for fixed prices; overhead and
reserve per quote starting at $0; proposal text only into blank notes.

