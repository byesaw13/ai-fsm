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

### 2. Backfill (owner decision 5A)

- Each of the 327 receipt lines becomes a `receipt` observation keyed to its
  receipt line.
- Each catalog item gets one `catalog_summary` observation (last price and
  last purchase date), always Low confidence.
- The owner re-exports 24 months from Pro Xtra and imports it. Once real CSV
  rows exist for an item, its summary stops counting toward price and
  confidence and stays on record.
- The backfill is safe to run more than once.

### 3. Imports without duplicates (owner decisions 4A, D11-1, D11-2; eng review D2, D5)

- One import path (eng D2): Home Depot and Lowe's purchase CSVs go through the
  existing store purchase import (`apps/web/lib/expenses/import/`), which
  creates one expense per store trip with its store and transaction ID and
  its line items. The ledger reads expense line items from both CSV trips and
  photographed receipts. `/api/v1/materials/import` and `hd-import.ts` are
  removed, and the catalog's import button points to the store purchase
  import.
- Trip matching (eng D5): a CSV trip and a photographed receipt are linked
  automatically only when they share a transaction ID. Every other look-alike
  (same store and date with the same, tax-adjusted or near total, or more
  than one possible receipt) is a review candidate: both are kept, nothing is
  merged, and the import screen lists them as "Possible match, review". The
  owner can confirm several at once ("Confirm selected"), which is still an
  explicit confirmation. This changes `duplicate-match.ts`, which today
  auto-matches by store, date and amount.

- Importer extensions (eng D10-2): parse Store Number, and save every CSV
  row as an expense line item with its store and transaction ID, so the
  ledger has durable source lines.
- Keys (eng D10-1): CSV rows are keyed by transaction ID, SKU, quantity, net
  unit price and an occurrence number inside the transaction, so identical
  lines in one trip both count and re-importing the same transaction adds
  nothing. A row without a transaction ID cannot be told apart from a genuine
  repeat purchase, so it becomes a review candidate instead of a guaranteed
  count.
- Staging (eng D7): a CSV trip with a possible match is held in the import:
  not an expense, not in job cost, no price observations, until the owner
  confirms "same trip" (it attaches to the receipt's expense) or "different
  trip" (it becomes its own expense). Everything else imports normally.
- Receipt lines get new IDs every time a receipt is re-parsed
  (`apps/web/lib/expenses/line-items.ts`, delete and re-insert), so they are
  keyed by content: receipt, line text, SKU, quantity, price and position.
- Parse revisions (eng D10-8): each re-parse is a numbered revision of that
  receipt; the current revision's observations are active and earlier ones
  superseded; restoring an earlier revision makes it current again;
  concurrent re-parses of one receipt are serialized by a lock.
- Cross-source: a Paperless receipt and a Pro Xtra row are counted once only
  when they share a transaction or order number. Rows that merely look alike
  (same date, store, SKU, quantity and price, but no shared transaction
  identity) become review candidates for the owner; they are never merged
  automatically, because two distinct purchases can look identical. Until the
  owner confirms, both are kept and the pair is marked "possible duplicate".
- OCR accuracy (D11-8, eng D10-4): receipt extraction keeps return and
  discount lines as signed adjustments (today
  `normalizeParsedReceiptLineItems` turns quantity <= 0 into 1 and negative
  prices into 0, losing them). Net unit prices already include line
  discounts, so those are never subtracted again. Before a receipt counts as
  unreconciled, the check accounts for tax, receipt-level discounts, coupons
  and returns (line totals minus discounts and returns, plus tax, against the
  receipt total). A
  receipt whose mismatch remains unexplained after that has its observations
  capped at Low until the owner reconciles it.
- Good rows import; every skipped row is listed with its line number and
  reason (bad date, bad price, return, $0 line, duplicate). Returns and $0
  lines are never price observations.
- Limits: 5 MB, 20,000 rows. Each item's cache is recomputed once per import.
- The import report (rows read, imported, duplicates, rejected) is saved to
  the audit log.

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
| Medium | The same real evidence 91 to 365 days old, or matching product with a supplier or location mismatch (the mismatch reason is shown). |
| Low | Real evidence older than 365 days; an expired supplier quote (shown as expired); a catalog summary. |
| Unverified | An AI allowance; a price with no supporting evidence; evidence whose origin cannot be established. |

- A receipt date alone does not establish a match; product, package and
  supplier/location must match. An unknown location never counts as a match.
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
function in `production-takeoff/`. The rule (eng D9): sum area x coats per
paint group (exact product, tint, sheen, application) across rooms and
surfaces, divide by the product's coverage, apply the waste allowance once,
and round up once per group to whole packages. The estimate engine's
per-surface rounding without waste is retired; its tests move to the new
numbers and every changed result is listed in the PR. Coverage
comes from the chosen product, defaulting to 350 sq ft/gal labeled
"default". Prepare Quote stops pricing paint with the constant
`PAINT_CENTS_PER_GALLON` (`prepare-quote.ts:212`) and uses the chosen catalog
product and its ledger price; with no product chosen the line says "Choose a
paint product".

Five families, deterministic, in `packages/domain/src/production-takeoff/`,
reusing the paint coverage logic in `packages/domain/src/painting.ts`. Built
as a **paint pilot first** (D9): the ledger, imports, package sizes,
confidence and interior paint and primer end to end; the other four families
follow once the pilot shows product and package identity is manageable
(measured by how many items the owner had to link or size by hand per quote).

1. Interior paint and primer: walls (exists), ceilings, trim (linear feet),
   doors (count, sides), primer (coverage by substrate).
2. Drywall patching: compound and tape or mesh by patch count and size.
3. Caulk: tubes by linear feet and bead size.
4. Trim and baseboard: linear feet to stick lengths (8, 12, 16 ft) with waste.
5. Paint supplies: tape, plastic, roller covers by room count.

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
 | Living room walls, 2 coats           |   | Preview: trips, new, already imported,   |
 | 2.6 gal -> [Choose a paint product]  |   | returns skipped, rejected (line, reason) |
 |   or 3 x 1 gal  Behr Ultra Eggshell  |   | Possible match, review  [Confirm sel.]   |
 |   High: receipt, HD Londonderry, 12d |   | Import N trips                           |
 | Package size needed: [1 gal] [Save]  |   +------------------------------------------+
 +--------------------------------------+
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
| TASK-211 | One import path through the store purchase import: Store Number parsing, CSV rows saved as expense line items, transaction-scoped keys, staging of possible matches, transaction-ID-only trip matching with "Confirm selected", sale flag kept, reject report, receipt parse revisions and signed return/discount lines; retire `/materials/import` (4A, eng D2, D5, D7, D8, D10) | TASK-210 | 3 d / 3 h |
| TASK-212 | Package sizes and units, parser, inline "Package size needed" plus catalog filter (6A, eng D6) | TASK-210 | 1.5 d / 1.5 h |
| TASK-213 | Confidence with reasons, frozen at send; verified today; supplier quotes (7A) | TASK-210, TASK-194 | 2 d / 2 h |
| TASK-214 | Paint pilot: one `paintQuantity` function, Prepare Quote paint priced from the chosen product (eng D4), interior paint and primer formulas end to end, owner-chosen packages, grouping by exact product/tint/sheen/application, formula authority over generator quantities | TASK-212, TASK-213, TASK-190 | 3 d / 0.5 d |
| TASK-215 | Estimated vs explicitly linked actual hours, with "possibly related" time shown separately | TASK-191 | 1 d / 1 h |
| TASK-216 | Remaining formula families: drywall patching, caulk, trim/baseboard (sticks per run), paint supplies | TASK-214 pilot result | 4 d / 1 d |

Order: 210 first (everything reads the ledger), then 211 and 212 in parallel,
then 213, then the 214 paint pilot; 216 starts after the owner reviews the
pilot's identity cleanup effort; 215 is independent once TASK-191 ships.

## Acceptance criteria (parent)

1. Importing the same Pro Xtra export twice leaves every price, count,
   average and confidence unchanged, and the second report lists every row
   with a transaction ID as already imported. Rows without a transaction ID
   are listed as review candidates, never counted twice automatically.
1a. Two identical lines in one transaction both count.
1b. A CSV trip with a possible receipt match adds nothing to expenses, job
   cost or prices until the owner confirms same or different trip.
2. Re-parsing a receipt creates a new parse revision whose observations
   replace the previous revision's; no duplicates, even though line IDs
   change; restoring an earlier revision brings its observations back.
2a. A receipt and a Pro Xtra row with the same transaction number count
   once; look-alike rows without shared transaction identity are both kept
   and listed as review candidates, never merged automatically.
2b. A receipt that balances once tax, discounts and returns are applied is
   reconciled; only an unexplained mismatch caps its observations at Low.
2c. Editing a catalog price without an observed price and source is refused.
3. A sale purchase is never the default line price while a regular price
   exists in the window; it shows as "also bought on sale".
4. Every price on a materials line shows its label and reason, for example
   "High: receipt, Home Depot Londonderry, 12 days ago".
5. A catalog summary never shows above Low; an AI allowance never shows above
   Unverified; an unknown location never counts as a match.
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
10. Sent quotes keep their confidence labels and reasons when prices change
    later.
11. The job page compares estimated hours with explicitly linked
    person-hours only; unlinked time on visit days appears separately as
    "possibly related"; travel and material runs are named as not counted.
12. No new recurring service fee (paid feed or subscription) is added.

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
| Unit | Confidence rules (each row of the table, mismatches, unknown location, expired quote) | +14 |
| Unit | Dedupe keys (re-import, overlap, same-day identical purchases, returns, $0) | +8 |
| Unit | Package-size parser (gal, qt, oz, ft, sticks, unknown) | +10 |
| Unit | Paint pilot formulas (normal, zero, missing, waste once, product/tint/sheen/application grouping, round-up) | +12 |
| Unit | Remaining four families incl. trim sticks per run (TASK-216) | +16 |
| Unit | Receipt content fingerprint and supersede; cross-source match and ambiguity flag; unreconciled receipt capped at Low | +8 |
| Integration | Import twice, receipt re-parse, backfill run twice, cache recompute in the same transaction | +6 |
| Integration | Verified today refusal, quote expiry, frozen labels at send | +4 |
| E2E | Assessment, Prepare Quote, formula materials with labels, send | +1 |

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
| Receipt + CSV | Same purchase twice | Linked only by shared transaction ID; look-alike CSV trips staged out of expenses, job cost and prices until confirmed | Yes | "Possible match, review" |
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
- **VERDICT:** CEO + ENG CLEARED at plan level. Implementation still waits for the owner's approval of this document and the ROADMAP text, and for PR #720.

NO UNRESOLVED DECISIONS
