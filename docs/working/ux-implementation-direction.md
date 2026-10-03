# AI-FSM UX Review & Implementation Direction

**Project:** Dovetails OS / AI-FSM
**Purpose:** Living UX implementation brief for AI-assisted development
**Status:** Working design direction. Preserve existing working architecture unless a section explicitly calls for replacement.

**Authority:** Required reading before changing screens, workflows, intake, estimates, jobs, visits, materials, invoices, payments, schedule, reports, or settings. It sits with `docs/working/execution-doctrine.md` as Layer 5 working direction.

It does not override `docs/canonical/` on product identity, domain model, or roadmap phase scope. It does govern presentation, hierarchy, and the required code changes named below.

**How agents use this file:**

1. Read the section for the screen you are changing, plus sections 22, 23, and 25, before editing.
2. Preserve good plumbing. Do not rebuild a working subsystem because this brief describes a simpler interface.
3. Sections 26–30 are confirmed code deltas. Later screen audits append at the bottom in the delta-only format from section 27. Do not add another full design section for a screen already covered here.
4. Measure improvement by fewer decisions and less navigation, with the same or better backend capability.

---

## 1. Product North Star

AI-FSM should feel like an on-site manager and business manager, not a collection of database modules.

The user should think in terms of:

- What am I doing today?
- Which customer/property/job am I working on?
- What is the next action?
- What did I observe or complete?
- What needs my decision?

The user should not need to understand whether an action creates or modifies a Request, Work Order, Visit, Activity Entry, Material record, Invoice Line, or other backend object.

### Core lifecycle

Capture / Request → Assessment → Work Items → Production Intelligence → Estimate → Approved Job → Visits → Completion → Invoice → Payment → Permanent History

Information should move forward through this lifecycle. Do not require duplicate entry downstream.

---

## 2. Global UX Acceptance Standard

These rules are not backlog items. They are design standards. New and existing screens should be evaluated against them.

### Rule 1 — One Obvious Next Action

Every operational screen must answer:

What should I do next?

There should normally be one visually dominant primary action.

Secondary actions must not visually compete with the primary action.

**Acceptance criteria**

- A user unfamiliar with the screen can identify the intended next action within approximately 3 seconds.
- If multiple actions are equally valid, the system explains the decision rather than presenting an undifferentiated button wall.
- Administrative actions are visually subordinate to operational actions.

**Do not**

- Give Save, Schedule, Invoice, Add Visit, Edit, Change Status, Add Work Order, and similar actions equal visual weight.
- Make the user infer the next workflow state from database status labels.

### Rule 2 — Never Make the User Choose a Database Object

The interface should use the user's mental model:

- Customer
- Property / House
- Job
- Today's Work
- Scope
- Money
- History

Backend concepts can remain in the data model.

**Acceptance criteria**

- Common field workflows do not require choosing between Request vs Job vs Work Order vs Visit.
- AI-FSM determines the appropriate backend records based on the action.
- Advanced/admin views may expose technical entities when necessary.

### Rule 3 — Enter Information Once

Information captured upstream must propagate downstream.

Examples:

- Intake customer/property information populates Assessment.
- Assessment observations become proposed Work Items.
- Confirmed Work Items feed Production Intelligence.
- Approved Estimate scope becomes execution scope.
- Visit completion updates completion records.
- Completion records draft invoice descriptions.

**Acceptance criteria**

- No routine workflow asks the user to retype information already known.
- When downstream wording differs, AI-FSM drafts the new representation from the original source.
- Original source information remains preserved for audit/history.

### Rule 4 — Context Over Navigation

Actions should live where the user discovers the need.

Examples:

- Need material while on a Job → add it from the Visit.
- Customer asks for additional work → Add Work from the Job/Visit.
- Take progress photo → from the current Visit.
- Schedule return trip → from Visit Closeout.
- Add receipt during supply run → associate from current context.

**Acceptance criteria**

- Most field actions can be completed without leaving the active Job/Visit.
- Separate modules remain available primarily for global review, search, reporting, and administration.

### Rule 5 — Today's Screen Answers Today's Questions

Today/My Day should prioritize:

1. Where am I going?
2. What am I doing first?
3. What materials do I need?
4. What can I do while another task dries/cures?
5. What is unfinished?
6. What must I remember before leaving?

Do not turn My Day into a general business dashboard.

### Rule 6 — AI Prepares; User Approves Exceptions

AI-FSM should perform routine reconciliation and preparation.

Use this pattern for:

- Day Review
- Estimate preparation
- Production planning
- Material readiness
- Visit sequencing
- Completion descriptions
- Invoice preparation

**Confidence behavior**

- High confidence: apply/pre-fill and collapse; allow review.
- Medium confidence: quick confirmation.
- Low confidence: ask one clear question.

The user should spend attention on uncertainty, not clerical reconstruction.

### Rule 7 — History Builds Automatically

Job documentation should emerge from normal work.

Sources include:

- Photos
- Voice/text notes
- Measurements
- Tasks completed
- Materials purchased
- Receipts
- Changes/additional work
- Visit closeouts
- Customer approvals
- Payments

Do not require a separate end-of-job documentation exercise when the information already exists.

### Rule 8 — Progressive Disclosure

Keep advanced information available but hidden until useful.

Examples:

- Production rates
- Internal labor assumptions
- Profitability
- Detailed Work Orders
- Accounting reconciliation
- Advanced scheduling metadata

Primary field screens should show the simplest useful representation first.

### Rule 9 — The Three-Second Driveway Test

Every field-facing screen must be tested as though the owner is:

- standing in a customer's driveway,
- holding a phone in one hand,
- possibly distracted,
- trying to determine the next action immediately.

If the correct action is not obvious within about three seconds, simplify the screen.

### Rule 10 — Recover From Interruption

Every multi-step workflow must be resumable.

Applies especially to:

- Assessment
- Day Review
- Estimate review
- Visit closeout
- Invoice reconciliation

Reopening should return the user to the next unresolved decision, not restart the workflow.

---

## 3. Global Navigation

### Existing strengths to preserve

Current code already contains:

- Role-aware navigation.
- Owner/admin/technician differences.
- Mobile Today / Jobs / People / Money hub model.
- Work Orders removed from primary navigation.
- Needs Attention routing into My Day for owner.
- Global Find / command palette.
- Breadcrumb components.
- Automatic field/office workspace behavior.
- Attention indicators.
- Strong Customer and Property history foundations.

Do not replace these simply to achieve a new visual design.

### Direction

**Mobile primary navigation**

Preserve/refine:

- Today
- Jobs
- People
- Money
- More

Capture should be reachable persistently and quickly.

**Desktop/tablet**

Make the same mental model apparent. Avoid making desktop feel like a completely different product.

Reduce the prominence of individual modules such as:

- Requests
- Quotes
- Work Orders
- Visits
- Materials
- Mileage
- Expenses
- Bills
- Reports

These capabilities remain accessible through contextual workflows and Business/More views.

### People + Houses

Keep Customers/Clients and Properties/Houses distinct in the data model.

In the experience, treat them as one relationship:

- Person → one or more properties.
- Property → owner/contact + complete service history.

Do not require constant bouncing between separate modules.

### Breadcrumbs

Use human-readable context:

Smith Residence → Bathroom Repair → Today's Visit

Avoid identifiers such as: Visit #1847

---

## 4. My Day / Today

### Purpose

My Day is the operational home and should behave like an on-site manager.

### Before the day starts

Primary action: Start My Day

If vehicle and starting mileage are already known, allow one-tap start.

Only open a wizard when information is actually missing.

### After day start

Show Right Now:

- current activity,
- vehicle,
- mileage state,
- travel/job/material/admin state.

### Next Visit

Before arrival:

- Navigate
- Call/Text
- Scope preview
- Material readiness

On site:

- Photos
- Notes
- Scope
- Measurements
- Scan
- Markup
- Add Work
- Need Material

### Sequencing

AI-FSM should help order tasks:

- First Up
- While That Dries
- Before Leaving

This is a key field-management feature.

### End Day

Do not make End Day visually dominant early in the day. Surface it naturally later or when work is complete.

Confirmed code delta for the current End Day button: section 26.

---

## 5. Capture

### Purpose

Capture is the universal get-this-out-of-my-head inbox.

It is intentionally different from New Request.

### Preserve

- Full-screen capture.
- Giant record control.
- Tap/hold recording.
- Live transcript where supported.
- Photo attachment.
- Typed fallback.
- Offline/local retry behavior.

### Change

Use neutral language such as:

Type what you need to remember

Avoid promise-only language.

### Do not add

- Categories before capture.
- Customer selector before capture.
- Job selector before capture.
- Complex classification buttons.

Classification occurs after capture.

---

## 6. Needs Attention

### Purpose

Operational triage, not a raw-capture dumping ground.

Prioritize using:

- urgency,
- money,
- customer promise/commitment,
- scheduling consequence,
- blocked work.

Each item should provide a direct resolution action.

"All clear" should genuinely mean there is nothing requiring intervention.

---

## 7. Day Review

### Goal

A good day should often take approximately 30 seconds to review.

The desired experience:

AI-FSM figured out almost everything. Here are the few things that still require your judgment.

### AI should reconcile

- GPS/stops
- schedule
- receipts
- time
- mileage
- visits
- captures
- promises
- production activity

### Confidence handling

Bundle high-confidence matches.

Example: 12 items matched automatically — Review if needed

Ask only about uncertain items.

### Field Assist

Allow contextual prompts during the day:

- likely departure from job,
- likely supply run,
- unfinished work,
- missing closeout.

Suggested modes:

- Off
- Important Only
- Active

Default direction: Important Only.

Do not interrupt while driving.

Ignored items fall back to Day Review/Needs Attention.

---

## 8. Intake / New Request

### Goal

Fast conversational capture first; structure second.

### Initial required information

Prefer:

- Name
- Contact method
- Rough scope
- Property/address if known

Do not require preferred date/address prematurely when they are not needed.

### Progressive capture

Ask service-specific questions only when they improve routing or estimating.

Support photos immediately.

### Future conversational intake

Example voice input:

John Smith in Derry. Bathroom exhaust fan and drywall repair. Referred by Sarah. Flexible schedule.

AI-FSM:

1. Parses fields.
2. Identifies missing important information.
3. Presents a concise confirmation.
4. User confirms.
5. System asks what happens next.

### Routing

Primary decision:

- Schedule Assessment
- Book Work Appointment
- Remote Estimate

The UI should emphasize what happens next, not record taxonomy.

Confirmed validation conflict: section 27.

---

## 9. Requests

Requests should answer:

1. What does the customer want?
2. What does AI-FSM recommend doing next?
3. Why?
4. What is the primary action?

Example:

Recommended next step: Book a Look
On-site measurements and access conditions are needed before pricing.

Primary button: Book a Look

Move status controls, pricing metadata, and administrative details lower.

Confirmed hierarchy conflict: section 27. Do not replace `getRequestGuidance`.

---

## 10. Assessment / Walkthrough — From-Scratch UX Using Existing Plumbing

Treat the existing Assessment implementation as reusable backend groundwork, not as the final UX.

### Mental model

Property → Areas → Capture → Understand → Confirm → Work Items → Estimate

The workspace is room/area-centric.

### Assessment Home

Show:

- customer/property,
- progress,
- area cards,
- Add Area.

Area examples:

- Living Room — Captured
- Kitchen — Needs confirmation
- Bathroom — Not started

### Persistent Area Capture Bar

Actions:

- Photo
- Note
- Measure
- Scan
- More / Capture

Allow side observations without abandoning the current flow.

### Photo + Markup

Support:

- Pen
- Arrow
- Circle
- Rectangle
- Dimension
- Text
- Highlighter
- Eraser

Markup must be non-destructive.

Store original photo separately from markup objects.

Markup should remain editable.

### Measurements

Support Draw First:

1. User draws measurement lines.
2. Lines become waiting dimensions.
3. Manual or T1/T1R measurement fills the next waiting dimension.

Also support Measure First where useful.

Measurements must be structured objects with semantics:

- Wall A length
- Wall A height
- Door width
- Window width
- etc.

### Geometry

Automatically calculate quantities while exposing the math.

Example: 8 ft × 10 ft room with 8 ft ceiling:

- Gross wall area: 288 sq ft
- Ceiling/floor: 80 sq ft
- Perimeter: 36 LF

If openings total 45 sq ft:

- Adjusted wall area: 243 sq ft

Show both gross and adjusted values.

User can confirm/edit dimensions.

### AI observations

AI may propose:

- drywall repair,
- baseboard replacement,
- painting,
- damaged trim,
- other possible work.

Actions:

- Confirm
- Edit
- Ignore

AI never silently adds customer-billable work.

### Area Summary

Show:

- Photos
- Measurements
- Openings
- Observations
- Calculated quantities
- Proposed Work
- Needs Confirmation

Target: ideally 0–1 unresolved questions per room.

### Walkthrough Summary

Show:

- Areas assessed
- Photos
- Measurements
- Proposed Work Items
- Remaining uncertainties

Resolve uncertainties one at a time.

Primary transition: Build Estimate / Review Work Items

No re-entry.

### LiDAR / RoomPlan

Future iPad LiDAR capture must feed the same Area/Measurement model.

Measurement source hierarchy:

1. User-confirmed direct measurement
2. LiDAR / RoomPlan
3. AI visual estimate

Always preserve/display measurement source when relevant.

### Build order

1. Area/room workspace, photos, voice/text notes, observations, summaries.
2. Editable markup, structured dimensions, geometry math.
3. T1/T1R sequential measurement integration.
4. AI interpretation and missing-information assistance.
5. LiDAR/RoomPlan integration.

---

## 11. Work Items + Production Intelligence

### Separation of concerns

- Assessment = field truth
- Work Item = scope
- Production Intelligence = how the work is performed/internal math
- Estimate = what is promised and charged

Assessment output should automatically become proposed Work Items.

### Work Item stack

Scope → Quantity → Production → Materials → Cost → Price

Default presentation should remain compact.

Example:

Paint Living Room Walls
243 sq ft • 2 coats
Suggested price: $___
✓ Production data complete
Review

Production Intelligence remains collapsed unless needed.

### Dependencies

AI should suggest related work.

Examples:

- Baseboard replacement → possible painting/caulking.
- Vanity replacement → plumbing reconnection, shutoffs, disposal, caulking, touch-up.
- Drywall repair → protection, compound stages, sanding, primer, paint implications.

Suggestions require confirmation before becoming customer charges.

### Internal vs customer language

Internal:

- protect,
- cut,
- backing,
- patch,
- compound,
- sand,
- prime.

Customer: Repair drywall damage and prepare repaired area for paint.

Do not expose production minutiae unnecessarily.

### Estimate Health

Show: 12 work items ready • 2 need review

Link directly to unresolved items.

---

## 12. Estimate

### Goal

Estimate is review-first, not creation-first.

By this stage AI-FSM should already have most of the estimate.

### Header

Show:

- Customer
- Property
- Status
- Health

Example: 14 items • 12 ready • 2 need review

Primary action: Review 2 Items

### Scope organization

Group customer-facing scope by logical area/room where possible.

Internal Production Intelligence is expandable, not dominant.

### Options

Support:

- Base scope
- Optional add-ons
- Good/Better/Best where appropriate

Do not duplicate entire estimates to represent options.

### Materials

Support:

- Included materials
- Allowances
- Customer-supplied materials
- Materials due at scheduling

Business rules such as handling/card policies belong in settings/rules, not manual per-estimate arithmetic.

### Preflight before send

Validate:

- scope complete,
- pricing reviewed,
- material/deposit configuration,
- exclusions/assumptions,
- customer approval mechanism.

### Customer view

Show only what the customer needs:

- Work being performed
- Scope groups
- Options/allowances
- Total
- Deposit/scheduling terms
- Exclusions/assumptions
- Approval

Do not expose:

- labor hours,
- production rates,
- markup,
- internal cost,
- margin.

### Explain This Price

AI may generate a concise customer-friendly explanation from production assumptions without exposing internal margins.

### Approval transition

Approved scope must flow directly into Job/Visits.

Do not rebuild scope after acceptance.

Deposit mode for estimates: section 29.

---

## 13. Jobs / Work Orders / Visits

### Mental model

Expose primarily:

Job → Today's Visit → Tasks

Keep Work Order as backend/advanced structure.

### Job

Job represents the complete customer promise:

- Approved scope
- Visits
- Photos
- Materials
- Changes
- Money
- History

Recommended Job navigation:

Overview | Today | Scope | Photos | Money | History

### Today's Visit

Primary field question:

What are we doing here today?

Example:

Smith Residence — Today
6 tasks planned • 4.5 hr production target

First Up
Drywall repair — protect, repair Wall B, first coat

While That Dries
Replace 7.5 ft baseboard
Prep walls

Before Leaving
Progress photos
Customer update
Confirm next visit

### Carry forward

Unfinished work should automatically become remaining work.

Do not recreate it manually.

### Add Work

Provide a prominent Add Work action during a visit.

Capture:

- photo,
- voice/text description,
- location/area.

Store it separately from approved scope.

Route to:

- Change Order
- Separate Estimate
- Future Request
- Non-billable correction where appropriate

Never silently turn additional requested work into free approved scope.

---

## 14. Materials

### Design principle

- Visit owns today's material readiness.
- Job owns the overall material plan.
- Production Intelligence predicts needs.
- Receipts reconcile actual purchases.

### Before Visit — Ready for Tomorrow

Generate from approved scope + production plan.

Buckets:

- Already have / On Truck
- Need to Buy
- Customer / Job Site
- Uncertain

### During Visit

Keep Materials lightweight and inside the Visit.

Fast action: Need Material

Voice example:

> Need another 12-foot 1×4 and white Alex 230.

AI-FSM adds the material to:

- current Visit need,
- Job material plan,
- shopping list as appropriate.

### Receipt reconciliation

When a receipt is captured during an active job/supply stop, suggest the likely Job.

User confirms rather than re-entering.

Track: Needed → Purchased → Available → Used

Avoid obsessive inventory management.

Consumables can use reasonable production allowances while actual purchases remain expenses.

### Visit closeout

Use remaining work to prepare tomorrow.

Example: Tomorrow requires:

- sand/prime drywall,
- install baseboard,
- paint walls.

AI-FSM checks:

- 1×4 missing,
- primer available,
- paint on site,
- caulk uncertain.

Offer: Add Missing Materials to Shopping List

---

## 15. Visit Closeout → Job Completion → Invoice

### Principle

Do not build an invoice from scratch. Reconcile the financial history of the Job and prepare it for approval.

### Visit Closeout

Ask:

- Work complete
- Returning
- Waiting on customer/material

Visit completion does not automatically mean Job completion.

If Returning:

- preserve unfinished tasks,
- propose next visit,
- carry forward production sequence,
- check material readiness.

### Job Completion

When final work is complete, reconcile:

- Approved Estimate scope
- Approved changes
- Completed work
- Materials where relevant
- Deposits/payments
- Unfinished/deferred items

Then show: Job appears complete — Invoice ready to review

---

## 16. Line Items + Completion Descriptions

Every approved scope item must retain a linked history.

### Three description layers

**1. Internal Production Description**

Detailed internal execution steps and assumptions.

**2. Customer Estimate Description**

What Dovetails promises to perform.

Example: Drywall Repair — Living Room
Repair damaged drywall and prepare repaired area for painting.

**3. Customer Completion Description**

What was actually performed.

Example: Completed — Drywall Repair, Living Room
Repaired damaged drywall on the living-room wall, finished and sanded the repair, primed the repaired area, and prepared the wall for finish painting.

AI-FSM drafts completion descriptions from Visit history.

User can edit before sending.

### Required terminal state

Every approved estimate/scope line must end as one of:

- Completed
- Changed
- Removed / Credited
- Deferred
- Not Completed

No approved line silently disappears.

### Core rule

- Estimate lines describe the promise.
- Completion records describe the work performed.
- Invoice lines reconcile the financial result.

All remain linked to the same underlying Work Item.

---

## 17. Invoice Review

### Header

Show:

- Customer
- Job
- Contract/approved amount
- Approved additions/credits
- Payments/deposits received
- Balance due
- Exceptions

### Example completion review

Job Completion Review
11 of 11 approved work items complete
2 approved additions complete
0 unfinished items
13 completion descriptions ready
$650 deposit received
Expected remaining balance: $____

⚠ 1 item changed from original scope — review description

Primary action: Resolve 1 Issue

After resolution: Review & Send Invoice

### Exception detection

Flag:

- Missing approved change
- Scope item with no completion state
- Contract vs invoice mismatch
- Unapplied deposit
- Partial payment
- Material credit/return
- Deferred work accidentally billed
- Additional work lacking approval

Do not rely on the user noticing these manually.

### Progress invoices

Support progress invoicing without breaking Job truth.

Invoice represents a billed portion of approved Job scope.

Job remains the source of truth.

---

## 18. Customer Work Completion Summary

Invoice should remain financially clean.

Optionally generate a separate Work Completion Summary from the same data.

May include:

- Work performed by room/area
- Completion descriptions
- Approved changes
- Before/after photos
- Deferred work
- Follow-up/warranty notes

Do not force all narrative documentation into the invoice itself.

---

## 19. Payment + Job Closeout

Payment closes the financial loop, not the operational history.

When payment is recorded:

- reconcile invoice balance,
- update Job financial status,
- preserve permanent history.

Supported payment sources may include Square and manually recorded payment methods.

### Closeout loose ends

Only ask about genuine exceptions:

- warranty/follow-up,
- future requested work,
- returns/credits,
- unresolved promises,
- review request.

Avoid a long closeout form.

Desired lifecycle:

Work Complete → Invoice Sent → Payment Received → Loose Ends Cleared → Job Closed

### Review requests

Prepare a review request after a successful completed/paid Job.

Do not automatically send to every customer.

Surface: Review request ready

User decides whether to send.

---

## 20. Customer / Property Permanent Record

The Customer/Property record should become the long-term memory of the relationship.

When a customer calls months later, the user should quickly find:

- what was done,
- when,
- photos,
- materials,
- completion descriptions,
- invoices/payments,
- unresolved/future work.

Search should support human queries such as:

- Smith
- Main Street
- bathroom
- invoice number
- blue vanity
- drywall repair

The user should not need to remember which backend module owns the information.

---

## 21. Role-Aware UX

Preserve existing role-aware architecture.

Future technician experience should focus on:

- Today
- Assigned Jobs
- Schedule
- Capture
- Customer/job information needed for work

Technicians should not automatically see:

- Owner margin
- Profitability
- Company-wide expenses
- Sensitive pricing logic
- Unrelated customer financial data
- Owner reports

Design permission boundaries now, even if the owner is currently the primary user.

---

## 22. Implementation Method for AI Coding Agents

When changing an existing screen, the coding agent should follow this sequence:

1. Inspect existing implementation first.
2. Identify reusable components, routes, permissions, data queries, and business logic.
3. Do not rebuild working plumbing solely for visual cleanup.
4. State the user job of the screen. One sentence: "This screen exists so the user can ____."
5. Identify the primary action. There should normally be one.
6. Identify information already known upstream. Pre-fill or derive it. Do not ask for duplicate input.
7. Separate normal path from exceptions. Optimize the normal path. Surface exceptions explicitly.
8. Move contextual actions into context. Avoid forcing navigation to another module.
9. Apply progressive disclosure. Hide advanced/internal details by default.
10. Check interruption recovery. Persist progress and resume at the unresolved step.
11. Apply role permissions. Verify owner/admin/tech behavior.
12. Run the Three-Second Driveway Test. On phone width, can the next action be identified immediately?
13. Verify downstream data flow. Ensure changes propagate to later workflow stages without re-entry.
14. Do not silently change financial scope. AI may suggest; customer-billable additions require explicit approval/appropriate workflow.

---

## 23. Definition of Done for UX Work

A screen is not done merely because its controls function.

It is done when:

- its purpose is obvious,
- the next action is obvious,
- duplicate entry is eliminated,
- the normal path is short,
- exceptions are clearly surfaced,
- advanced details are available without dominating,
- mobile use is practical,
- interrupted work resumes correctly,
- role permissions are correct,
- downstream records remain linked,
- financial changes are auditable,
- the screen fits the overall lifecycle rather than becoming another isolated module.

---

## 24. Recommended Next Review Pass

Use this document as an audit rubric against the existing application.

For each major screen, record:

- **Keep:** existing behavior that already satisfies the rules.
- **Refine:** correct architecture with UX/hierarchy changes needed.
- **Move:** functionality that belongs in another context.
- **Hide:** advanced/backend concepts that should remain available but not prominent.
- **Build:** genuinely missing capability.
- **Remove:** obsolete/duplicate interaction.
- **Acceptance tests:** concrete behavior required before considering the change complete.

### Recommended audit order

My Day → Capture → Needs Attention → Intake → Requests → Assessment → Work Items / Production Intelligence → Estimate → Job → Visit → Materials → Visit Closeout → Invoice → Payment → Customer/Property → Schedule → Business/Reports/Settings

My Day, Capture, Needs Attention, Day Review, Intake, Requests, Schedule, and Business/Reports/Settings already have code-audit notes in sections 26–30. Continue from the next unaudited screen. Use the delta-only format in section 27.

### Final product principle

Navigation gets the user to the thing. Actions let the user do the work. AI-FSM handles the plumbing underneath.

The product should become more capable while feeling smaller.

---

## 25. Code Audit Principle — Preserve Good Plumbing, Remove Cognitive Load

This principle must guide implementation work throughout AI-FSM:

Separate good plumbing from unnecessary cognitive load.

A workflow may have substantial backend intelligence, data relationships, automation, reconciliation logic, permissions, or record structures that are worth preserving even when the current interface feels complicated.

Do not interpret UX simplification as permission to rebuild working architecture.

For every audited feature:

1. Identify what the existing system already knows or does correctly.
2. Preserve that logic unless there is a concrete technical reason to replace it.
3. Identify which backend concepts are unnecessarily exposed to the user.
4. Remove, combine, collapse, automate, or contextually relocate those interactions.
5. Measure improvement by reduced decisions and reduced navigation, not by fewer backend capabilities.

The desired result is:

More intelligence underneath; fewer decisions on the surface.

### AI coding-agent instruction

Before modifying an existing workflow, explicitly classify its pieces as:

- **Good plumbing — preserve**
- **Useful capability — simplify presentation**
- **Backend concept leaking into UX — hide/translate**
- **Duplicate interaction — remove**
- **Missing capability — build**

An AI coding agent must not replace an existing subsystem merely because the new UX specification describes a simpler interface.

---

## 26. Actual-Code Audit — My Day / Capture / Needs Attention / Day Review

### My Day / Today

**Classification:** REFINE — preserve architecture and data sources.

**KEEP**

- Start My Day workflow.
- Existing one-tap start when vehicle and odometer information are already known.
- Wizard fallback when information is genuinely missing.
- Next Visit Hero.
- Field Right Now state.
- Day status/mileage information.
- Arrival proposal/detection logic.
- Field quick-action foundation.
- Existing role-aware behavior.
- Today timeline and operational data already being loaded.

**REFINE**

End Day is currently too prominent.

Current implementation renders a full-width End Day button near the top of My Day immediately after the day is started.

Required behavior:

- Do not make End Day a primary early-day action.
- Move it lower in the page and/or increase its prominence contextually when the workday is likely ending.
- It must remain easy to find deliberately.
- Do not hide it behind obscure navigation.

**MOVE / MERGE PRESENTATION**

Current My Day separately presents Work Orders and standalone Assessments.

This exposes implementation structure.

Replace the field-facing distinction with a unified concept:

Today's Work

Today's Work should combine relevant scheduled operational items and order them chronologically/contextually.

Each card should communicate:

- Customer/property
- What the visit is for
- Scheduled time
- Current state
- First task / Start Here when known
- The correct next action

The user should not need to care whether the source record is technically a Work Order, Visit, or Assessment.

**Acceptance criteria**

- Before day start, Start Day is visually dominant.
- After day start, the current/next work is visually dominant.
- End Day does not compete with active-work actions early in the day.
- Work Orders and Assessments do not require separate mental models in the Today experience.
- Existing backend records and queries are reused where practical.

### Capture

**Classification:** KEEP with minor copy refinement.

**KEEP**

- Full-screen capture experience.
- Large 168px recording control.
- Tap/hold interaction.
- Speech transcription.
- Audio preservation where supported.
- Optional photo.
- Typed fallback.
- Local/offline pending queue.
- Retry behavior.
- Minimal interface.
- No forced customer/job/category selection before recording.

**REFINE COPY**

Current fallback copy includes:

Type the promise.

Replace with neutral language such as:

Type what you need to remember.

The typed placeholder should also avoid implying that Capture exists primarily for customer promises.

Use a broad example that could represent:

- reminder,
- observation,
- material need,
- customer request,
- follow-up,
- idea,
- promise.

**Acceptance criteria**

- Capture remains usable without choosing a category or related record.
- A capture can later become multiple semantic types.
- Original audio/transcript/photo remains preserved.
- UI language does not bias users toward promise-only capture.

### Needs Attention

**Classification:** KEEP architecture; REFINE prioritization and actionability.

**Existing good plumbing**

The current implementation already identifies multiple meaningful operational conditions, including:

- Completed work awaiting billing
- Jobs with no next visit
- Unattached receipts
- Untagged mileage
- Draft invoices
- Estimates requiring follow-up
- Deposits needing collection
- Material ordering needs
- Pending requests
- Overdue invoices
- Job/visit exception lanes
- Customer reports
- Customer promises

Preserve this detection infrastructure.

**REFINE PRIORITIZATION**

Current ordering is primarily based on broad tone categories:

- danger
- warning
- default

Replace or augment this with a business-priority model.

Priority should consider:

- Customer commitment / promise
- Money at risk or collectible
- Due date / lateness
- Work blocked
- Scheduling consequence
- Operational cleanup importance

Do not allow low-consequence housekeeping to compete visually with high-value or time-sensitive obligations merely because both share the same warning tone.

**Desired presentation**

Where possible, present the actual action rather than only a category destination.

Examples:

- Send Smith final invoice — $2,850
- Schedule return visit — Jones bathroom
- Call Miller — promised today
- Order materials — Brown deck, visit Monday

Prefer resolution in context over routing to a generic list.

**Acceptance criteria**

- Highest-consequence actionable items rise first.
- Priority is explainable.
- Clicking an item takes the user as close as possible to resolving it.
- "All clear" means there is no meaningful unresolved operational obligation.

### Day Review

**Classification:** REFINE heavily; preserve reconciliation engines.

**Existing good plumbing**

The current implementation already contains valuable separate engines/data for:

- Captured commitments
- GPS stop interview
- Day Draft
- Production Story
- Visit history
- Time
- Mileage
- Company-day summary
- Day-close checklist

Do not discard these engines.

**Problem**

The current UI exposes too many reconciliation mechanisms individually.

This creates an end-of-day interview instead of an exception review.

**Required redesign**

Day Review should lead with:

AI-FSM reconciled what it could. These are the items that still need you.

Use confidence-based behavior:

**High confidence**

- Pre-resolve/pre-fill.
- Collapse into a summary.
- Allow optional inspection.

Example:

12 items matched automatically ✓

**Medium confidence**

Ask for a fast confirmation.

Example:

Lowe's · 24 min · $73.42 receipt
Looks like a material run for Smith Residence.
Confirm / Change

**Low confidence**

Ask one focused question.

Example:

2:14–3:02 PM · 18 Main St
What was this stop for?

**Required vs optional**

Visually distinguish:

- Needs You
- Already Handled / Review if desired

**Resume behavior**

Persist review progress.

If interrupted, reopening Day Review must return to the next unresolved item.

**Target**

A normal well-captured workday should often require approximately 30 seconds of active review.

**Acceptance criteria**

- High-confidence reconciliations do not require repetitive confirmation.
- The user sees unresolved exceptions before detailed logs.
- Detailed visits/time/mileage remain inspectable.
- Review progress persists.
- Day Review does not require the user to reconstruct information AI-FSM already knows.

### Audit takeaway

These screens demonstrate the broader modernization strategy:

Do not rebuild AI-FSM simply to make it feel simpler. Preserve the intelligence, hide the machinery, and reduce the number of decisions Nick has to make.

This should be applied to every remaining screen in the audit.

---

## 27. Code Audit — Delta-Only Findings

From this point forward, code audit notes must not restate the product design brief.

For each screen, record only:

- **Already aligned** — current implementation already satisfies the brief; preserve it.
- **Conflict** — current implementation directly contradicts the brief.
- **Missing** — the brief requires behavior that is not present.
- **Unknown / verify** — code inspected so far is insufficient to determine compliance.

Do not rewrite the intended UX unless a code-specific difference requires clarification.

The purpose of the remaining audit is: find implementation gaps, not redesign screens already designed above.

Do not add another full design section for a screen already covered earlier in this brief.

### Intake — code delta

**Already aligned**

- Existing intake submission plumbing is reusable.
- Existing post-submit routing already supports Assessment / site visit, Book work, and Remote estimate.
- Read-back confirmation already exists.

**Conflict**

Current validation requires all of the following before advancing:

- service category,
- service description of at least 10 characters,
- preferred date,
- address.

This conflicts with the approved lightweight phone-intake design.

**Required code change**

Relax initial-capture validation so a request can be saved before category, preferred date, or address are known. Preserve those fields in the model; make them progressively completed instead of mandatory at first capture.

### Requests — code delta

**Already aligned**

- `getRequestGuidance` already calculates a recommended next step and reason.
- Request records are already linked to downstream Job/Visit/Estimate workflows.
- Duplicate detection and routing plumbing already exist.

**Conflict**

The request detail currently gives major visual weight to:

- pricing style,
- routing-path picker,
- funnel state,
- "Next Record",
- multiple status-management buttons.

This conflicts with the approved one-obvious-next-action hierarchy.

**Required code change**

Do not replace `getRequestGuidance`. Reorder the UI so its recommendation and primary action dominate. Move pricing/routing/status administration into secondary disclosure.

Replace owner-facing "Next Record" language with the human action represented by that record.

---

## 28. Code Audit — Schedule

**Already aligned**

- Owner/admin and technician schedules are role-scoped.
- Week, month, and year calendar views exist.
- Owner/admin have an additional list/triage view.
- Mobile-specific week/month rendering exists.
- Quick booking is available from the calendar.
- Visit cards already link directly to the Visit.
- Owner/admin can drag a Visit to another date.
- Rescheduling preserves the existing Visit duration.
- Existing Quick Book plumbing can create/select customer, property, Job, Visit, assignment, date, time, and duration in one flow.

Preserve these capabilities.

**Conflict / risk — rescheduling has no schedule-safety check**

Current drag/drop behavior:

1. User drags a Visit to a target date.
2. UI calculates the same clock time and duration on that date.
3. UI optimistically moves the Visit.
4. `PATCH /api/v1/visits/[id]` writes the new start/end values.

The inspected Visit PATCH route validates field shape and permissions but does not check for:

- overlapping Visits for the assigned technician,
- double booking,
- impossible travel gaps,
- another Visit occupying the same time,
- schedule-capacity warnings.

**Required change**

Before treating a reschedule as successful, run schedule-conflict evaluation.

Minimum:

- detect overlapping Visit times for the assigned user,
- warn when the proposed slot conflicts.

Preferred:

- also evaluate travel feasibility when enough property/location data exists.

The system may allow an owner to override a warning, but it must not silently present a conflicting schedule as valid.

Example:

Schedule conflict
Smith Residence is already booked 9:00–11:00 AM.

Options:

- Choose another time
- Move anyway

Do not silently reject legitimate owner overrides.

**Schedule card hierarchy — refine**

Current Visit cards emphasize:

- Job title
- Customer
- Time
- Tech

`property_address` is loaded by the schedule query but is not prominent in the inspected Visit card.

For a field-service schedule, the card should make the destination identifiable quickly.

Recommended card hierarchy:

- Time
- Customer / recognizable Job name
- Property/address
- Assigned technician when relevant
- status only when it changes what the user needs to know

Do not overload compact month cards; use the full information in week/mobile detail surfaces.

**Quick Book — preserve but treat as an exception path**

Quick Book is powerful and should remain.

It currently supports creating/selecting:

- client,
- house/property,
- Job title/type,
- date,
- time,
- duration,
- assigned user,
- notes.

This should remain the fast path for genuinely known work.

However, Quick Book must not become the default replacement for Intake when the scope is still uncertain.

Product distinction:

- Customer called with uncertain/new work → Intake / Request
- Known work that simply needs a calendar slot → Quick Book

Avoid creating duplicate Jobs merely because the owner used the calendar as the starting point.

**Missing — schedule intelligence**

The current calendar is primarily a Visit display/edit surface.

Future schedule intelligence should progressively surface:

- unscheduled approved work,
- Jobs that need a return Visit,
- Visits missing required materials,
- likely overbooked days,
- excessive drive/travel patterns,
- technician assignment conflicts.

Do not turn Schedule into another Needs Attention page. These should appear as contextual scheduling cues.

**Acceptance criteria**

- Dragging a Visit cannot create an unnoticed technician overlap.
- Owner can deliberately override a warning when appropriate.
- Calendar cards identify where the user is going without opening every Visit.
- Quick Book remains fast for known work.
- Intake remains the preferred path for uncertain new customer work.
- Schedule intelligence appears in context rather than as another administrative dashboard.

---

## 29. Deposit Policy — Revised Decision

The earlier audit correctly identified that the existing model of one mandatory global deposit percentage is too rigid. The replacement should not discard percentage deposits.

### Approved direction

Use a percentage deposit as the normal business default, with a per-estimate override for Materials Only.

### Settings

Store:

- Default deposit percentage
- Default deposit wording

Example:

Default deposit: 30%

This percentage should prefill new estimates unless the estimate uses a different deposit mode.

### Estimate Deposit Control

Each estimate should support:

- **Percentage** — default; prefilled from business settings
- **Materials Only** — override for jobs where scheduling deposit should cover materials rather than a percentage of total
- **No Deposit** — explicit exception
- **Custom Amount** — available for unusual cases, but secondary

Do not force the owner to manually calculate the deposit.

### Recommended UI

Prefer a simple deposit-mode selector rather than an ambiguous checkbox that can conflict with the percentage field.

Example:

Deposit

- Percentage: 30%
- Materials Only
- No Deposit
- Custom

When Percentage is selected:

- show/edit percentage.

When Materials Only is selected:

- disable/hide percentage input.
- calculate the deposit from the estimate's customer-facing material amount according to the configured material-pricing policy.
- update automatically if material scope changes before approval.

When No Deposit is selected:

- deposit = $0.

When Custom is selected:

- allow explicit dollar amount with a reason/note if useful.

### Important implementation rule

The selected deposit mode and calculated amount must be snapshotted on the approved estimate.

Later changes to company defaults must never rewrite an already-approved estimate.

### Customer-facing output

Show only the actual selected policy.

Examples:

- 30% deposit due at scheduling: $1,050
- Materials deposit due at scheduling: $684

Do not show unused deposit options to the customer.

### Why this is better

- Keeps percentage deposits easy and consistent.
- Supports the existing Dovetails materials-only workflow without fighting the system.
- Avoids changing global Settings every time one job needs a different deposit structure.
- Keeps deposit behavior auditable at the estimate level.

### Acceptance criteria

- Business Settings defines a default percentage.
- New estimates inherit that percentage.
- Owner can switch an individual estimate to Materials Only, No Deposit, or Custom without changing company defaults.
- Deposit amount recalculates correctly before estimate approval.
- Approved estimate snapshots mode, rate/amount, and customer-facing wording.
- Changing business defaults does not alter historical approved estimates.

---

## 30. Business / Reports / Settings — Confirmed Code Deltas

### Pricing Health uses the wrong minimum source

**Confirmed**

Reports → Pricing Health imports `MINIMUM_SERVICE_FEE_CENTS` from the domain constants.

The actual editable business rule lives in `business_pricing_settings.minimum_service_fee_cents`.

The report queries for below-minimum estimates, low-value job ratio, override counts, and displayed minimum currently use the domain constant rather than the account setting.

**Required fix**

Reports must load the account's active pricing settings and use the configured minimum service fee.

Domain constants should remain fallback/default values only.

### Revenue (Paid) KPI is semantically incorrect

**Confirmed**

The current monthly report:

- selects invoices created in the selected month,
- sums `paid_cents` on those invoices,
- labels the result Revenue (Paid).

That is not equivalent to cash received during the selected month.

Example:

- Invoice created September 28
- Customer pays October 3

The October payment is not counted in October Revenue (Paid) under the current query.

**Required fix**

Separate:

- **Invoiced Revenue** — invoice value created/earned according to the chosen accounting definition
- **Cash Collected** — payment records received during the selected period

Use `payments.received_at` for cash-collected reporting.

Do not label invoice-row `paid_cents` as monthly cash received unless the date basis actually matches.

### Outstanding AR KPI is scoped incorrectly

**Confirmed**

The current Outstanding AR value is calculated only from invoices created in the selected month.

Older unpaid invoices are excluded.

**Required fix**

If the card is labeled Outstanding AR, it should show the current total open receivable balance regardless of invoice creation month.

If a month-scoped measure is useful, label it explicitly, such as:

Open balance on invoices created this month

Do not use the broader Outstanding AR label for a month-created subset.

### Month-End Close can falsely report clean AR

**Confirmed**

The checklist item "No outstanding invoices (sent / partial / overdue)" only checks invoices whose `created_at` falls within the selected month.

An unpaid invoice from a prior month can therefore exist while Month-End Close reports no outstanding invoices.

**Required fix**

Month-End Close should distinguish:

- open invoices created in the period,
- total open AR across all periods,
- optionally prior-period receivables.

Closing a period must not imply that company receivables are clean when older unpaid invoices remain.

### Month reporting has a timezone-boundary risk

**Confirmed**

Several report queries use `to_char(timestamp_column, 'YYYY-MM')`.

The application already has explicit business-timezone helpers, but these report queries do not explicitly convert timestamps into the business timezone before month grouping/filtering.

**Required fix**

Define one canonical reporting-period helper / SQL convention.

For timestamp fields, convert using the business timezone before deriving the month, or use explicit UTC boundaries generated from the business-local month.

Date-only fields such as `expense_date` and `session_date` do not require timestamp timezone conversion.

**Acceptance test**

An event at 11:30 PM Eastern on the last day of a month must remain in that business month even if its UTC timestamp is in the next calendar month.

### Travel Settings exposes an ignored field

**Confirmed**

When `travel_time_rate_mode = standard_labor`, the travel calculation correctly loads the active Labor & Pricing billing rate.

However, the Settings UI still shows an editable separate travel-time rate.

That number is ignored while Standard Labor is selected.

**Required fix**

When mode is:

- Standard labor rate → show the linked Labor & Pricing rate as read-only / derived.
- Custom → show editable custom travel rate.
- None → hide/disable rate.

Do not present an editable value that is not being used.

### Material handling and card-fee rules are not part of editable Pricing Settings

**Confirmed gap**

Current editable pricing settings include:

- internal labor cost,
- customer labor rate,
- margin floor,
- MA premium,
- minimum service fee,
- half-day rate,
- full-day rate.

The current business-rule layer still contains a material-handling constant, while the Pricing Settings form does not expose material handling.

No equivalent account-level card-fee rule was found in the inspected pricing/settings surfaces.

**Required direction**

Move business-adjustable financial policies into an account-level source of truth.

At minimum support:

- material handling percentage,
- card processing/customer card-fee policy if legally/operationally used,
- effective-date/versioning or snapshot behavior where historical estimates/invoices must remain unchanged.

Do not require the owner to change code constants to change an operating policy.

### "Schedule Utilization" is mislabeled

**Confirmed**

The report section currently computes:

- scheduled visit count,
- completed visit count,
- cancelled visit count,
- total visits divided by 4 as Avg / week.

It does not calculate available labor capacity, booked hours, available hours, technician capacity, or percentage utilized.

Therefore it is not schedule utilization.

**Required fix**

Either:

**Option A — Rename current metric**

Use a label such as:

- Visit Volume
- Schedule Activity
- Visits per Week

or

**Option B — Build real utilization**

Example: booked productive hours / available productive hours

Potential inputs:

- technician working capacity,
- scheduled visit duration,
- blocked/non-working time,
- owner/tech availability.

Do not call visit count "utilization."

### "Tech Performance" is currently visit completion only

**Confirmed**

The current section calculates completed visits / all assigned visits in the selected month and colors it as a performance score.

This is useful operational data, but it is not sufficient to represent overall technician performance.

Cancelled/rescheduled visits may also reduce the rate even when the technician was not responsible.

**Required fix**

Either:

- rename the current section to Visit Completion, or
- build a genuine technician scorecard with carefully defined measures.

Do not create a punitive employee metric from ambiguous operational states.

Potential future technician measures should be independently defined, such as:

- productive hours,
- estimated vs actual production,
- callbacks/rework,
- documentation completion,
- on-time arrival,
- customer issues,
- gross contribution where appropriate.

Each metric must be explainable and must not silently combine unrelated signals into one score.

### Reports design rule

A financial or operating metric must mean exactly what its label says.

For each report card:

- Define the business question.
- Define the event/date basis.
- Define the denominator where applicable.
- Define whether it is period-scoped or current snapshot.
- Make the label reflect that definition.
- Add an automated test for month boundaries and historical carryover where relevant.

---

## Later audits

Append the next unaudited screen below this line. Use only the delta format from section 27: Already aligned, Conflict, Missing, Unknown / verify. Do not restate sections 1–25.
