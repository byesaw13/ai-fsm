# Pricing Evidence Analysis — Actual Estimates & Invoices vs. Stated System

**Date:** 2026-06-25
**Author:** Analysis pass over Dovetails Google Drive source documents
**Type:** Evidence/audit (generated). Not product direction. Seeds PI-004 / PI-005.

## Purpose

Earlier pricing docs describe how Dovetails *intends* to price (the Pricing
Codebook v2.0) or benchmark the price book against the market
([`docs/working/PRICING_AUDIT_REPORT_2026.md`](../working/PRICING_AUDIT_REPORT_2026.md)).
This report does something different: it reads the **actual client estimates and
invoices** Dovetails has produced (2019–2026) and infers the **de facto pricing
method** — how jobs are really priced, versus how the system says they should be.

It exists as the historical evidence base for **EPIC-008 Production Intelligence**,
specifically PI-004 (Pricing Intelligence Charter) and PI-005 (Knowledge Base).

## Sources examined

Stated system (Google Drive, "Dovetails OS" knowledge):

- `Dovetails Pricing Codebook v2.0` (2026-05-04) — philosophy, 4-layer method,
  $85/hr internal reference, 15% materials handling, 30% deposit, $150 minimum,
  Core/Standard/Specialty tiers, 1000–9000 service-code families.
- `_DOVETAILS_OS_PRICING_REPOSITORY_SEED_20260531.csv` — ~25 service codes with
  price ranges.
- `_DOVETAILS_OS_BUSINESS_RULES_REPOSITORY_20260531.csv` — BR-001…BR-015.

Actual client documents:

| Doc | Date | Type |
|---|---|---|
| Dovetails_Enhanced_Estimate (option menu) | 2025-05 | Estimate |
| 21 Cranberry St, Pepperell (R1) | 2025-07 | Estimate ($16,370) |
| Melody La Quan — door replacement | 2025-09 | Invoice ($3,020) |
| Mary Taft — pre-sale readiness | 2026-01 | Invoice ($2,745) |
| Kim Tufts — shed repair | 2026-06 | Invoice ($1,150) |
| Laura Cassidy — paint calculator | 2025-03 | Internal tool (xlsx) |
| dovetails-woodworks-0000001 | 2019-10 | Legacy product invoice |

**Caveat:** small sample (~5 real client docs + 1 calculator + the price book),
and **no structured actual-hours or job-cost capture exists** — a few historical
jobs note labor hours only in free text (e.g. `db/seeds/dovetails_historical_backfill.sql`
records "24 hrs", "52 hrs", "60 hrs" in job notes from the Drive documents), but
nothing systematic and nothing wired to pricing. Margin statements below are
*inferred from document structure*, not measured. That measurement gap is the
central finding.

## Per-document assessment

| Document | What it reveals | Consistency w/ Codebook |
|---|---|---|
| **Enhanced Estimate** | Flat-rate menu. Deck $250 / porch $550 / shed $1,219 — round totals. Light/fan $150+$75, faucet $150/$100/$85 match price book exactly. Painting priced **per sq ft** (~$2.25 walls, $2.70 w/ trim, $1.75 client-supplied paint). | High on menu items; painting method not in price book |
| **21 Cranberry St** | $16,370 whole-house, priced per-room/per-item flat. Only a **$295 flat "handling fee"** on a $16k job. 30% deposit applied. | Deposit ✓; 15% materials handling **not applied** |
| **Melody door** | $3,019.32 → "rounded $3,020". Labor narrated as door/storm/"additional labor $800". | Round-number target; labor is narrative, not hours×rate |
| **Mary Taft** | Room-by-room flat ($45–$650). Realtor-split billing handled. Itemized lines sum ~$50 above stated subtotal. | Disciplined structure; **manual arithmetic error** |
| **Tufts shed** | Total exactly $1,150.00. Labor **$860.68** is a plug: $1,150 − materials $289.32. | Proves the real method (below) |
| **Paint calculator** | Engine: 75 sq ft/hr, **$40/hr labor**, $75/gal. Formulas **broken** (#NAME?/#VALUE!). Output ≈ $0.53/sq ft labor. | Contradicts Codebook ($85/hr) **and** real estimates (~$2.25/sq ft) |

## The de facto pricing model (what actually happens)

1. **Target-price-minus-materials.** A fair round total is chosen ($250, $550,
   $1,150, $3,020), then labor is back-filled after materials. The Tufts invoice
   is proof: labor of `$860.68` exists only because `$1,150 − $289.32`. **Labor
   is an output, not an input.**
2. **Flat-rate menu items are disciplined and stable.** Faucets, fans, lights,
   doors match the price book to the dollar across multiple years. This is
   effectively an informal Work Item Library already in use.
3. **Project work is gut-feel, per-room.** Painting/repairs are priced by eye.
   The realized rate (~$2.25/sq ft walls) is healthy and defensible, but
   undocumented and not reproducible by anyone else.

## The three problems costing money

1. **Three unreconciled labor rates.** Codebook **$85/hr**; market audit book
   **$115/hr**; calculator **$40/hr**; real painting work implies **~$110–130/hr
   effective**. The most-built tool (50+ paint-calculator iterations) is both
   broken and ~4× too low. The owner's gut is the accurate engine; the
   spreadsheet is not.
2. **15% materials handling is essentially never charged.** Real docs pass
   materials at cost (Tufts, Enhanced) or add a token flat fee ($295 on a $16k
   job). Margin is being left on the table on every materials-heavy job.
3. **No systematic estimate-vs-actual loop.** Hours are recorded only
   anecdotally (free-text notes on a few historical jobs), never structurally, so
   profitability per job is unknown and the rates can never reconcile to a
   measured truth. Every estimate starts from zero memory.

## What the evidence implies for pricing method

The corrective is **not** a better calculator — it is to formalize the method
already in use and add the missing measurement:

1. Keep target/round-number pricing, but compute labor from **one blended
   billable rate** used as a floor (evidence points to ~$95–110/hr all-in), then
   round up — never below the rate.
2. Promote the stable menu items into **priced Work Items with a typical-hours
   field** (faucet, fan, light, door, deck board, room-paint-per-sq-ft). These
   invoices are seed data for PI-002 (Work Item Library).
3. Enforce **materials handling as an automatic line** (15% or a flat minimum).
4. **Capture actual hours at closeout** on every job. After ~20 jobs the
   $40-vs-$85-vs-$130 question resolves with data — the first Production Profile.
5. Add a **confidence/assumptions line** (old house, hidden rot, access). The
   Codebook §18 "red-flag" list already enumerates these; they just never reach
   the estimate.

## Tie to Production Intelligence

This is real-world validation of the EPIC-008 direction
([`docs/canonical/PRODUCTION_INTELLIGENCE.md`](../canonical/PRODUCTION_INTELLIGENCE.md)):
Dovetails already prices by **modeling the work and targeting a fair total** —
pricing is downstream of work understanding, exactly as the model asserts. The
invoices are the historical evidence that the model is correct, and that the
broken calculator was the wrong path. The missing piece is measurement
(actual hours), which Production Profiles + Historical Production are designed to
supply.

A first-draft Pricing Intelligence Charter derived from this evidence lives at
[`docs/working/PRICING_INTELLIGENCE_CHARTER_DRAFT.md`](../working/PRICING_INTELLIGENCE_CHARTER_DRAFT.md)
(PI-004, not yet canonical).
