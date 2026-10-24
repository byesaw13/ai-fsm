# TASK-100: Fix T&M vs Fixed-Rate Comparison Card (Hours-Overrun Modeling)

Status:
Done — absorbed by TASK-180 (2026-10-24)

Phase:
3

Problem:
`EstimateSummaryCard.tsx`'s T&M vs. Fixed-Rate comparison (TASK-096) derives
T&M estimated hours from the same `effectiveHours` value used for the fixed
quote, so the comparison structurally can never model an hours-overrun
scenario — the actual reason T&M exists as a pricing option. The
"Recommendation: Fixed yields $X more" line is close to tautological given
how it's computed. The $85/hr burdened rate is hardcoded in
`EstimateSummaryCard.tsx` (`hybrid-pricing/engine.ts` was deleted in PR #603).

Business Value:
A T&M-vs-Fixed comparison that can actually inform the pricing decision,
instead of one that's rigged toward Fixed by construction.

Scope:
- Model T&M hours independently of the fixed quote's hour estimate — e.g. a
  founder-adjustable "expected overrun %" input, or (once TASK-095/098 have
  real data) a historical variance-based estimate.
- Extract the burdened labor rate into one shared constant.

Out of Scope:
- Automated overrun prediction from historical data — depends on TASK-095
  accumulating enough real samples first.

Acceptance Criteria:
- [x] T&M estimated hours can diverge from the fixed quote's hours in the UI.
- [x] Burdened rate defined once and imported by `EstimateSummaryCard.tsx`.

Notes:
Surfaced during CEO review of PR #589. Priority P2 — the card's Fixed-price
math is currently correct, only the comparison framing is misleading.
To be absorbed by TASK-180 (hours from the work, not the price). Close this
task when TASK-180 ships.

Closed by TASK-180: for prepared quotes the summary card's labor cost comes from the
owner's expected hours × cost rate, so T&M hours diverge from the fixed price; the
billing rate comes from Settings (no hard-coded $85).

