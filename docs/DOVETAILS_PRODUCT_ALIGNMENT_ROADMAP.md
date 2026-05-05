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

- Rename or align `Optional` to the business-facing label `Optional Improvements` where appropriate.
- Move filename format rules into a formal domain-level document standard if additional document types need generation outside estimates.

## Phase 2: Job Intake and Acceptance Control

Goal: Make the system protect the calendar and margin before work enters the pipeline.

Status: `Not Started`

Target deliverables:

- Add job acceptance fields:
  - strategy fit
  - scope clarity
  - margin confidence
  - schedule impact
  - quality fit
- Add job category:
  - Membership Work
  - Realtor Baseline
  - High-Margin Project
  - Reactive / Low-Quality
- Add decline/defer/reframe status.
- Add warnings or owner override when a job fails the acceptance filter.
- Add Wednesday protection logic for maintenance/baseline work.
- Add schedule policy warnings for random project work on protected maintenance days.

Notes:

- Category constants were added in Phase 1, but they are not yet wired into jobs, forms, scheduling, dashboards, or acceptance enforcement.

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

Status: `Partial`

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

Still needed:

- Add required estimate sections:
  - preparation
  - repair/install work
  - finish work
  - materials
  - exclusions
  - client responsibilities
- Ensure invoices show labor/service cost, not labor hours, unless intentionally overridden.
- Add consistent estimate and invoice terms as versioned standards.
- Expand document filename generator to invoices, membership enrollment/plan summaries, and visit reports.
- Add one-active-master-template rule per category.

## Phase 5: Membership Model Rebuild

Goal: Replace generic maintenance plans with real memberships.

Status: `Partial`

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

Still needed:

- Add member priority indicator.
- Add renewal status.
- Add membership value summary:
  - visits completed
  - issues caught
  - work completed
  - vault records added
  - recommended follow-ups
- Add published pricing control so only one active pricing structure is used.
- Add client-facing enrollment/plan summary output.

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

Still needed:

- Convert flagged checklist items into quoted follow-up estimates from within the visit.
- Enforce same-day/next-day snapshot delivery (block visit completion without snapshot sent).

## Phase 7: Digital Home Vault

Goal: Build the long-term property record.

Status: `Not Started`

Target deliverables:

- Add vault tables for:
  - mechanical systems
  - appliances
  - filter sizes
  - paint/finish notes
  - install dates
  - serial/model numbers
  - recurring monitor items
  - behind-wall photos
  - vendor/referral history
- Add staged collection plan:
  - Visit 1: mechanicals
  - Visit 2: appliances
  - Visit 3: finishes/room notes
  - Visit 4: missing data and updates
- Add property vault page.
- Add vault update output after each membership visit.
- Link photos, visits, jobs, and documents into the property record.

Notes:

- Property pages currently show job and visit history, but they are not yet a structured Digital Home Vault.

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
3. Digital Home Vault foundation.
4. Convert flagged visit items into quoted follow-up estimates.
5. Expand document naming/archive/master-template controls beyond estimates.
6. Job intake and calendar protection.
7. Realtor/concierge/routing workflows.
8. Dashboards and enforcement.

## Next Suggested Release

Highest-leverage next release:

- Begin Digital Home Vault foundation: migration + vault tables for mechanicals, appliances, filter sizes, paint/finish notes, install dates, serial/model numbers, and recurring monitor items.
- Add property vault page showing vault records linked to the property.
- Add vault update output after each membership visit (prompt to log any new vault data found during the health check).

Reason:

The membership visit workflow and client-facing report are complete. The next compounding investment is the Digital Home Vault — it's the long-term differentiator for the membership product and the foundation for future visit-to-vault linking, follow-up conversion, and the membership value summary.

## Update Rule

After every shipped phase:

1. Add the PR number, merge commit, deploy date, and migration name if applicable.
2. Move completed items from `Still needed` to `Done`.
3. Update the phase status.
4. Add any known blockers or operational notes.
