# Estimating assistant — Phase 3 slice (design for approval)

Status: proposed; owner has not yet read or approved this document. From `/plan-ceo-review` on 2026-10-26 (HOLD SCOPE, approach C,
with an outside-voice review by Codex; owner decisions D1 to D11 recorded below).
Nothing here is built until the owner approves this design and the roadmap
change below.

**Depends on PR #720** (hourly baseline, TASK-188 to TASK-208, not yet
merged): this design uses TASK-190 (materials cost separate from price),
TASK-191 (stored person-hours), TASK-194 (send checklist and freeze at send)
and the formula document `docs/working/hourly-baseline.md`. Task numbers here
start at TASK-209 because #720 reserves TASK-188 to TASK-208. This branch is
based on #720's branch and must merge after it.

## Goal

An assistant that does the research, develops the estimate and recommends a
defensible price, while the owner keeps final pricing approval. It explains
its assumptions and asks for missing details.

This slice delivers the part that can be trusted today: material quantities
from formulas, purchase sizes, waste, and every price shown with where it came
from, when, and how much to trust it. Market strategy, paid feeds and learning
from outcomes stay in Phase 4.

## What already exists (verified 2026-10-26)

| Need | Existing | State |
| --- | --- | --- |
| Scope from the assessment | Prepare Quote, review by work area, revise with a note (TASK-179 to TASK-187) | Working |
| Questions for missing details | Prepared scope questions and exclusions | Working |
| Materials list | Materials generator (saved prices first, rest labeled AI estimate), itemized materials per work area (TASK-187), 21 price-book material templates, 60 service-material links | Working |
| Quantity math | Wall paint: coverage, 10% waste, whole gallons (`packages/domain/src/painting.ts`); door hardware takeoff (TASK-103) | Two trades only |
| Historical costs | `materials_price_book`: 1,304 items from receipts and a Pro Xtra CSV import, 1,195 with SKU, 176 bought 3+ times, 193 bought in the last 90 days | Latest price and running average only; no history, no verification, no package size (1,296 items are "each") |
| Raw receipts | `expense_line_items`: 327 lines across 95 receipts, 288 with SKU | Kept in full |
| Pro Xtra import (catalog-only) | `POST /api/v1/materials/import` (`apps/web/lib/materials/hd-import.ts`) | Used for the August 2026 history; reads date, SKU, description, net unit price, department, quantity; no store, no transaction ID, no duplicate protection; rows not kept. **Retired by this design (eng review D2).** |
| Store purchase import (expenses) | `/api/v1/expenses/import/preview` and `/commit` (`apps/web/lib/expenses/import/homedepot.ts`, `lowes.ts`, `duplicate-match.ts`) | Reads Date, Transaction ID, Job Name, SKU, Description, Quantity, Net Unit Price (not Store Number, although the export has it); one expense per store trip; Lowe's supported; matches CSV trips to receipts; keeps a sale-price safeguard ("a discounted (sale) purchase never overwrites the established regular price"); writes expenses and catalog prices but **no expense line items**; preview shows new / already imported / returns skipped. Used once. **The single import path in this design, extended by TASK-211.** |
| Preferred supplier | `account_supplier_preferences`: Home Depot, Londonderry NH | Set |
| Actual hours | TASK-151: `activity_entries` type `job_work`, per worker, on the job, its visits and work orders, x each worker's cost rate | 14 of 18 invoiced jobs have hours; 7 have an approved estimate and hours; ~9% of job_work time is not linked to a job; travel time (90.8 h) and most material runs are never linked to a job; one worker so far |

## Supplier data (verified 2026-10-26)

| Source | Access | Coverage | Ongoing cost | Use |
| --- | --- | --- | --- | --- |
| Your receipts (Paperless sync) | Already flowing | What you bought, dated, by store | $0 | Phase 3 |
| Pro Xtra purchase history export | Account export; history covers 24 months (Home Depot receipt help page); CSV import already proven with your data. No official page documents the export format. | Every SKU bought with a Pro Xtra-linked card | $0 | Phase 3 |
| Written supplier quotes | Entered by owner | Exact item, quantity, location, expiry | $0 | Phase 3 |
| Manual price checks | Entered by owner with observed price and source | Any item | $0 | Phase 3 |
| Third-party Home Depot data (e.g. SerpApi) | Unofficial; no Home Depot public price API. SerpApi plans $0 / 250, $25 / 1,000, $75 / 5,000 searches a month (pricing page); Home Depot engine inclusion not stated; `store_id` and `delivery_zip` are filters, store-specific prices not documented; Home Depot terms not reviewed | Online prices | $25 to $75+/month | Phase 4 candidate |
| Regional cost databases (1build, Xactware, Clear Estimates) | Sales contact | County or ZIP benchmarks | Not published | Phase 4 candidate |
| BLS wages, Manchester-Nashua metro | Public | Labor cost benchmark, not selling prices | $0 | Phase 4 market evidence |

Research area for later market evidence (provisional): Southern NH corridor
(Derry, Salem, Nashua, Londonderry) and Andover / Haverhill, MA. The MA rate
adjustment stays 0% unless the owner approves a supported change.

## Design

```
 receipts (Paperless) -----+                         +--> catalog cache (price, avg, last paid, confidence + reason)
 Pro Xtra CSV import ------+                         |        read by generator, templates, buy list (unchanged readers)
 supplier quote -----------+--> price_observations --+
 verified today -----------+    append-only,         +--> quantity formulas --> purchase-size picker --> materials line
 AI allowance -------------+    dedupe key           |                                                   (cost, price, evidence ref)
 [Phase 4 kinds reserved: supplier_feed, market]     +--> evidence label with reason, frozen at send         |
                                                                                                    TASK-188 baseline
```

### 1. Price observation ledger (owner decision 3A: the ledger is the truth)

- New table `price_observations`, append-only. Columns: material id, kind,
  observed date, unit price, package quantity and unit, quantity bought,
  supplier (normalized) and location (branch, town or ZIP; null when unknown),
  source reference, dedupe key (unique per account), entered by, note,
  `expires_on` (supplier quotes), `voided_at`. Never updated in place except
  voiding.
- Kinds writable in Phase 3: `receipt`, `supplier_csv`, `supplier_quote`,
  `manual_check`, `catalog_summary`, `ai_allowance`. Reserved, not writable:
  `supplier_feed`, `market`.
- The catalog row (`materials_price_book`) keeps its columns as a cache:
  latest price, average and last paid are recomputed from the ledger by one
  function, in the same transaction as every new observation, under a per-item
  lock so concurrent imports cannot leave the cache stale. Existing readers
  keep working.
- Every writer goes through the ledger (D11-5). Today the catalog edit endpoint
  (`apps/web/app/api/v1/materials/[id]/route.ts`) writes price and purchase
  date directly; it becomes a `manual_check` observation and, like "verified
  today", needs the observed price and its source.
- Product identity (D11-3, eng D3): the catalog row is the product variant,
  unique per account, store family (home_depot, lowes, other) and SKU; a
  store SKU already pins one exact package. Today's SKU match ignores the
  store (`catalog.ts`, `lower(btrim(sku)) = lower(btrim($2))`), which changes.
  Rows without a SKU earn High only through an owner-confirmed link, never by
  name. The same item at two stores is two rows the owner can mark "same
  product". The generator's word-overlap match (`materials-generator.ts:201`)
  can suggest a link but never earns High.
- Supplier names are normalized ("The Home Depot" and "Home Depot" are one).
- Row-level security like every account table; owner/admin write, everyone in
  the account reads.

### 2. Backfill (owner decision 5A, corrected 2026-10-26)

- Each of the 327 receipt lines becomes a `receipt` observation keyed to its
  receipt and parse revision.
- Each catalog item gets one `catalog_summary` observation (its last price
  and last purchase date), always Low confidence.
- Summaries are never counted as purchases: they are excluded from purchase
  counts and averages at all times.
- A summary is superseded for an item only by a `receipt`, `supplier_csv` or
  `manual_check` observation of the same variant (same store family and SKU)
  dated on or after the summary's last purchase date. An older real
  observation does not displace a more recent summary; both stay, and price
  selection compares them by date and applicability (section 5).
- The owner's 24-month Pro Xtra re-export restores row-level history after
  deploy. It is an input, not a blocker: implementation and tests use fixture
  CSVs.
- The backfill is safe to run more than once.

### 3. Imports without duplicates (owner decisions 4A, D11-1, D11-2; eng E2, E5, E7, E8, E10; corrected 2026-10-26)

**One import path, two modes (eng E2).** Home Depot and Lowe's purchase CSVs
go through the existing store purchase import (`apps/web/lib/expenses/import/`).
`/api/v1/materials/import` and `hd-import.ts` are removed; the catalog's
import button points here. The owner picks a mode for each file:

- **Price history only.** Adds `supplier_csv` price observations and books
  nothing: no expenses, no job links, no effect on job cost or expense
  totals. It still applies the same duplicate safeguards as book mode (see
  "Review records" below), because duplicate price evidence would distort
  averages, purchase counts and confidence. This is the mode for the
  24-month history re-export.
- **Book purchases.** Creates one expense per store trip with its line items,
  as today, plus price observations. Used for recent purchases not yet
  booked.

Both modes write the same observation keys, so a transaction imported first
as history and later as a booked purchase never doubles the price evidence.

**Importer extensions (eng E10).** Parse Store Number. Book mode saves every
CSV row as an expense line item with its store and transaction ID; history
mode stores each row as the observation's source reference (file fingerprint,
row number, store, transaction ID).

**Keys (eng E10).** A transaction's identity is supplier family + store
number + transaction ID. Rows are keyed by that identity, SKU, quantity, net
unit price and an occurrence number inside the transaction, so identical
lines in one trip both count and re-importing the same transaction adds
nothing. A row without a transaction ID cannot be told apart from a genuine
repeat purchase, so it is a review candidate, not a guaranteed count.

**Trip matching (eng E5, corrected).** A CSV trip and a photographed receipt
are linked automatically only when they have the same supplier family, the
same store (when both are known), the same date and the same transaction ID.
A shared transaction number with a different supplier, store, date or total
is a "conflicting transaction ID" review candidate, never a link. Every other
look-alike (same store and date with the same, tax-adjusted or near total, or
more than one possible receipt) is a review candidate. Nothing is merged
until the owner confirms; "Confirm selected" confirms several at once and is
still an explicit confirmation. This changes `duplicate-match.ts`, which
today auto-matches by store, date and amount.

**Staging and recovery (eng E7, corrected).** In book mode, a trip with a
possible match is held as a pending import record:

- Pending records are stored in the database and survive reloads, deploys
  and closing the screen.
- They are not expenses, not in job cost, and produce no price observations.
- The import screen and the expenses page show the pending count and total
  value ("4 trips pending review, $612.40").
- Re-importing a file whose trips are already pending updates nothing and
  creates no second pending record (same transaction key).
- Confirming "same trip" (attach to the receipt's expense) or "different
  trip" (book as its own expense) runs in one database transaction: expense
  and line items, job link, price observations, and marking the record
  resolved all succeed together or none do. A failed confirmation leaves the
  pending record exactly as it was.

**Review records in history mode (corrected 2026-10-26).** History mode books
nothing, but a row that is a possible duplicate (a look-alike of an existing
observation or receipt without matching transaction identity) or has a
conflicting transaction identity becomes a persistent review record, exactly
as in book mode. Its observations are held out of active price evidence (not
used for price, averages, purchase counts or confidence) until resolved.
Confirming "same purchase" keeps the existing evidence and records the row as
a duplicate; confirming "different purchase" makes its observations active.
It never becomes an expense. Pending count and value cover both modes.

**Dismiss with reason (both modes).** The owner can dismiss a pending record
with a reason ("personal purchase", "not a business purchase", "test
import"). A dismissed record is kept, never deleted; it is excluded from
active costs and from price evidence, so a personal purchase never teaches
business material prices; and it can be reopened, which returns it to
pending with its history intact. Dismissing and reopening are logged with
who and when.

**Receipts.** Receipt lines get new IDs every time a receipt is re-parsed
(`apps/web/lib/expenses/line-items.ts`, delete and re-insert), so they are
keyed by content: receipt, parse revision, line text, SKU, quantity, price
and position. Each re-parse is a numbered revision (eng E10); the current
revision's observations are active and earlier ones superseded; restoring an
earlier revision makes it current again; concurrent re-parses of one receipt
are serialized by a lock.

**Receipt reconciliation (D11-8, eng E10).** Extraction keeps return and
discount lines as signed adjustments (today `normalizeParsedReceiptLineItems`
turns quantity <= 0 into 1 and negative prices into 0, losing them). Net unit
prices already include line discounts, so those are never subtracted again.
Before a receipt counts as unreconciled, the check accounts for tax,
receipt-level discounts, coupons and returns (line totals minus discounts and
returns, plus tax, against the receipt total). A receipt whose mismatch
remains unexplained has its observations capped at Low until the owner
reconciles it.

**Sale purchases (eng E8).** Discounted rows (the CSV discount flag or a
receipt markdown) are recorded and marked "sale" (section 5).

**Reporting.** Good rows import; every skipped row is listed with its line
number and reason (bad date, bad price, return, $0 line, duplicate,
conflicting transaction ID). Returns and $0 lines are never price
observations. Limits: 5 MB, 20,000 rows; each item's cache is recomputed once
per import. The import report (mode, rows read, imported, already imported,
pending, rejected) is saved to the audit log.

### 4. Package sizes and units (owner decision 6A)

- Materials get a package quantity and unit (for example 1 gal, 5 gal, 10.1 oz,
  50 ft, 8 ft stick) and a base unit.
- A parser reads sizes from product descriptions. A clear size ("5 Gal.")
  is applied and labeled "from product description"; anything uncertain is
  only a suggestion until the owner saves it; anything unreadable stays empty.
- Where to fix it (eng D6): inline on the quote line ("Package size needed:
  [1 gal] Save for this product", suggestion pre-filled, not applied until
  saved), saved once to the catalog item for all future quotes; plus a
  "Missing package size" filter on the materials catalog page for bulk
  cleanup.
- "Package size needed" applies only when a size is required to convert a
  measured quantity into packages or cost (for example 2.6 gal of paint into
  cans). Then the line shows the raw quantity, counts as a missing item in the
  send checklist, and the owner sets the size once on the catalog item.
- Items that are genuinely sold and used as "each" (a hinge, a tube of caulk
  entered by count, a light fixture) need no package size. A line whose cost
  the owner entered directly and verified (with its source) is valid without
  conversion. Neither blocks Send.

### 5. Price selection, and confidence with reasons (owner decisions 7A, D11-4)

Price selection is separate from the label. A line's price is the newest
applicable regular-price observation for its product, package, supplier and
location; a valid written quote for that quantity wins. Sale prices (eng D8):
discounted purchases (the CSV discount flag or a receipt markdown) are
recorded and marked "sale", but are not chosen while a regular-price
observation exists within the confidence window; the evidence shows "also
bought on sale for $X on <date>" and the owner can pick it deliberately. When
only sale purchases exist, the price is labeled "only bought on sale" and is
at most Medium. Confidence is computed for each line at
today's date, not stored once per catalog item, so a quote expiring or a price
aging changes the label without any new import.

Starting defaults, editable in Settings:

| Label | Rule |
| --- | --- |
| High | Receipt, CSV row or verified-today check within 90 days, for the matching product and package, at the line's supplier and a known matching location. A written supplier quote for the exact item, quantity and location while it is valid (its stated expiry, or the quote-validity default when none is stated). |
| Medium | The same real evidence 91 to 365 days old. |
| Low | Real evidence older than 365 days; an expired supplier quote (shown as expired); a catalog summary. |
| Unverified | An AI allowance; a price with no supporting evidence; evidence whose origin cannot be established. |

- Mismatches only lower confidence (corrected 2026-10-26). The label is
  first set from the evidence type and age (table above); a supplier or
  location mismatch then lowers it one level (High to Medium, Medium to Low)
  and shows the reason. It never raises a label: Low stays Low and Unverified
  stays Unverified, whatever the mismatch.
- A receipt date alone does not establish a match; product, package and
  supplier/location must match. An unknown location never counts as a match.
- Catalog summaries in price selection: a summary is used for the price only
  when no real observation of the same variant is at least as recent; it is
  always Low and never counts toward purchase counts or averages.
- The label always shows its reason, for example "Medium: purchased 140 days
  ago" or "Medium: bought at Lowe's, quote uses Home Depot".
- The assessment is frozen with the sent quote.
- Low confidence prompts review; it does not block sending. Missing
  quantities, unusable units and unconfirmed costs remain separate send
  requirements (TASK-194).

### 6. Verified today and supplier quotes

- "Verified today" requires entering the observed price and its source (store
  shelf at a named location, a named website page, or a phone or written
  quote). It creates a `manual_check` observation. It never refreshes the date
  of an older observation.
- A supplier quote records item, quantity, location, price, quote date and
  expiry (or the default), and the document reference when there is one.

### 7. Quantity formulas, purchase sizes, waste (owner decisions 8A, D9, D10, D11-6; eng D4)

One paint-quantity function (eng D4, D9): paint gallons are computed today in
three places with different rules (`painting.ts:274` `wallPaintGallons`,
`painting.ts:298` inside `computeRoomPainting`, and the estimate engine's
`computePaintMaterials`). The pilot replaces them with one `paintQuantity`
function in `production-takeoff/`. The rule (eng E9, corrected): for each
paint group (exact product, tint, sheen, application), add up each surface's
area x coats / that surface's coverage, apply the waste allowance once, and
round up once per group to whole packages. Coverage is per surface where it
differs (for example textured or bare-drywall surfaces), taken from the
product and the surface, not one number for the whole group. The estimate engine's
per-surface rounding without waste is retired; its tests move to the new
numbers and every changed result is listed in the PR.

- Finish-paint coverage comes from the chosen product, defaulting to 350 sq
  ft/gal labeled "default".
- Primer never uses the wall-paint default. Its coverage comes from the
  chosen primer product, or the primer default (250 sq ft/gal, labeled
  "default") for the substrate; with neither, the line asks for it.
- Waste: the owner can set an explicit 0% waste. A blank waste field means
  "use the default" and says so; 0% is a real value, never treated as
  blank. Prepare Quote stops pricing paint with the constant
`PAINT_CENTS_PER_GALLON` (`prepare-quote.ts:212`) and uses the chosen catalog
product and its ledger price; with no product chosen the line says "Choose a
paint product".

Five families, deterministic, in `packages/domain/src/production-takeoff/`,
reusing the paint coverage logic in `packages/domain/src/painting.ts`. Built
as a **paint pilot first** (D9): the ledger, imports, package sizes,
confidence and interior paint and primer end to end; the other four families
follow once the pilot meets the success criteria below.

**Pilot success criteria (provisional usability targets, owner-confirmed
2026-10-26).** Every manual action on a pilot quote is logged with the quote:
formula quantity override (with its kind, below), product link, confirmation
of a suggested mapping, package-size save, coverage edit. The pilot runs on
at least 5 quotes for varied real jobs; if those do not exercise the
important cases (walls and ceilings, trim and doors, primer, more than one
paint group, a missing package size, a sale-only price), the pilot is
extended until they do.

- Correctness gate: zero wrong packages or quantities, counting errors caught
  before sending as well as after. Any wrong result fails the pilot until the
  cause is fixed.
- Quantity overrides: each override is recorded as either "correcting the
  calculation" or "my preference" (for example a deliberate extra gallon).
  Any repeated correction of the same calculation is a formula defect that
  must be fixed, whatever the average. Deliberate preferences: at most 2 per
  quote on average.
- Mapping reuse: on quotes 3 onward, at least 70% of paint lines whose
  compatible product and package mapping already existed resolve to it with
  no new link or size. Lines for products seen for the first time are not
  counted as reuse failures.
- Effort: by the last pilot quote, at most 3 link, mapping-confirmation or
  package-size actions per quote (confirming a suggested mapping counts as an
  action), and the owner reports resolution took no more than 10 minutes on
  that quote.

If any criterion is not met, TASK-216 waits and the cause (identity, package
data or formula) is fixed first.

**Pilot (TASK-214):**

1. Interior paint and primer: walls (exists), ceilings, trim (linear feet),
   doors (count and sides), primer (coverage by substrate and primer
   product).

**Follow-up families (TASK-216), after the pilot criteria are met:**

2. Drywall patching, by patch: each patch has a size class (up to 4 in, 4 to
   12 in, over 12 in), a count, and whether texture matching is needed.
   Compound by patch area and coats per size class; mesh patches or tape by
   count and perimeter; patches over 12 in need backing and new board (sheets
   by area, rounded up); texture matching is a question for the owner, never
   assumed. Defaults labeled until checked against jobs.
3. Caulk: tubes by linear feet and bead size.
4. Trim and baseboard: sticks per run at the chosen stick length (8, 12, 16
   ft), with waste.
5. Paint supplies, by measured drivers, not room count: masking tape by
   linear feet of edges to mask, plastic or drop cloth by square feet to
   cover, roller covers and trays per paint group (and per area per cover
   where stated). Missing drivers become questions.

- Each formula shows its inputs, the waste allowance and the result.
- Waste percentages are editable defaults, labeled "default, not yet checked
  against your jobs" until the owner changes them.
- Purchase sizes (D10): the owner picks the package, with a remembered
  default per product; the quantity rounds up to whole packages and shows the
  leftover. Paint is combined across rooms only when the exact product, color or tint
  formula, sheen, and application requirements (for example the same primer
  or substrate need and the same interior/exterior rating) all match;
  anything else is bought separately.
  Trim counts sticks per run (two 9 ft runs need two sticks), not total length.
  An automatic cheapest-combination picker is a later step.
- Formula authority (D11-6): for formula-covered items, the formula's quantity
  replaces the materials generator's quantity on those lines and the
  generator's waste is not applied again. Items no formula covers stay
  labeled allowances.
- Recalculation (eng D10-5): formula lines store their inputs (measurement
  references, coats, coverage, waste, product, group). Changing a measurement
  recalculates the line and clears the cost confirmation and cost-floor
  acknowledgment (TASK-194). An owner override of a formula quantity is kept,
  labeled "owner override", and never recalculated silently.
- Fasteners and flooring stay itemized allowances in this slice.
- A missing measurement makes the formula ask for it, never assume it.

### 8. Estimated vs actual hours (D11-9)

- When TASK-191 stores estimated hours, the job page compares them with the
  person-hours explicitly linked to the job in TASK-151 (`job_work` on the
  job, its visits and work orders).
- Unlinked `job_work` time on the job's visit days is shown separately as
  "possibly related", not counted and not used as a completeness verdict.
- The comparison always lists which categories are included (job_work linked
  to the job, its visits and work orders) and which are excluded (travel,
  material runs, unlinked time), with the excluded hours shown. Unlinked time
  is never attributed to a job automatically. A job with no linked time says
  so.
- Matching scope (corrected 2026-10-26): estimated and actual hours are
  compared only for the same categories. Estimated work hours are compared
  with linked `job_work` hours. Estimated travel hours are shown, but their
  actual is "not available" while travel is not linked to jobs, and they are
  left out of the difference. The headline difference never mixes scopes and
  is labeled as work hours only; a difference whose scopes do not match is
  never presented as production performance.
- This is a comparison only; learning from it (PI-007) stays in Phase 4.

## Missing-data messages (eng screen review)

Every missing-data message in the send checklist and on formula lines:

- Says what is missing, why it matters and where to fix it, with a link to the
  field: "Kitchen: ceiling size missing, needed for ceiling paint. [Enter
  size] [No ceiling work]".
- Offers an honest exit where one is valid ("No ceiling work", "$0
  confirmed", "Each item, no package"), so nothing pushes the owner to enter a
  made-up value.
- Looks different when it blocks Send (missing quantity, unusable unit,
  unconfirmed cost) from when it only asks for review (Low confidence).
- Formula questions name the room and the measurement, never a field name.

## Screens

```
 Quote line (paint)                         Import (expenses > Import purchases)
 +--------------------------------------+   +------------------------------------------+
 | Living room walls, 2 coats           |   | Mode: (o) Price history only             |
 | 2.6 gal -> [Choose a paint product]  |   |       ( ) Book purchases                 |
 |   or 3 x 1 gal  Behr Ultra Eggshell  |   | Preview: rows, new, already imported,    |
 |   High: receipt, HD Londonderry, 12d |   | returns skipped, rejected (line, reason) |
 | Package size needed: [1 gal] [Save]  |   | Pending review: 4 trips, $612.40         |
 +--------------------------------------+   |  [Same trip] [Different trip] [Dismiss]  |
                                            |  [Confirm selected]                      |
                                            +------------------------------------------+
 Send checklist: blocking items first, each with [fix] link; review notes after.
```

## Ongoing cost

- No new recurring service fees: Phase 3 adds no paid data feed or
  subscription. It uses receipts, the Pro Xtra export, supplier quotes and
  manual checks. This is not a promise of zero operating cost: existing
  hosting, existing AI calls, and the owner's time to export, verify and link
  items still apply.
- AI cost: unchanged. Formulas, the parser and confidence are deterministic;
  the materials generator is called as it is today.
- Phase 4 options, for a later decision: a third-party Home Depot data
  service at roughly $25 to $75+/month (plan prices verified; Home Depot
  coverage, store-level prices and terms not verified).

## Proposed roadmap change (for owner approval)

In `docs/canonical/ROADMAP.md`, Phase 3, add:

> **Phase 3 slice — estimating assistant (approved YYYY-MM-DD).** Price
> observation ledger with source, date, supplier/location and evidence-based
> confidence; duplicate-safe receipt and Pro Xtra imports; package sizes;
> estimated vs actual hours. Quantity formulas start with an interior paint
> and primer pilot (TASK-214); drywall patching, caulk, trim/baseboard and
> paint supplies (TASK-216) follow after the owner reviews the pilot. Depends
> on the hourly baseline (TASK-188 to TASK-195). See `docs/working/estimating-assistant-phase3.md`. No paid
> feeds, no automated market recommendations, no win/loss learning.

In Phase 4, add to the list:

> - Estimating assistant, later: supplier feeds, local market evidence
>   (`market` observations with source, date, geography, confidence), price
>   recommendations with explanation, win/loss and actual-hours learning
>   (PI-007), travel and material-run attribution to jobs.

No change to "AI-first product repositioning" being out of scope: the
assistant assists, and the owner approves every price.

## Tasks (proposed IDs)

| Task | What | Depends on | Effort (human / CC) |
| --- | --- | --- | --- |
| TASK-209 | Parent: estimating assistant, Phase 3 slice | approval | n/a |
| TASK-210 | Price observation ledger, catalog cache recompute, supplier normalization, backfill (5A) | TASK-190 | 2 d / 2 h |
| TASK-211 | One import path through the store purchase import with two modes (price history only; book purchases); Store Number parsing; transaction identity = supplier family + store + transaction ID; CSV rows saved as expense line items (book) or source references (history); persistent pending records with count and value, safe re-import and atomic confirmation; "Confirm selected"; sale flag kept; reject report; receipt parse revisions and signed return/discount lines; retire `/materials/import` (4A, eng E2, E5, E7, E8, E10) | TASK-210 | 4 d / 4 h |
| TASK-212 | Package sizes and units, parser, inline "Package size needed" plus catalog filter (6A, eng D6) | TASK-210 | 1.5 d / 1.5 h |
| TASK-213 | Confidence with reasons, frozen at send; verified today; supplier quotes (7A) | TASK-210, TASK-194 | 2 d / 2 h |
| TASK-214 | Paint pilot: one `paintQuantity` function with per-surface coverage, primer coverage never from the wall-paint default, explicit 0% waste; Prepare Quote paint priced from the chosen product (eng E4); interior paint and primer end to end; owner-chosen packages; grouping by exact product/tint/sheen/application; formula authority over generator quantities; logging of manual actions for the pilot success criteria | TASK-212, TASK-213, TASK-190 | 3.5 d / 0.5 d |
| TASK-215 | Estimated vs explicitly linked actual hours for matching categories only, with "possibly related" time and excluded categories shown separately | TASK-191 | 1 d / 1 h |
| TASK-216 | Remaining formula families: drywall patching by patch size class, caulk, trim/baseboard (sticks per run), paint supplies by measured drivers | TASK-214 pilot criteria met | 4 d / 1 d |

Order: 210 first (everything reads the ledger), then 211 and 212 in parallel,
then 213, then the 214 paint pilot; 216 starts only after the pilot success
criteria (section 7) are met; 215 is independent once TASK-191 ships. None of
these waits on the owner's Pro Xtra re-export: implementation and tests use
fixture CSVs, and the real export is imported in price-history mode after
deploy to restore history.

## Acceptance criteria (parent)

1. Importing the same Pro Xtra export twice leaves every observation, price,
   count and average unchanged, and confidence unchanged when evaluated at
   the same evaluation date (confidence may age with time; tests fix the
   clock). The second report lists every row with a transaction ID as already
   imported. Rows without a transaction ID are listed as review candidates,
   never counted twice automatically.
1a. Two identical lines in one transaction both count.
1b. Price-history mode creates price observations and no expenses or job
   links; job cost and expense totals are unchanged. Possible duplicates and
   conflicting identities in history mode become persistent review records
   whose observations stay out of active price evidence (prices, averages,
   purchase counts, confidence) until resolved.
1f. A dismissed record (either mode) is kept, excluded from active costs and
   price evidence, and can be reopened back to pending; dismiss and reopen are
   logged.
1c. A transaction imported in history mode and later in book mode gains
   expenses but no duplicate price observations.
1d. In book mode, a CSV trip with a possible receipt match is a persistent
   pending record that adds nothing to expenses, job cost or prices until
   confirmed; the pending count and value are shown; re-importing the file
   creates no second pending record; a confirmation that fails partway
   leaves the pending record unchanged and nothing booked.
1e. Two records with the same transaction number but a different supplier,
   store, date or total are never linked; they are listed as "conflicting
   transaction ID".
2. Re-parsing a receipt creates a new parse revision whose observations
   replace the previous revision's; no duplicates, even though line IDs
   change; restoring an earlier revision brings its observations back.
2a. A receipt and a Pro Xtra row with the same supplier family, store, date
   and transaction ID count once; look-alike rows without shared transaction identity are both kept
   and listed as review candidates, never merged automatically.
2b. A receipt that balances once tax, discounts and returns are applied is
   reconciled; only an unexplained mismatch caps its observations at Low.
2c. Editing a catalog price without an observed price and source is refused.
3. A sale purchase is never the default line price while a regular price
   exists in the window; it shows as "also bought on sale".
4. Every price on a materials line shows its label and reason, for example
   "High: receipt, Home Depot Londonderry, 12 days ago".
5. A catalog summary never shows above Low and is never counted as a
   purchase; an AI allowance never shows above Unverified; an unknown
   location never counts as a match.
5a. A supplier or location mismatch lowers High to Medium and Medium to Low,
   and never raises a label: 400-day-old evidence with a mismatch stays Low;
   an AI allowance with a mismatch stays Unverified.
5b. A CSV row dated before an item's catalog summary does not displace the
   summary; one dated on or after it does.
6. "Verified today" without an observed price and source is refused.
7. A supplier quote past its expiry shows "Low: quote expired" and stays in
   history.
8. 2.6 gal of wall paint with the owner's default 1-gal can gives 3 cans and
   0.4 gal leftover; two rooms with the same product, tint, sheen and
   application are combined before rounding; a different product, tint, sheen
   or application requirement is not; with no package size known it
   shows "Package size needed" and blocks Send. A genuine "each" item, or a
   line with a verified direct cost entry, never shows it.
9. Each formula family has unit tests for normal, zero and missing
   measurements; a missing measurement produces a question, not an assumed
   value. Trim test: two 9 ft runs with a chosen 10 ft stick need two sticks
   (not one 18 ft total).
9a. Formula-covered lines use the formula quantity, never the generator's,
   and waste is applied once.
9b. Two surfaces in one paint group with different coverages (350 and 250 sq
   ft/gal) are computed per surface before waste and rounding. Primer with no
   primer product and no primer default asks for coverage instead of using
   350. An explicit 0% waste gives no waste; a blank waste field uses the
   labeled default.
10. Sent quotes keep their confidence labels and reasons when prices change
    later.
11. The job page compares estimated work hours with explicitly linked
    `job_work` person-hours only; estimated travel hours are shown with
    actual "not available" and left out of the difference; unlinked time on
    visit days appears separately as "possibly related"; the difference is
    labeled as work hours only.
12. No new recurring service fee (paid feed or subscription) is added.
13. The pilot success criteria (section 7) are measured from logged manual
    actions (overrides tagged "correcting the calculation" or "my
    preference") over at least 5 varied real quotes, extended until the
    important cases are covered, and TASK-216 does not start until they are
    met, including the zero-wrong-results correctness gate.

## Test plan

Regression tests required (existing behavior changes):
- `apps/web/lib/expenses/__tests__/duplicate-match.unit.test.ts`: store + date
  + amount no longer auto-matches; it produces a review candidate; a shared
  transaction ID still links.
- Prepare Quote tests: paint priced from the chosen product and its ledger
  price; "Choose a paint product" when none is chosen; the constant
  `PAINT_CENTS_PER_GALLON` is no longer used for prepared quotes.
- `painting.ts` callers: wall painting keeps its current results; the
  estimate engine's results change to the grouped, waste-once rule, and each
  changed fixture is listed in the PR (eng D9).
- Store purchase import: the sale-price safeguard still holds through the
  ledger (eng D8); a returned item and a discounted line reconcile correctly
  (eng D10-4).

| Layer | What | Count |
| --- | --- | --- |
| Unit | Confidence rules (each row of the table, mismatch lowers only, never raises Low or Unverified, unknown location, expired quote, summary vs newer/older real evidence) at a fixed evaluation date | +18 |
| Unit | Dedupe keys (re-import, overlap, identical lines in one transaction, same transaction ID at another store, history then book mode, returns, $0) | +11 |
| Unit | Package-size parser (gal, qt, oz, ft, sticks, unknown) | +10 |
| Unit | Paint pilot formulas (normal, zero, missing, waste once, explicit 0% waste, per-surface coverage, primer coverage never wall default, product/tint/sheen/application grouping, round-up) | +16 |
| Unit | Remaining four families incl. trim sticks per run (TASK-216) | +16 |
| Unit | Receipt content fingerprint and supersede; cross-source match and ambiguity flag; unreconciled receipt capped at Low | +8 |
| Integration | Import twice (fixed clock), history-only mode books nothing but holds possible duplicates out of active evidence, dismiss excludes and reopen restores, pending records persist and re-import safely, atomic confirmation with a forced failure, receipt re-parse, backfill run twice, cache recompute in the same transaction | +10 |
| Integration | Verified today refusal, quote expiry, frozen labels at send | +4 |
| E2E | Assessment, Prepare Quote, formula materials with labels, send | +1 |

All import tests use fixture CSVs (Home Depot and Lowe's formats, including a
24-month synthetic file); none depend on the owner's real export.

## Not in scope (Phase 4 or later)

- Paid supplier feeds and scraping (terms unreviewed, coverage unverified).
- Local market evidence collection and price recommendations.
- Win/loss analysis (22 decided quotes is too few).
- Learning production rates from actual hours (PI-007).
- Linking travel and material-run time to jobs.
- Flooring, exterior and fastener formulas.
- Any change to the Massachusetts rate adjustment.

## Owner decisions in this review

| # | Decision |
| --- | --- |
| D1 | Approach C: Phase 3 practical features plus a lightweight evidence ledger; paid feeds, automated market recommendations and win/loss learning stay in Phase 4 |
| D2 | Hold scope |
| D3 | The ledger is the source of truth; the catalog is a recomputed cache |
| D4 | CSV imports take good rows and list every rejected row; re-import is safe |
| D5 | Backfill: receipts as full observations, catalog items as Low summaries, then a fresh 24-month Pro Xtra re-export |
| D6 | Unknown package size: ask, never guess; blocks Send |
| D7 | Confidence rules with the owner's refinements (section 5) |
| D8 | Five formula families; fasteners and flooring stay allowances |
| D9 | Paint pilot first, then the other four families |
| D10 | Owner-chosen packages with round-up; paint grouped only by exact product, tint, sheen and application; trim sticks per run; optimizer later |
| D11 | Outside-voice correctness fixes 1-6, 8, 9 accepted |

## Optional enhancements recorded for Phase 4 (no decision needed now)

- Automatic cheapest package combination (after package sizes and prices are
  clean).
- Photo-driven scope questions.
- Price-change alerts on frequently bought items.
- Supplier comparison when two stores have recent prices.
- Automatic matching of a quote's materials to the job's purchases after the
  job.

## Failure modes registry

| Codepath | Failure mode | Handled | Test | Owner sees |
| --- | --- | --- | --- | --- |
| Pro Xtra import | Missing header row | 400 | Yes | "Not a Home Depot purchase export" |
| Pro Xtra import | Bad row (date, price) | Row skipped, listed | Yes | Reject list with line and reason |
| Pro Xtra import | Same or overlapping export again | Dedupe key | Yes | Rows counted as duplicates |
| Pro Xtra import | Return or $0 line | Skipped, listed | Yes | Reason "return" or "$0" |
| Receipt re-parse | New line IDs | Content fingerprint, supersede | Yes | No change in counts |
| Receipt + CSV | Same purchase twice | Linked only by same supplier, store, date and transaction ID; look-alikes and conflicting IDs staged as persistent pending records out of expenses, job cost and prices until confirmed | Yes | "Possible match, review" / "Conflicting transaction ID" |
| History import | Owner imports 24 months | Price-history mode books nothing; possible duplicates held as review records out of active evidence | Yes | Observations; review records with count and value |
| Dismissed record | Personal purchase dismissed | Kept, excluded from costs and price evidence, reopenable | Yes | "Dismissed: personal purchase" with Reopen |
| Pending confirmation | Fails partway | One transaction; pending record unchanged | Yes | Error; pending still listed |
| Store purchase import | Sale purchase | Recorded as sale, not default price while a regular price exists | Yes | "Also bought on sale for $X" |
| Receipt parse | Re-parse or concurrent re-parse | Numbered revisions, lock per receipt | Yes | Nothing (current revision shown) |
| Formula line | Measurement changed | Recalculate, clear cost confirmation and acknowledgment | Yes | "Costs need confirming again" |
| Receipt OCR | Lines do not add up after tax, discounts and returns | Observations capped at Low | Yes | "Low: receipt not reconciled" |
| Catalog edit | Price without source | 422 | Yes | "Enter the observed price and source" |
| Cache recompute | Concurrent imports | Per-item lock, same transaction | Yes | Nothing (consistent) |
| Package size | Unknown and needed for conversion | No conversion, blocks Send ("each" items and verified direct costs exempt) | Yes | "Package size needed" |
| Formula | Missing measurement | Question, no assumption | Yes | The question |
| Supplier quote | Expired | Low, kept | Yes | "Low: quote expired" |
| Actual hours | Unlinked or uncounted time | Shown separately, named | Yes | "Possibly related" and "not counted" |

No critical gaps: every row is handled, tested and visible.

## Engineering review decisions (2026-10-26)

| # | Decision |
| --- | --- |
| E1 | Proceed with the CEO-reduced scope; simplify through reuse |
| E2 | One import path: the store purchase import; retire `/materials/import` and `hd-import.ts` |
| E3 | The catalog row is the product variant, unique per account, store family and SKU |
| E4 | One `paintQuantity` function; Prepare Quote prices paint from the chosen product |
| E5 | Only a shared transaction ID links a CSV trip to a receipt automatically; everything else is reviewed, with "Confirm selected" |
| E6 | "Package size needed" fixed inline on the quote line, plus a catalog filter |
| E7 | Possible-match CSV trips are staged out of expenses, job cost and prices until confirmed |
| E8 | Sale purchases are evidence, not the default price while a regular price exists |
| E9 | Paint rule: grouped by exact product, tint, sheen and application, waste once, round once |
| E10 | Outside-voice fixes accepted: transaction-scoped keys, importer extensions, signed returns and discounts, recalculation inputs, receipt parse revisions |

## Parallel work

| Step | Modules | Depends on |
| --- | --- | --- |
| TASK-210 ledger | db/migrations, lib/materials | #720 (TASK-190) |
| TASK-211 imports | lib/expenses, api/v1/expenses/import, lib/materials | TASK-210 |
| TASK-212 package sizes | lib/materials, app/materials, estimate line UI | TASK-210 |
| TASK-213 confidence | packages/domain, lib/materials | TASK-210, #720 (TASK-194) |
| TASK-214 paint pilot | packages/domain (painting, production-takeoff, engine), lib/estimates | TASK-212, TASK-213 |
| TASK-215 hours | app/jobs | #720 (TASK-191) |

Lanes: TASK-210 first. Then lane A: TASK-211 (lib/expenses) and lane B:
TASK-212 then TASK-213 (lib/materials) in parallel. Lanes A and B both touch
`lib/materials`; keep the catalog recompute function owned by TASK-210 so
they only call it. Then TASK-214. TASK-215 can run any time after #720's
TASK-191.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR (HOLD SCOPE) | 11 decisions, 0 critical gaps |
| Codex Review | outside voice | Independent 2nd opinion | 2 | issues_found, resolved | CEO pass: 10 findings (8 fixes, 2 owner decisions); eng pass: 8 findings (5 fixes, 3 owner decisions), all code claims verified |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 10 issues (architecture 2, code quality 1, screens 2, outside voice 5), 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | focused screen review done inside eng review; full design review optional |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | n/a |

- **CROSS-MODEL:** Codex's eng pass found that the chosen import path lacked Store Number parsing and expense line items, that receipt parsing drops returns, that paint math differs between the engine and Prepare Quote, and that a sale-price safeguard would be lost; all verified in code and folded in (E7 to E10).
- **CORRECTION PASS (owner, 2026-10-26):** price-history-only import mode with the same duplicate review records as book mode (held out of active evidence); dismiss with reason keeps, excludes and can reopen; pilot criteria refined (override kinds, reuse only where a mapping existed, mapping confirmations count, zero wrong results including pre-send, varied jobs); transaction identity includes supplier and store; persistent pending records with count/value, safe re-import and atomic confirmation; mismatches only lower confidence; summaries superseded only by same-or-newer real evidence and never counted as purchases; per-surface coverage, primer coverage never from wall default, explicit 0% waste; drywall and supplies formulas specified by measured drivers; hours compared only within matching scope; measurable pilot success criteria; re-import tests at a fixed evaluation date; fixtures instead of the real export.
- **VERDICT:** CEO + ENG CLEARED at plan level. Implementation still waits for the owner's approval of this document and the ROADMAP text, and for PR #720.

NO UNRESOLVED DECISIONS
