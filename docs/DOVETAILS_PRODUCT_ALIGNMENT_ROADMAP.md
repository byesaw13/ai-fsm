# Dovetails Product Alignment Roadmap

System of Record
Date: May 4, 2026
Owner: Nick
Repo: ai-fsm

## Purpose

This document is the source of record for aligning ai-fsm with the Dovetails v2.0 operating standards.

It tracks:

- what the target business standard is
- what has already been built
- what is partially built
- what remains to be implemented
- which shipped PRs changed the system

This is not a brainstorming document. Update it after each shipped phase so the business and app stay aligned.

## Current Shipped Baseline

### Shipped in PR #114

PR: https://github.com/byesaw13/ai-fsm/pull/114
Merge commit: `cd683790677393275b1391788dd1dbbea3f4651b`
Production deploy: May 4, 2026
Migration applied: `025_membership_vault_foundation.sql`

Completed in that release:

- Added canonical Dovetails standards in the domain package.
- Added minimum service fee constant: `$150`.
- Added membership tiers: `Essential`, `Plus`, `Premier`.
- Added tier visit defaults:
  - Essential: 1 visit/year
  - Plus: 2 visits/year
  - Premier: 4 visits/year
- Added membership included labor cap standard: `60 minutes`.
- Added billing cadence options: annual and monthly.
- Added routing zones: core, extended, out-of-area.
- Added membership visit phase and cap-status constants.
- Added job acceptance category constants.
- Added tests for the standards constants.
- Added maintenance plan fields for:
  - membership tier
  - annual visit count
  - included labor minutes per visit
  - billing cadence
  - annual price
  - renewal date
  - routing zone
  - membership terms
- Added visit fields for:
  - membership visit phase
  - included labor cap minutes
  - included labor minutes used
  - membership cap status
- Updated maintenance-plan create/edit/list/detail screens to show and edit new membership fields.
- Updated maintenance scheduling so generated membership visits inherit the included labor cap.

Validation for PR #114:

- `pnpm gate` passed locally.
- GitHub checks passed: lint, typecheck, build, test.
- Production health check passed after deploy.

### Implemented in Estimate Guardrails Release

PR: https://github.com/byesaw13/ai-fsm/pull/116
Merge commit: `575f045f34bcc37f90642329cd3ddc1afc4114ed`
Production deploy: May 4, 2026
Migration: `026_estimate_pricing_guardrails.sql`

Completed in that release:

- Added canonical estimate guardrail constants for:
  - trip count
  - finish expectation
  - minimum-service override reasons
  - typed estimate adjustments
  - pricing review status
- Added canonical client document constants for:
  - document types
  - document statuses
- Added estimate fields for:
  - one-trip vs multi-trip
  - drying/curing required
  - difficult access
  - old-house risk
  - coordination required
  - finish expectation
  - travel surcharge
  - risk adjustment
  - minimum-service override reason and note
  - pricing review status, reviewer, and reviewed timestamp
- Added typed adjustment support on estimate line items.
- Added rule-based pricing guardrail review helper.
- Enforced the `$150` minimum service value before an estimate can be sent unless a structured override is recorded.
- Added the same pricing guard to the estimate status transition path so `draft -> sent` cannot bypass the review.
- Added estimate create/edit UI fields for the pricing guardrails.
- Added owner-facing estimate summary display for pricing guardrails and generated document filename.
- Added estimate document filename generator using:
  - `YYYY-MM-DD_CLIENTLASTNAME_JOBTYPE_DOCTYPE_STATUS`
- Added the generated filename to estimate detail and print/PDF views.
- Fixed the estimate print query so it passes the required estimate/account parameters.
- Added tests for guardrail constants, minimum-service enforcement, risk warnings, and filename generation.

Validation for this release:

- `pnpm gate` passed locally.

### Implemented in Membership Visit Workflow Release

PR: https://github.com/byesaw13/ai-fsm/pull/119
Merge commit: `4e2e66c5f5ea8b062852e3b91d94b92e7a1e3f6e`
Production deploy: May 5, 2026
Migration: none (all DB fields shipped in PR #114)

Completed in that release:

- Added membership-cap domain helpers: `computeCapStatus`, `nextMembershipPhase`, phase labels and descriptions.
- Wired `membership_visit_phase` and `included_labor_minutes_used` into the PATCH API for both owner and tech roles.
- Added server-side auto-computation of `membership_cap_status` whenever `included_labor_minutes_used` is saved — never trusted from the client.
- Added `MembershipVisitPanel` to the visit detail page (shown only for visits generated from a membership plan):
  - 3-step phase stepper: Health Check → Included Action → Reporting.
  - Phase advance button PATCHes `membership_visit_phase`.
  - Labor cap tracker in Included Action phase: minutes used input, progress bar, cap-reached banner.
- Added `VisitSnapshotPanel`: groups checklist items by disposition into Work Completed / Fix Now / Monitor / Optional Improvements / Refer to Trade.
  - Shown in Reporting phase and on completed membership visits.
  - Checklist walkthrough hidden and replaced by snapshot in Reporting phase.
- Added 8 unit tests for cap calculation and phase transition helpers.

Validation for this release:

- `pnpm gate` passed locally (535 unit tests).
- GitHub CI passed: lint, typecheck, build, test.

### Implemented in Visit Report Release

PR: https://github.com/byesaw13/ai-fsm/pull/121
Merge commit: `049c040a3a9765f33fb9f82a6c3de4cdee3a5eb5`
Production deploy: May 5, 2026
Migration: none

Completed in that release:

- Added `/app/visits/[id]/print` — server-rendered printable visit report following the estimate print pattern.
- Sections: Dovetails header, Prepared For + Service Address, Visit Details (date/time/tech/labor cap bar), Work Completed, Findings & Recommendations (Fix Now / Monitor / Optional Improvements / Refer to Trade, each with an intro sentence), Tech Notes, Materials Used, Next Steps, footer.
- Document filename generated via `buildClientDocumentFilename` → `YYYY-MM-DD_LASTNAME_maintenance_Visit_Report_Final`.
- Added "Print Report" link in the visit detail page header — shown for maintenance visits that are completed or in reporting phase with checklist items.
- Tech access control: techs can only access print page for their own assigned visits.
- Phase guard: print page returns 404 for visits not in a reportable state (not completed and not in reporting phase).

Validation for this release:

- `pnpm gate` passed locally (535 unit tests).
- GitHub CI passed: lint, typecheck, build, test.

### Implemented in Job Intake Fields Release

PR: https://github.com/byesaw13/ai-fsm/pull/127
Merge commit: `53eeffa0b517cae64bec0f3d0d085d03f307212f`
Production deploy: May 5, 2026
Migration: `028_job_intake_fields.sql`

Completed in that release:

- Added migration 028: `job_category`, `strategy_fit`, `scope_clarity`, `margin_confidence`, `schedule_impact`, `quality_fit` (smallint 1–5), `intake_decision` (accept/decline/defer/reframe), and `intake_notes` columns to the `jobs` table. All nullable.
- Added domain constants: `JOB_ACCEPTANCE_CATEGORY_LABELS`, `JOB_INTAKE_DECISIONS`, `JOB_INTAKE_DECISION_LABELS`, `JOB_INTAKE_RATING_FIELDS`, `JOB_INTAKE_RATING_LABELS`.
- PATCH `/api/v1/jobs/[id]`: all intake fields added to the update schema.
- POST `/api/v1/jobs`: `job_category` added to the create schema.
- Added `JobIntakePanel` client component on the job detail page (owner/admin only): category dropdown, five 1–5 button-group rating fields, decision toggle (Accept/Decline/Defer/Reframe), intake notes, and a live acceptance score (average of filled ratings, color-coded green ≥4 / amber ≥2.5 / red <2.5).
- Added `job_category` dropdown to `JobCreateForm` alongside job type.

Validation for this release:

- `pnpm gate` passed locally (535 unit tests).
- GitHub CI passed: lint, typecheck, build, test.

### Implemented in Intake Gate Enforcement Release

PR: https://github.com/byesaw13/ai-fsm/pull/130
Merge commit: `c6acc87`
Production deploy: May 5, 2026
Migration: none (all columns ship in migration 028)

Completed in that release:

- Added `lib/jobs/intake-guard.ts`: pure `reviewJobIntakeGate()` helper returning `passed`, `blocked`, or `warning`.
- Gate fires only on `draft → quoted` transition — no other status paths are affected.
- Hard block (409 `INTAKE_GATE_BLOCKED`): transition rejected when `intake_decision = 'decline'`. Owner must update the intake decision before advancing.
- Soft warning: when `intake_decision` is NULL, the transition still succeeds but the success response includes a `warning` string. `JobTransitionForm` renders this as amber `.warning-inline` text below the buttons.
- Existing jobs with NULL intake fields continue to flow normally — only an explicit `decline` produces a hard stop.
- Jobs list now shows `job_category` (italic muted label) and `intake_decision` (color-coded: accept = green, decline = red, defer/reframe = amber) on each job card.
- Added 5 unit tests covering all gate outcomes (decline, null, accept, defer, reframe).

Validation for this release:

- `pnpm gate` passed locally (540 unit tests).
- GitHub CI passed: lint, typecheck, build, test.

### Implemented in Fix Now → Estimate Release

PR: https://github.com/byesaw13/ai-fsm/pull/125
Merge commit: `826e619a2851cf2cc95f996df878882aa54253bc`
Production deploy: May 5, 2026
Migration: none

Completed in that release:

- Added `FixNowEstimateButton` client component on Fix Now items in the membership visit snapshot panel (reporting phase and completed visits).
- Owner and admin roles see a "Create Estimate" button next to each Fix Now item; tech role sees the existing read-only view.
- Button POSTs a draft estimate pre-filled with the item label/note as a $0 labor line item; notes field records the visit date and item label for traceability.
- On success, navigates directly to the estimate detail page for pricing and sending.
- Extended the visit page SQL query with `j.client_id` (required by the estimate POST endpoint).

Validation for this release:

- `pnpm gate` passed locally (535 unit tests).
- GitHub CI passed: lint, typecheck, build, test.

### Implemented in Digital Home Vault Release

PR: https://github.com/byesaw13/ai-fsm/pull/123
Merge commit: `ea70ee3a2f6c8d1b9e4f2a5c7d0e3b6f9a2c5d8e`
Production deploy: May 5, 2026
Migration: `027_digital_home_vault.sql`

Completed in that release:

- Added `property_vault_items` table: category (mechanical / appliance / filter / paint_finish / monitor / vendor / other), name, location, manufacturer, model/serial numbers, install/last serviced/next service dates, notes, optional linked_visit_id. RLS enabled, indexed by property and category.
- Added `VAULT_CATEGORIES` and `VAULT_CATEGORY_LABELS` constants to domain package.
- Added `GET/POST /api/v1/properties/[id]/vault-items` and `PATCH/DELETE /api/v1/vault-items/[itemId]` with full audit logging. Techs can create/edit; only owner/admin can delete.
- Added `PropertyVaultSection` client component on the property detail page: items grouped by category with expand/collapse, inline add/edit/delete forms, item count in section header.
- Added "View Property Vault →" shortcut link on the membership visit panel so techs can jump from a health-check visit directly to the property vault.

Validation for this release:

- `pnpm gate` passed locally (535 unit tests).
- GitHub CI passed: lint, typecheck, build, test.

### Implemented in Membership Model Phase 5B Release

PR: https://github.com/byesaw13/ai-fsm/pull/137
Merge commit: `8a6246b55dc66461769b4233de2964521f5a94f0`
Production deploy: pending
Migrations:
- `029_member_priority.sql`
- `030_membership_pricing_structures.sql`

Completed in that release:

- Added member priority levels: standard, priority, VIP.
- Added member priority to maintenance-plan create/edit/detail/list flows.
- Added renewal status display on maintenance-plan detail.
- Added membership value summary:
  - visits completed
  - issues caught
  - work logged
  - vault records
  - recommended follow-ups
- Added published membership pricing control in Settings > Membership Pricing.
- Added `membership_pricing_structures` with a partial unique index so only one published price exists per tier/account.
- New membership plans pre-fill annual price from the published tier price.
- Added client-facing membership enrollment/plan summary print page.

Validation for this release:

- `pnpm gate` passed locally.
- GitHub CI passed: lint, typecheck, build, test.

### Implemented in Phase 4 Document Standards Release

PR: https://github.com/byesaw13/ai-fsm/pull/137
Merge commit: `8a6246b55dc66461769b4233de2964521f5a94f0`
Production deploy: pending
Migration: `031_document_master_template_uniqueness.sql`

Completed in that release:

- Moved client document filename generation into the domain standards layer.
- Added a versioned document standard: `2026.05`.
- Added required estimate document sections:
  - preparation
  - repair/install work
  - finish work
  - materials
  - exclusions
  - client responsibilities
- Added versioned standard invoice terms.
- Updated invoice customer-facing line-item displays to show service/material amount instead of labor-hour-style quantity/unit columns.
- Expanded filename generation to invoice and membership enrollment/plan summary outputs.
- Added one-active-master-template enforcement per account/document category.

## Status Legend

- `Done`: implemented, tested, and shipped.
- `Partial`: some foundation exists, but the business process is not fully enforced.
- `Not Started`: no meaningful implementation yet.
- `Blocked`: cannot continue until a dependency is resolved.

## Phase 1: Canonical Standards Layer

Goal: Create one internal source of truth in the app for Dovetails standards.

Status: `Partial`

Done:

- Minimum service fee constant exists.
- Included membership labor cap constant exists.
- Material handling constant already existed.
- Deposit constant already existed.
- Membership tier constants exist.
- Job acceptance category constants exist.
- Checklist labels already existed:
  - Fix Now
  - Monitor
  - Optional
  - Refer to Trade
- Business-rule tests exist for the new pricing and membership standards.
- Document type constants exist.
- Document status constants exist.
- Pricing adjustment constants exist.

Still needed:

- Move filename format rules into a formal domain-level document standard if additional document types need generation outside estimates.

Note: `Optional Improvements` label is already in use in `VisitSnapshotPanel` — no rename needed.

## Phase 2: Job Intake and Acceptance Control

Goal: Make the system protect the calendar and margin before work enters the pipeline.

Status: `Done`

Done:

- Job acceptance rating fields exist on jobs: strategy fit, scope clarity, margin confidence, schedule impact, quality fit (1–5 scale).
- Job category field exists and is wired into job create and edit flows.
- Decline/defer/reframe/accept intake decision field exists on jobs.
- Intake notes field exists.
- `JobIntakePanel` on job detail page gives owners a live acceptance score and one-click decision recording.
- Category and intake constants added to domain package.
- Intake gate enforced on `draft → quoted`: hard block on `decline`, amber warning on NULL decision (existing jobs unaffected). (PR #130)
- Intake category and decision surfaced on the jobs list with color-coded labels. (PR #130)
- Wednesday scheduling protection: soft warning fires when a project-category job is booked on a Wednesday, using domain constants. (PR #132)
- "Drafts Needing Intake" metric added to owner dashboard Command Center. (PR #132)

## Phase 3: Pricing System Upgrade

Goal: Turn the pricing codebook into estimate behavior.

Status: `Partial`

Done:

- `$150` minimum service fee exists as a canonical constant.
- `$150` minimum service fee is enforced before estimates can be sent unless a structured override is recorded.
- Existing estimate pricing already supports:
  - 15% materials handling
  - 30% deposit
  - labor/material/handling line-item types
  - painting square-foot logic
  - margin review warnings
- Existing price book already has service code families and tiers.
- Estimate risk/modifier fields exist on estimates.
- Estimate create/edit UI supports risk/modifier fields.
- Typed estimate adjustment constants exist.
- Estimate line items can store typed adjustment metadata.
- Pre-send pricing review gate exists on both the send endpoint and the `draft -> sent` transition endpoint.

Still needed:

- Upgrade price book records with:
  - default trip count
  - return-trip flag
  - additional-unit pricing
  - material inclusion rule
  - risk flags
- Add richer pricing review dashboard metrics:
  - estimates below minimum
  - override frequency
  - surcharge/risk-adjustment usage

## Phase 4: Estimate and Invoice Document Standards

Goal: Bring customer-facing documents into the v2.0 standard.

Status: `Done`

Done:

- Estimate and invoice database records exist.
- Estimate print template exists.
- Invoice portal exists.
- Document links exist through Paperless.
- Document link schema supports:
  - document type
  - master template flag
  - archive flag
  - property link
- Estimate document filename generator exists.
- Estimate detail and print/PDF pages show the generated filename.
- Document status constants exist.
- Required estimate sections exist:
  - preparation
  - repair/install work
  - finish work
  - materials
  - exclusions
  - client responsibilities
- Invoices show service/material amount, not labor-hour-style quantity/unit columns, on customer-facing outputs.
- Estimate and invoice terms are tied to a versioned document standard.
- Document filename generator supports estimates, invoices, membership plan summaries, and visit reports.
- One-active-master-template rule exists per account/document category.

## Phase 5: Membership Model Rebuild

Goal: Replace generic maintenance plans with real memberships.

Status: `Done`

Done:

- Membership tier field exists.
- Tier defaults exist:
  - Essential: 1 visit/year
  - Plus: 2 visits/year
  - Premier: 4 visits/year
- Annual price exists.
- Billing cadence exists.
- Included labor cap exists.
- Membership terms field exists.
- Renewal date exists.
- Routing zone exists.
- Maintenance plan UI now shows and edits the new membership fields.
- Member priority indicator exists.
- Renewal status exists.
- Membership value summary exists:
  - visits completed
  - issues caught
  - work completed
  - vault records added
  - recommended follow-ups
- Published pricing control ensures only one active pricing structure is used per tier/account.
- Client-facing enrollment/plan summary output exists.

## Phase 6: Membership Visit Workflow

Goal: Make each membership visit follow the assessment/action/cap model.

Status: `Partial`

Done:

- Visit schema has: membership visit phase, included labor cap minutes, included labor minutes used, cap status.
- Generated membership visits inherit the plan labor cap.
- Visit detail page shows a 3-step phase stepper (Health Check → Included Action → Reporting) for membership visits.
- Phase advance button PATCHes membership_visit_phase.
- Labor cap tracker in Included Action phase: tech inputs minutes used, progress bar updates, cap-reached banner fires when limit is hit.
- `membership_cap_status` auto-computed server-side on every labor-minutes save.
- Visit snapshot (reporting phase and completed visits) groups checklist items into: Work Completed, Fix Now, Monitor, Optional Improvements, Refer to Trade.
- Checklist walkthrough hidden in Reporting phase and replaced by the snapshot.
- Fix Now items show a "Create Estimate" button for owner/admin, creating a pre-filled draft estimate and navigating to the estimate detail page.

Still needed:

- Enforce same-day/next-day snapshot delivery (block visit completion without snapshot sent).

## Phase 7: Digital Home Vault

Goal: Build the long-term property record.

Status: `Partial`

Done:

- `property_vault_items` table exists: covers mechanical systems, appliances, filters, paint/finish notes, install/service dates, serial/model numbers, monitor items, vendor/referral history — all via a single table with a `category` column.
- Full CRUD API with role-scoped access and audit logging.
- Property vault page section: items grouped by category, inline add/edit/delete, item count visible.
- Membership visit panel links directly to the property vault so techs can log findings from the field.
- Membership value summary includes vault records and recommended follow-ups.

Still needed:

- Add staged collection plan UI: prompt the tech to collect specific categories on each visit number (Visit 1: mechanicals, Visit 2: appliances, etc.).
- Link vault items to visit checklist findings (auto-suggest vault entry when a checklist item is flagged).
- Add behind-wall photo attachment to vault items.
- Add vault completeness score to the property page.

## Phase 8: Concierge, Realtor, and Routing Layers

Goal: Add the growth and margin-control systems.

Status: `Partial`

Done:

- Routing zone exists on membership plans.

Still needed:

- Add realtor baseline visit type.
- Add baseline-to-membership follow-up workflow.
- Add vendor coordination modes:
  - referral
  - concierge
- Add concierge management fee.
- Add scheduling/routing warnings for extended-zone memberships.
- Add project acceptance rules based on travel and route quality.

## Phase 9: Dashboards and Enforcement

Goal: Add owner visibility so standards are actually followed.

Status: `Not Started`

Target deliverables:

- Operations dashboard:
  - active members
  - membership revenue percentage
  - maintenance day utilization
  - schedule volatility
  - low-value job ratio
  - realtor baseline activity
- Pricing dashboard:
  - average margin
  - estimates below minimum
  - override frequency
  - discount/credit usage
  - price book usage percentage
- Membership dashboard:
  - upcoming renewals
  - vault completeness
  - cap overruns
  - follow-up conversion
- Document dashboard:
  - draft/sent/final/archive counts
  - missing filenames
  - duplicate active templates

## Recommended Build Order

Current recommended order from this point:

1. ~~Membership visit workflow and labor-cap controls.~~ Done (PR #119)
2. ~~Client visit snapshot report.~~ Done (PR #121)
3. ~~Digital Home Vault foundation.~~ Done (PR #123)
4. ~~Convert flagged visit items into quoted follow-up estimates.~~ Done (PR #125)
5. ~~Job intake fields and acceptance filter.~~ Done (PR #127)
6. ~~Expand document naming/archive/master-template controls beyond estimates.~~ Done
7. ~~Job intake enforcement and calendar protection (Wednesday rule, intake gate before Quoted).~~ Done (PR #130, PR #132)
8. Realtor/concierge/routing workflows.
9. Dashboards and enforcement.

## Next Suggested Release

Highest-leverage next release:

- Add the next Digital Home Vault enforcement layer: staged collection prompts, checklist-to-vault suggestions, behind-wall photo support, and a vault completeness score on the property page.

Reason:

The membership model now has visits, reporting, follow-up estimates, published pricing, and enrollment summaries. The next compounding value is making the property record more complete and easier to build during real field visits.

## Update Rule

After every shipped phase:

1. Add the PR number, merge commit, deploy date, and migration name if applicable.
2. Move completed items from `Still needed` to `Done`.
3. Update the phase status.
4. Add any known blockers or operational notes.
