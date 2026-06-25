# Pricing Intelligence Charter — DRAFT (PI-004)

**Status:** Draft / working. **Not canonical, not committed.** Held under
EPIC-008 as PI-004 until TASK-018 + PI-002 prove the model in real use.
**Date:** 2026-06-25
**Derived from:** [`docs/generated/PRICING_EVIDENCE_ANALYSIS_2026-06.md`](../generated/PRICING_EVIDENCE_ANALYSIS_2026-06.md),
the Pricing Codebook v2.0, and [`PRICING_AUDIT_REPORT_2026.md`](PRICING_AUDIT_REPORT_2026.md).

## What this is

A first-draft set of **proposed** pricing business rules for how Dovetails prices
work. It is **not authoritative** and is **not** a source of truth yet: per the
documentation hierarchy in `AGENTS.md` / `CLAUDE.md`, `docs/canonical/` is the
authoritative truth and `docs/working/` (this file) is supporting notes only.
When this draft and a canonical doc disagree, **canonical wins**. The system and
AI should treat these rules as the source of truth for pricing **only after** the
charter graduates to `docs/canonical/` — not before. Per the Production
Intelligence model, **pricing is a projection of the work, not the organizing
system**; this charter (once canonical) would govern that final projection. See
[`PRODUCTION_INTELLIGENCE.md`](../canonical/PRODUCTION_INTELLIGENCE.md).

## Rule 0 — Pricing is an output, not an input

Dovetails already prices by choosing a fair total and backing labor into it
(evidence: Tufts invoice, labor = total − materials). The charter keeps this
instinct but constrains it with a rate floor so it can never silently drift below
cost. Order of computation:

```
work understanding → labor (hours × rate) → + materials → + handling
→ + risk/coordination → round to a clean total (never below the rate floor)
```

## Rule 1 — One blended billable rate (resolve the rate conflict)

Today four different labor rates coexist: Codebook $85/hr, market audit $115/hr,
paint calculator $40/hr (broken), real-work-implied ~$110–130/hr. **This is the
single most important thing to fix.**

- Adopt **one** internal blended billable rate as the labor floor.
- Evidence supports **~$95–110/hr all-in**; the exact number is a business
  decision for the owner (Sources of Truth: the Owner decides).
- The broken paint calculator's $40/hr is **retired** — it underprices ~4×.
- Rate is reviewed against measured actuals once Historical Production exists
  (do not keep guessing the rate; measure it).

## Rule 2 — Materials handling is a real, automatic line

The 15% handling fee in the Codebook is currently almost never charged (e.g.
$295 flat on a $16k job). The charter makes it automatic:

- Apply **15% handling on billable materials**, or a flat per-job minimum,
  whichever is greater.
- Customer-facing presentation may bundle it; internal logic must always apply
  it.
- Client-supplied materials are excluded from both the charge and the handling.

## Rule 3 — Floors and minimums are hard

- **Minimum service visit:** non-negotiable. (Codebook $150; market audit argues
  $185 — owner to set one number.)
- No line item priced below the blended rate × its typical hours.
- Round **up** to clean totals, never down through the floor.

## Rule 4 — Repeat work is a priced Work Item, not a re-quote

The stable menu items (faucet $150/$100/$85, fan $150+$75, light, door, deck
board, room-paint-per-sq-ft) are already consistent across years. They become
**Work Items** (PI-002) carrying: typical hours, typical materials, price, and
required trades. Estimating assembles these instead of re-deriving them.

## Rule 5 — Painting uses documented per-unit rates

Real painting prices cluster at ~**$2.25/sq ft** walls, **~$2.70** with trim,
**~$1.75** client-supplied paint (Enhanced Estimate). Adopt these as the
documented painting Work Item rates rather than the broken calculator. Keep the
internal sq-ft logic; keep customer-facing presentation simple (Codebook §9).

## Rule 6 — Every estimate carries confidence + assumptions

Surface what is unknown rather than burying it (ties to PI-006 Confidence
Engine). The Codebook §18 red-flag list (old house, hidden rot, access,
scope-creep, price-shopping) becomes an explicit assumptions/risk line on the
estimate. Risk adjusts price up; it does not get absorbed silently.

## Rule 7 — Capture actuals systematically (the missing loop)

Actual hours are captured **only anecdotally** today — a handful of historical
jobs note labor hours in free text (e.g. `db/seeds/dovetails_historical_backfill.sql`
records "24 hrs", "52 hrs", "60 hrs" in job notes, lifted from the Drive
documents). There is **no structured `labor_hours` field** and no systematic
capture wired to pricing. Require a single **actual-hours number at closeout** per
job, stored structurally. After ~20 jobs this calibrates Rule 1's rate and seeds
the first Production Profiles (PI-003 / PI-007). Until then, all rate numbers here
are **provisional estimates, explicitly flagged as such.**

## Open decisions for the owner

1. The one blended billable rate (≈$95–110/hr band).
2. The one minimum-visit number ($150 vs $185).
3. Handling: 15% vs flat-minimum-floor, and bundled vs shown.

These are owner business decisions (Sources of Truth), not AI defaults. The
charter records the evidence-backed ranges; the owner picks the numbers.

## Not in scope for this draft

- Historical-learning rate adjustment (PI-007) — needs actuals first.
- Building the Work Item Library (PI-002) — this charter only specifies the
  pricing rules those items must obey.
- Any code change. This is a rules document.
