Deep research on SimplyWise, its alternatives, and a clean-room implementation plan for Dovetails Services LLC

Prepared for: Nick / Dovetails Services LLCDate: August 8, 2026Purpose: Determine how leading contractor-estimating systems appear to create estimates, identify the patterns worth reproducing, and translate them into a reliable, serviceable estimating and invoicing architecture for ai-fsm.

Executive conclusion

The most important finding is that the successful products are not relying on one magical AI model to decide what a job should cost. They separate the work into layers:

Capture and interpret the scope from text, voice, photos, plans, measurements, or LiDAR.

Normalize that scope into known tasks, quantities, rooms, conditions, assumptions, and missing questions.

Price the known tasks from a cost catalog, assembly library, supplier pricing, labor-production rates, location adjustments, and company rules.

Apply business policy for minimum charges, travel, overhead, material handling, markup or margin, tax, contingency, rounding, deposits, and payment terms.

Require human review before turning the draft into a customer commitment.

Carry the approved estimate forward into the work order, job-cost ledger, change orders, invoices, payments, and profitability reporting.

Compare estimated quantities and costs with actual results so the company's own rates improve over time.

That is the architecture AI-FSM should use. AI should identify and organize the work; a deterministic engine should calculate the money. A language model must not be allowed to invent the final price directly.

SimplyWise is valuable as a model for fast mobile capture and a simple contractor experience. Clear Estimates is the stronger model for structured assemblies and maintained cost data. Handoff demonstrates how AI can choose from company catalogs and supplier prices. JobTread and Jobber demonstrate the critical estimate-to-actual feedback loop. Autodesk Forma, Procore, and Simpro demonstrate mature takeoff, catalog, cost-control, and estimate-to-production patterns, but they are enterprise or multi-crew reference points—not direct models for a solo handyman business.

The best AI-FSM design is therefore a combination:

SimplyWise speed

Clear Estimates assemblies

Handoff catalog retrieval and supplier matching

JobTread/Jobber actual-cost learning

Simpro-style estimated-versus-actual control

Dovetails-specific pricing policies and historical jobs

1. What the G2 page does—and does not—tell us

The linked G2 page names Autodesk Forma, Procore, and Simpro as the leading SimplyWise alternatives. That is useful as a software-category signal, but it is not a clean apples-to-apples comparison. SimplyWise is a mobile-first, small-contractor estimate generator. Autodesk Forma and Procore are preconstruction/construction-management platforms; Simpro is a field-service and job-costing platform aimed at larger trade businesses. G2: SimplyWise alternatives

This matters because copying the G2 list literally would send AI-FSM toward enterprise takeoff and collaboration features before its core small-business estimating engine is dependable. The G2 products are still useful for studying mature financial architecture:

Product family

Best lesson for AI-FSM

Poor fit to copy directly

SimplyWise

Fast photo/text intake, clarifying questions, simple editing, markup, proposal and invoice flow

Its exact price sources and model are not publicly disclosed; generic outputs cannot become Dovetails' source of truth

Autodesk Forma

Connect measured quantities to a centralized cost library and direct/indirect costs

Heavy commercial preconstruction workflow

Procore

Takeoff quantities mapped to catalog parts and assemblies, then adjusted for labor, price, and margin

Enterprise permissions, bid boards, and collaboration overhead

Simpro

Separate estimated from actual cost; defined labor cost, overhead, markup, catalogs, and productivity reporting

Designed for larger service and trade operations

The products that are more directly relevant to Dovetails are Handoff, Clear Estimates, JobTread, Jobber, Joist, Contractor Foreman, Housecall Pro, and similar small-contractor tools. The detailed comparison below emphasizes those systems while still extracting the useful enterprise patterns.

2. What SimplyWise publicly reveals about its estimating process

2.1 Confirmed public workflow

SimplyWise publicly describes this flow:

The user enters a detailed project description and can attach photos.

Measurements improve accuracy.

The system drafts an estimate and may ask additional clarifying questions.

It creates a material-and-labor breakdown.

The user edits individual line items or edits the estimate with AI.

The user adjusts markup or other rates.

The estimate can be organized, branded, shared as a PDF, converted through the work cycle, and invoiced.

Its own usage guide says detailed descriptions and measurements produce a better estimate and that the app will likely ask clarifying questions before generation. SimplyWise usage guide The app listing adds photo-to-estimate, LiDAR room scanning, labor and material separation, built-in markup/overhead, upsell suggestions, PDF bids, work orders, and invoicing. Apple App Store listing SimplyWise also says its pricing is localized/real-time, although it does not publicly document the exact data vendors, refresh process, or calculation methods. SimplyWise pricing and feature description

The workflow supports several important behaviors:

Blueprints can be attached, but SimplyWise still tells users to provide detailed descriptions and measurements. SimplyWise blueprint guide

Existing estimates can be edited line by line or with AI. SimplyWise editing guide

An estimate can be saved as a reusable template for similar work. SimplyWise template guide

Customer visibility can be controlled: hide all line items, show names, show groups, or show names and totals. SimplyWise line-item visibility guide

Markup can be retained internally while hidden from the customer. SimplyWise markup guide

Payments and deposits can be manually recorded and payment links can be placed on invoices. SimplyWise payment recording and payment collection

2.2 Probable internal architecture—clearly labeled as inference

SimplyWise does not publish its source code, model prompts, price database, training set, or exact formulas. The following is the most plausible architecture based on its documented behavior and on the architecture publicly described by comparable systems:

Probable stage

Likely mechanism

Confidence

Input understanding

Multimodal model interprets description, photos, and attached plans

High

Measurement

User-entered measurements plus LiDAR-derived room geometry; vision may provide hints but should not be treated as a scale-accurate measurement without a reference

High for LiDAR/user measurements; medium for vision inference

Scope decomposition

Model converts the request into rooms, phases, tasks, materials, labor operations, and assumptions

High

Missing-fact detection

Rules or model checks required fields for the proposed task and asks targeted questions

High

Catalog retrieval

Scope phrases are matched to task/price records and possibly live or localized material records

Medium-high

Quantity calculation

Task formulas use measurements, waste, packs, and fixed allowances

Medium-high

Labor calculation

Production-rate or unit-price tables estimate labor; regional labor adjustment may be applied

Medium

Selling-price calculation

Deterministic markup/overhead/rate rules calculate totals

High

Proposal/invoice generation

Structured estimate data is rendered to client-facing documents and later copied or linked into invoice records

High

The strongest supporting industry evidence comes from Handoff, which describes a similar pipeline explicitly: computer vision identifies and quantifies work; quantities are cross-referenced against a cost book or local pricing database; company labor rates and markups are applied; and a detailed proposal is generated. Handoff AI estimating workflow

2.3 What SimplyWise is probably good at

Producing a comprehensive first draft quickly.

Reminding the contractor of often-missed supporting tasks such as protection, preparation, disposal, delivery, cleanup, and minor consumables.

Presenting estimates professionally.

Offering optional upgrades or add-ons.

Reducing the amount of typing required at the property.

Making it easy to adjust a baseline rather than start from a blank sheet.

2.4 What cannot safely be copied as a reliability strategy

Public comments show the exact risk: users often like the baseline and speed, but some report that particular local material prices or large-project totals can be materially wrong. Those comments are anecdotal, not a controlled accuracy study, but they reinforce the product's own editable-draft workflow. Contractor discussion of SimplyWise Other reviews explicitly describe the result as a baseline that the user adjusts. SimplyWise Trustpilot reviews

Therefore:

SimplyWise should be treated as a model for rapid scope drafting and user experience, not as proof that a generic AI can set a dependable Dovetails selling price.

3. How the strongest alternatives determine estimates

3.1 Handoff: AI scope plus catalogs, local data, and supplier matching

Handoff is the clearest public example of the hybrid architecture AI-FSM should use.

Handoff says its AI can use regional labor rates and material costs based on the project city, state, or ZIP code. Handoff local pricing More importantly, its Catalogs feature lets the contractor override generic pricing with company data imported from PDFs, spreadsheets, CSV files, Word documents, and images. A catalog rate can include cost, unit, markup, margin, and tax. Handoff Catalogs

Handoff also demonstrates supplier-aware matching. With its ABC Supply connection, AI-generated material descriptions are matched to actual supplier products and account/branch prices. Handoff explicitly tells users to review product, quantity, unit, SKU, branch, price, and availability before using the result. Handoff–ABC Supply workflow

Its estimating structure is Room → Group → Item, with separate labor and material markup, item/group/below-the-line markup, and live profit visibility. Handoff Estimating 2.0

Pattern to reproduce: AI retrieves known company rates and assemblies; it does not get unchecked authority to make up the rates.

3.2 Clear Estimates: maintained costs plus task assemblies

Clear Estimates is arguably the strongest reference for dependable residential estimating mechanics. It provides thousands of location-specific parts and task assemblies, updates material and labor pricing quarterly, and supplies hundreds of project templates. Clear Estimates overview

Its most important concept is the assembly. An assembly represents a completed unit of work, not merely a material SKU. For example, a plumbing or electrical assembly can include materials, labor, scope limits, and exclusions for one task. Clear Estimates feature guide

Clear Estimates' AI Scope Assistant is especially revealing: the company states that AI does not calculate or change the cost. The AI selects and assembles existing researched cost items; the structured cost database provides the numbers. The contractor then adjusts quantities, removes items, edits costs/descriptions, applies templates, and changes markup. Clear Estimates AI Scope Assistant

This is the single best public confirmation of the recommended AI-FSM design:

Let AI build the scope. Let versioned cost records and formulas build the price.

3.3 JobTread: reusable catalog plus actual-job feedback

JobTread uses a cost catalog of materials, labor rates, cost items, groups, and assemblies. Markup or margin can be applied automatically. JobTread Cost Catalog It calculates unit price, extended price, markup, and margin as line items change. JobTread budgeting

The more valuable pattern is its use of job-cost history. JobTread emphasizes comparing estimated costs with actual costs so future labor and cost estimates become sharper. JobTread estimating and historical data Its job-costing feature tracks every expense against budget. JobTread job costing

Pattern to reproduce: Every completed work item should generate a variance record that can influence—not automatically overwrite—the next production rate or material allowance.

3.4 Jobber: service price list, quote margin, and job profitability

Jobber represents the practical field-service pattern. Its product/service list stores item type, description, unit cost, markup, unit price, and tax treatment. Jobber products and services On a quote, Jobber calculates estimated margin from cost and selling price while hiding internal cost from the customer. Jobber quote markup

An approved quote flows into a job and then an invoice. Jobber quote workflow Time, materials, expenses, and receipts feed job profitability reporting. Jobber features and job costing

Pattern to reproduce: Customer-facing price and internal cost must be separate fields, and the quote-to-job-to-invoice linkage must remain intact.

3.5 Autodesk Forma and Procore: quantities connected to catalogs

Autodesk Forma connects 2D and 3D takeoff quantities directly to cost calculations, uses a centralized cost library, and accounts for direct and indirect cost. Autodesk Forma Estimate

Procore uses plan takeoff, auto-count, overlays, and a customizable database of parts, assemblies, equipment, and services. Quantities flow into the estimate, where material price, labor units, and profit margin can be adjusted. Procore Estimating Its cost catalog holds individual materials and assembled items. Procore Cost Catalog

Pattern to reproduce: Measurements are evidence and quantities; assemblies convert those quantities into work and cost.

3.6 Simpro: labor, estimated-versus-actual, and productivity

Simpro separates labor cost, overhead, markup/sell rates, estimated costs, and actual costs. Its labor-rate documentation emphasizes calculating overhead, cost rate, and markup or selling rate before quoting. Simpro labor rates It reports job costs and associated labor/materials by employee to evaluate productivity. Simpro job productivity Its takeoff tool uses catalogs, pre-builds, templates, material quantities, and fit times that synchronize to project costs. Simpro Takeoffs

Pattern to reproduce: Labor is not merely “hours × wage.” The engine needs production hours, loaded internal cost, billable price, overhead recovery, and actual-productivity reporting as distinct concepts.

3.7 RSMeans: the cost-database model

RSMeans illustrates what a serious external cost reference contains: material, labor, and equipment unit costs; assemblies; historical prices; productivity factors; and localization. It distinguishes a unit cost from an assembly cost and explains why regional cost data matters. Gordian RSMeans Data

AI-FSM does not need to reproduce RSMeans' commercial database. It should reproduce the structure and gradually fill it with Dovetails data, receipts, supplier quotes, and observed production rates.

4. Recommended AI-FSM architecture

flowchart TD
    A["Intake, photos, voice, plans, visit"] --> B["AI scope assistant"]
    B --> C["Canonical work items and questions"]
    C --> D["Measurements and conditions"]
    D --> E["Assembly and price-book resolver"]
    E --> F["Deterministic pricing engine"]
    F --> G["Human review and approval"]
    G --> H["Immutable accepted estimate"]
    H --> I["Work order and visits"]
    I --> J["Actual time, materials, travel, equipment"]
    J --> K["Invoices, payments, and job-cost variance"]
    K --> L["Reviewed rate recommendations"]
    L --> E

4.1 Layer 1: evidence capture

Inputs can come from:

Intake form

Customer description

Voice notes from a walkthrough

Site-visit assessment

Photos and annotated photos

Plan or blueprint files

Manual measurements

Bluetooth laser measurements

Future LiDAR/room scan

Property history

Previous related work

Every extracted fact needs a source reference. Example: wall_area_sqft = 425.97 should point to the manual measurement or calculation that created it. A photo can prove condition and identity; without a known scale, it should not silently become an exact measurement.

4.2 Layer 2: AI scope assistant

The AI assistant should output structured data, not a dollar total:

{
  "estimatePurpose": "FIXED_PRICE_PROPOSAL",
  "workItems": [
    {
      "taskCode": "PAINT.INTERIOR.WALLS.2COAT",
      "location": "living_room",
      "quantity": { "value": 425.97, "unit": "SQFT" },
      "qualityTier": "STANDARD",
      "conditions": ["OCCUPIED", "MODERATE_PREP"],
      "assumptions": ["Customer moves small personal items"],
      "exclusions": ["Lead or asbestos remediation"],
      "evidenceRefs": ["measurement:abc", "photo:def"],
      "confidence": 0.91,
      "unresolvedQuestionIds": []
    }
  ]
}

AI responsibilities:

Identify rooms, surfaces, systems, and tasks.

Suggest canonical task codes.

Extract measurements and units.

Identify necessary supporting work.

Flag contradictions and unknowns.

Ask task-specific questions.

Suggest reasonable alternates or upsells.

Draft scope, assumptions, exclusions, and customer language.

AI prohibitions:

It cannot write directly to an accepted estimate.

It cannot invent an untraceable material price.

It cannot replace a verified measurement with a photo guess.

It cannot silently change quantity, labor rate, markup, or tax.

It cannot auto-approve its own output.

4.3 Layer 3: canonical task and assembly library

Each repeated service needs a stable task code and versioned assembly. Examples for Dovetails:

VISIT.STANDARD.MINIMUM

PAINT.INTERIOR.WALLS.2COAT

PAINT.CEILING.2COAT

DRYWALL.PATCH.SMALL

DOOR.EXTERIOR.REPLACE

DOOR.STORM.REPLACE

FAN.CEILING.REPLACE.EXISTING_BOX

FAN.BOX.UPGRADE

LVP.INSTALL.SQFT

LVP.FLOOR_PREP.HOUR

DECK.STAIR.TREAD.REPLACE

SIDING.VINYL.REPAIR.SQFT

EQUIPMENT.LIFT.DAILY

TRAVEL.BEYOND_FREE_RADIUS

An assembly should contain:

Default unit and calculation basis

Labor operations and production rates

Crew/skill requirements

Materials and waste/pack rules

Consumables

Equipment

Setup and cleanup

Disposal

Conditions and modifiers

Required questions

Default assumptions/exclusions

Allowed quality tiers

Customer-facing description

Effective dates and version

For example, a “replace exterior door” assembly should not be one labor number. It should allow the engine to turn on or off removal, rough-opening repair, sill repair, threshold reinforcement, interior/exterior trim, siding adjustment, disposal, paint, hardware, and permit-related components.

4.4 Layer 4: versioned price book and production rates

Store separate internal and selling values:

Supplier/material cost

Material selling policy or handling

Labor production hours per unit

Employee/internal labor cost rate

Billable labor rate

Equipment cost and selling price

Subcontractor quote and markup

Travel cost and selling policy

Overhead allocation

Target gross margin

Tax treatment

Each price record needs provenance:

Supplier

Branch/store/location

SKU or catalog item

Source document or URL reference

Price date

Effective-from and effective-to dates

Whether tax is included

Pack size and unit conversion

Confidence and verification status

Never overwrite old rates. Create a new version. An estimate must always be reproducible from the exact versions it used.

4.5 Layer 5: deterministic calculation engine

Use NUMERIC/decimal quantities and integer cents or exact decimal money. Do not use JavaScript floating-point values for financial calculations.

Quantity

For a material sold in packs:

[Q_{adjusted} = Q_{measured} \times (1 + waste_rate)]

[Packs = \left\lceil \frac{Q_{adjusted}}{pack_coverage} \right\rceil]

[PurchasedQuantity = Packs \times pack_coverage]

The estimate should retain measured quantity, adjusted quantity, purchased quantity, and leftover assumption separately.

Labor hours

[Hours = FixedHours + Quantity \times HoursPerUnit \times \prod Modifier_i]

Examples of modifiers:

Access/height

Occupied or furnished condition

Surface condition/preparation

Number of colors or coats

Setup complexity

Restricted work hours

Travel/mobilization

Crew composition

Season/weather

Learning or unfamiliarity

A modifier greater than 1.0 increases required time. Keep the reason visible internally.

Internal labor cost

[LaborCost = \sum(Hours_{workerType} \times LoadedCostRate_{workerType})]

For initial Dovetails defaults, the engine can preserve the known internal planning values of Nick at $50/hour and the helper at $30/hour, while keeping them editable and separate from the customer-facing rate. The current public labor baseline of $85/hour can remain the rate-based selling fallback. The system should eventually replace assumed internal rates with fully loaded rates that include payroll burden, insurance, nonbillable time, and other attributable employment cost.

Customer labor price

For Dovetails' current rate-based work:

[LaborSell = BillableHours \times 85]

The customer-facing fixed-price estimate should not display the underlying hours unless the job is explicitly T&M. The internal estimate still needs the hours so it can schedule the work and measure production variance.

Materials

[MaterialCost = \sum(PurchaseQuantity_i \times UnitCost_i)]

[MaterialSell = MaterialCost \times (1 + MaterialHandlingRate)]

AI-FSM should support Dovetails' current 15% material handling rule as a policy version. It must also support at-cost T&M materials when that is what the customer agreement says. A card fee, if legally and contractually appropriate, must be a separate policy and not silently baked into cost. The existing 3.5% materials card-fee policy should be configuration, not hard-coded arithmetic.

Margin health check

Regardless of the pricing strategy:

[GrossProfit = SellPrice - DirectJobCost]

[GrossMargin = \frac{GrossProfit}{SellPrice}]

Markup and margin are not interchangeable:

[PriceAtMarkup = Cost \times (1 + Markup)]

[PriceAtTargetMargin = \frac{Cost}{1 - TargetMargin}]

At a cost of $100, a 20% markup produces $120, while a 20% margin requires $125. The UI should label these explicitly.

Supported pricing modes

Every estimate or line item should declare one pricing strategy:

FLAT_ASSEMBLY_PRICE

RATE_BASED_FIXED_PRICE

COST_PLUS_MARKUP

TARGET_MARGIN

TIME_AND_MATERIALS

T_AND_M_NOT_TO_EXCEED

ALLOWANCE

SUBCONTRACTOR_QUOTE

Do not stack strategies accidentally. For example, a material selling price already stored as retail must not receive an additional handling markup unless the policy explicitly says so.

Dovetails policy layer

The engine should initially support these existing business rules as versioned policy, not scattered if statements:

$150 standard minimum visit charge.

Public labor baseline of $85/hour.

Customer estimates are normally flat-rate and do not display estimated hours.

Materials shown separately when needed for materials-only scheduling deposits.

First 20 travel miles free; mileage and drive-time treatment beyond that follows the active travel policy.

T&M projects invoice actual labor/materials under the written authorization.

Deposits may be materials-only, 30%, or milestone-based depending on job type.

Hidden work or newly discovered scope requires customer review before proceeding.

Equipment such as a lift is its own cost component and can be customer-paid while labor is discounted or waived.

4.6 Layer 6: review gates and confidence

AI-FSM should show two different confidence concepts:

Scope confidence: How sure are we that the required work and quantity are understood?

Price confidence: How current and Dovetails-specific are the rates and production assumptions?

Recommended release gates:

Gate

Intended use

Required evidence

Customer output

BUDGET_RANGE

Early lead qualification

Broad scope and major quantity driver

Range, assumptions, not a contract price

DRAFT_ESTIMATE

Internal review

Required questions mostly answered; pricing sources identified

Not sendable without owner approval

PROPOSAL_READY

Fixed-price/customer quote

Required measurements confirmed; high-risk unknowns resolved; rates current; margin check passed

Exact proposal with assumptions/exclusions

ACCEPTED_BASELINE

Contract/work-order source

Customer acceptance/signature and immutable version

Becomes job baseline

Hard blocks should include:

Missing required measurement

Unknown structural or hazardous condition that materially changes scope

Stale or unknown high-value material price

Negative margin

Price below minimum charge without an explicit override reason

Unsupported unit conversion

Missing tax treatment

Total outside the historical range without acknowledgement

AI-created item with no assembly or manual price source

The GAO's general cost-estimating guidance is far larger than a handyman estimate, but its reliability principles transfer well: estimates should be comprehensive, well documented, accurate, and credible; shortcomings and assumptions should be documented; and historical data should be used. GAO Cost Estimating and Assessment Guide

5. Recommended PostgreSQL/domain model

The following entities fit the existing Assessment → Work Items → Labor → Materials → Travel → Overhead → Final Price design and should connect to the existing visit journal tables.

5.1 Scope and evidence

assessment_summaries

scope_items

scope_item_evidence

measurement_facts

condition_facts

clarification_questions

clarification_answers

assumptions

exclusions

estimate_risk_flags

5.2 Catalog and pricing

task_catalog_items

assembly_versions

assembly_components

pricebook_items

pricebook_item_versions

supplier_price_observations

production_rate_versions

pricing_policy_versions

modifier_rules

unit_conversions

5.3 Estimate commitment

estimates

estimate_versions

estimate_sections

estimate_line_items

estimate_line_components

estimate_adjustments

estimate_approval_events

estimate_customer_view_settings

An estimate_version becomes immutable once sent. Editing a sent estimate creates a new version. Acceptance points to exactly one version.

5.4 Production and actuals

work_orders

work_order_items

Existing visits

Existing visit_time_logs

Existing visit_parts

Existing visit_media

Existing visit_checklist_items

Existing mileage_logs with visit_id

equipment_usage_logs

material_purchase_lines

material_usage_lines

receipt_allocations

subcontractor_costs

job_cost_events

Add these traceability keys where appropriate:

source_scope_item_id

source_estimate_line_item_id

work_order_item_id

visit_id

change_order_id

This preserves the chain from what was assessed to what was sold, performed, purchased, and billed.

5.5 Change orders, invoices, and payments

change_orders

change_order_versions

invoice_schedules

invoices

invoice_versions

invoice_lines

payment_requests

payments

payment_allocations

processor_fees

refunds

financial_sync_events

Deposits are payments allocated against invoices or contract milestones; they should not be modeled only as negative invoice lines. This makes partial payments, refunds, and final balance calculations dependable.

5.6 Learning and audit

estimate_actual_variances

production_rate_observations

material_price_variances

rate_change_suggestions

rate_change_approvals

ai_runs

ai_run_inputs

ai_run_outputs

calculation_traces

manual_override_events

Every manual override should store previous value, new value, reason, actor, and timestamp. That is not bureaucracy for its own sake; it is the dataset that later explains why Nick's final judgment was better than the first draft.

6. Estimate-to-invoice workflow for AI-FSM

6.1 State flow

stateDiagram-v2
    [*] --> Draft
    Draft --> Reviewed
    Reviewed --> Sent
    Sent --> Revised
    Revised --> Sent
    Sent --> Accepted
    Sent --> Declined
    Accepted --> WorkOrder
    WorkOrder --> InProgress
    InProgress --> ChangeOrder
    ChangeOrder --> InProgress
    InProgress --> Completed
    Completed --> Invoiced
    Invoiced --> PartiallyPaid
    PartiallyPaid --> Paid
    Invoiced --> Paid

6.2 Rules that prevent financial drift

A sent estimate is immutable; revisions create versions.

Customer acceptance refers to the exact accepted version.

Work-order items are created from accepted estimate items, retaining source IDs.

New work requires a change order or an explicit authorized T&M item.

An invoice line must reference an accepted estimate line, an approved change-order line, an allowance reconciliation, or an actual T&M cost record.

A payment is a separate event allocated to one or more invoices.

Processor fees are expenses, not reductions to the customer's recorded payment.

Square synchronization uses idempotency keys and provider IDs so retries cannot create duplicate invoices or payments.

6.3 Square responsibility boundary

Recommended ownership:

AI-FSM is authoritative for: intake, scope, estimate versions, customer acceptance, work order, visits, time, purchases, job cost, change orders, invoice intent, and internal profitability.

Square is authoritative for: card/payment processing status, processor transaction IDs, fees, refunds, and payout status.

AI-FSM should never infer “paid” merely because it sent Square a request. It should wait for the confirmed Square payment state and reconcile it to the AI-FSM invoice/payment allocation.

6.4 Supported invoice schedules

MATERIALS_DEPOSIT

PERCENT_DEPOSIT

FIXED_MILESTONE

PROGRESS_PERCENT_COMPLETE

COMPLETION_BALANCE

T_AND_M_ACTUALS

NOT_TO_EXCEED_RECONCILIATION

CHANGE_ORDER

MATERIAL_REIMBURSEMENT

This directly supports Dovetails' real use cases: materials deposits, 30% deposits, progress billing, T&M, not-to-exceed authorizations, rental/equipment charges, change work, and final deposit credits.

7. The learning loop that makes estimates steadily more reliable

7.1 Capture actuals at the same granularity as the estimate

The system cannot learn that “the job took longer.” It must learn that a particular task under particular conditions took longer.

For every work-order item, capture:

Estimated quantity and actual quantity

Estimated labor hours by worker type

Actual labor hours by worker type

Estimated material cost and actual allocated material cost

Estimated equipment/travel/disposal/subcontractor cost and actual cost

Estimated selling price

Change-order impacts kept separate from original-scope variance

Reason codes: hidden condition, rework, customer-caused delay, bad production rate, bad measurement, missing scope, learning curve, weather, supplier price change, etc.

7.2 Core metrics

For a work item:

[LaborRatio = \frac{ActualHours}{EstimatedHours}]

[MaterialRatio = \frac{ActualMaterialCost}{EstimatedMaterialCost}]

[CostVariance = ActualCost - EstimatedCost]

[SignedPercentError = \frac{EstimatedCost - ActualCost}{ActualCost}]

Use both signed bias and absolute error. A system can look accurate on average while alternating between severe underestimates and overestimates.

Recommended dashboard metrics:

Median labor ratio by task code

Weighted absolute percentage error by task family

Signed bias by task family

Gross-margin variance

Material-price age at estimate time

Change-order rate caused by missing scope

Override rate by AI-selected task

Estimate acceptance rate by confidence tier

Time from site visit to sent estimate

Percentage of invoice lines traceable to approved scope

7.3 Safe rate updating

Do not let one bad day rewrite the price book.

Recommended policy:

Fewer than 5 clean observations: show history; do not recommend a default change.

5–14 comparable observations: offer a low-confidence rate suggestion.

15+ comparable observations: offer a stronger suggestion, still requiring approval.

Exclude or separately classify rework, customer delay, hidden conditions, and change-order work.

Use the median or a trimmed mean, not the simple mean.

Weight recent jobs more, but retain prior versions.

A stable shrinkage formula can blend the established rate with observed performance:

[SuggestedRate = \frac{PriorWeight \times CurrentRate + N \times ObservedMedian}{PriorWeight + N}]

For example, a prior weight of 5 prevents five early jobs from causing wild swings. The exact weight should later be tuned from Dovetails data.

7.4 Similar-job retrieval

Before final approval, the system should show the three to five most comparable completed work items based on:

Task code

Quantity band

Property type/age

Condition modifiers

Worker/crew type

Quality tier

Access/height

Occupied/vacant

Geographic distance

Date/material-price regime

The owner can then see “we estimated 8 hours; similar jobs took 8.5, 9.2, and 10.1” instead of trusting a mysterious confidence score.

8. A lawful, productive clean-room reverse-engineering program

The goal is to learn from observable product behavior without copying protected code, bypassing access controls, violating terms, or extracting a competitor's proprietary database.

8.1 Boundaries

Do:

Use each product normally under a valid trial or subscription.

Submit scopes and photos that Dovetails owns or has permission to use.

Record outputs generated for those inputs.

Compare line items, quantities, totals, questions, and assumptions.

Infer general rules and create an original implementation.

Use public documentation and your own actual-job data.

Do not:

Decompile the app.

Intercept or call undocumented private APIs.

Bypass authentication, limits, or anti-bot controls.

Bulk scrape proprietary catalogs.

Copy branded proposal language, proprietary task descriptions, or database records wholesale.

Present competitor output as Dovetails' original cost research.

8.2 Test harness

Create a benchmark table with one row per test run:

scenario_id

product

product_version_or_test_date

input_text_hash

photo_set_id

location

measurements

questions_asked

answers_given

line_items_json

labor_total

material_total

markup

tax

grand_total

assumptions

run_time_seconds

manual_edits_needed

Keep the input and output PDFs/screenshots as evidence, subject to the product terms.

8.3 One-variable-at-a-time experiments

Run the same base job while changing only one factor:

Experiment

Values

What it reveals

Quantity scale

100, 200, 400 sq ft

Per-unit rate, fixed setup cost, volume discount, rounding

Location

Derry, Manchester, Boston-area ZIP

Regional labor/material multiplier

Quality

Economy, standard, premium

Tiered assemblies and material allowances

Access

Ground level vs 30 ft

Height/equipment/productivity modifiers

Condition

Ready surface vs heavy prep/rot

Condition multipliers and supporting tasks

Occupancy

Vacant vs furnished/occupied

Protection and productivity allowance

Supply responsibility

Contractor supplies vs customer supplies

Material and handling rules

Disposal

Included vs excluded

Disposal line or hidden allowance

Photo

No photo vs one vs several

Whether vision changes scope, quantity, or only confidence

Measurement

Description only vs exact dimensions

Whether the tool calculates or uses generic allowance

Markup

0%, 15%, 20%, 30%

Markup basis and whether markup is applied to labor, materials, or both

Repeatability

Identical run 3–5 times

Model variability and deterministic post-processing

8.4 Mathematical inference

For quantity experiments, fit a simple model:

[EstimatedCost = FixedCost + UnitCost \times Quantity]

If the intercept is positive, the product probably has setup/mobilization/minimum cost. If the slope changes at a threshold, it likely uses pack rounding, tiered rates, or economies of scale.

For location experiments:

[LocationFactor = \frac{Cost_{location}}{Cost_{baseline}}]

For markup experiments, compare the output with both markup and margin equations. This quickly exposes whether a field labeled “margin” is actually performing markup math.

For labor, vary a condition without changing material quantity. The change isolates a probable labor/productivity factor. If a 30-foot condition adds the exact rental plus more labor, the engine is likely using both equipment and productivity modifiers.

8.5 Proposed 30-scenario Dovetails benchmark

Build 30 scenarios from real completed or well-understood Dovetails jobs:

5 painting/prep jobs

5 drywall/patch jobs

5 door/window jobs

5 deck/stair/carpentry repairs

5 siding/exterior/height-access jobs

5 mixed handyman visits

For each scenario, retain:

Original assessment

Photos and measurements

Estimate sent

Actual labor/time logs

Receipts/material allocations

Equipment/travel

Change work separated from original scope

Final invoice

Run the same sanitized scope through SimplyWise, Handoff, and Clear Estimates if valid trials/subscriptions are used. Compare their first drafts with the Dovetails actuals and with the AI-FSM calculation. This is far more useful than comparing app ratings.

8.6 Success criteria

Do not declare the engine “accurate” based only on total project price. Require:

At least 95% of known scope components represented on proposal-ready jobs.

100% of customer invoice lines traceable to approved scope/change/T&M actuals.

No duplicate deposit or payment application.

No negative-margin proposal sent without an explicit override.

Labor-hour bias within ±10% for task families with enough data.

Material-cost bias within ±5–10% when supplier prices were verified within the freshness window.

Total direct-cost weighted error below a target that tightens as data grows.

100% reproducibility of an accepted estimate from its stored versions and calculation trace.

The first release will not meet every accuracy target across every trade. The purpose of confidence levels is to be honest about where the system has evidence and where Nick still has to supply judgment.

9. Implementation order for the existing AI-FSM

Phase 1: financial foundation

Define canonical units, task codes, and price/cost terminology.

Add versioned price-book items, production rates, policies, and assemblies.

Build the deterministic engine with calculation traces and exact decimal money.

Add the immutable estimate-version and acceptance model.

Link accepted estimate lines to work-order items and visits.

Do this before photo-to-estimate AI. Otherwise the app will generate polished scopes on top of unstable prices.

Phase 2: reliable invoicing and job cost

Link time, parts, mileage, equipment, receipts, and subcontractor costs to work-order items.

Add change-order authorization.

Add invoice schedules and payment allocations.

Define Square synchronization and idempotency.

Add estimate-versus-actual and margin reporting.

Phase 3: AI scope assistant

Convert intake/site-visit evidence into structured scope-item candidates.

Retrieve assemblies by task code.

Generate missing questions.

Draft assumptions, exclusions, and customer scope.

Add AI edits as proposed patches that Nick accepts or rejects.

Phase 4: calibration and competitor benchmark

Import 30 completed Dovetails jobs.

Allocate actual time and purchases by work item.

Calculate rate and material variances.

Run the controlled competitor test matrix.

Adjust assemblies and modifiers based on Dovetails results—not competitor totals alone.

Phase 5: higher-end capture and pricing

Supplier-price imports and freshness alerts.

Receipt OCR mapped to job and price book.

Bluetooth laser measurement capture.

Plan/photo quantity assistance.

Optional LiDAR room scanning.

Upsell recommendations based on compatible assemblies and prior acceptance—not generic AI ideas.

10. What not to build yet

A model that outputs an untraceable total price.

Fully automatic photo measurement without scale or sensor data.

Automatic price-book self-modification from one job.

A giant national price database before Dovetails' core task library works.

Enterprise bid collaboration copied from Procore/Autodesk.

Complex rendering/visualization before estimate-to-actual linkage is dependable.

A second payment ledger that conflicts with Square.

Customer-facing “AI confidence” with no evidence behind it.

The reliable competitive advantage is not “our AI estimated it in six seconds.” It is:

“The system can show exactly what was included, which measurement and rate were used, why the price changed, what was approved, what actually happened, and what the business learned.”

That is harder to market in a six-second video, but it is what prevents a six-day job from becoming a six-week argument.

11. Final recommendation

Build AI-FSM's estimator as a versioned production-and-pricing system with an AI front end, not as an AI price generator.

The first code milestone should be a deterministic EstimateEngine that accepts an AssessmentSummary, resolves versioned assemblies and policies, and emits:

Internal cost components

Customer-facing line items

Labor/material/equipment/travel/overhead totals

Markup/margin calculations

Assumptions and exclusions

Confidence and blocking issues

Full calculation trace

IDs/versions for every input used

The second milestone should be the accepted-estimate → work-order-item → actual-cost → invoice trace. The third should be the AI scope assistant. That order gives Dovetails steady estimates because the intelligence is grounded in repeatable company facts rather than a model's confidence.

Once those three pieces are in place, AI-FSM will not merely imitate SimplyWise. It will have the part SimplyWise cannot give Dovetails: an estimating system that learns the actual way Nick and Dovetails Services LLC perform and price work.

Primary research sources

G2 — SimplyWise Cost Estimator alternatives

SimplyWise — How to use the Cost Estimator

SimplyWise — App Store product listing

SimplyWise — Pricing and included estimating features

Handoff — AI estimating workflow

Handoff — Local pricing

Handoff — Catalogs and company price books

Handoff — Supplier product and branch-price matching

Clear Estimates — AI Scope Assistant and cost-data separation

Clear Estimates — Local price database and templates

Clear Estimates — Task assembly examples

JobTread — Cost Catalog

JobTread — Historical data and estimate-to-actual learning

Jobber — Products/services and pricing fields

Jobber — Quote markup and margin

Autodesk — Forma Estimate

Procore — Estimating workflow

Simpro — Takeoffs

Gordian — RSMeans cost data

GAO — Cost Estimating and Assessment Guide

