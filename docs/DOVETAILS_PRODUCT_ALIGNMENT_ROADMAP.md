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

Still needed:

- Rename or align `Optional` to the business-facing label `Optional Improvements` where appropriate.
- Add formal document-standard constants:
  - document types
  - document statuses
  - filename format rules
- Add formal pricing adjustment constants:
  - bundle credit
  - member credit
  - promo
  - travel surcharge
  - risk adjustment
  - return-trip charge
  - coordination fee

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
- Existing estimate pricing already supports:
  - 15% materials handling
  - 30% deposit
  - labor/material/handling line-item types
  - painting square-foot logic
  - margin review warnings
- Existing price book already has service code families and tiers.

Still needed:

- Enforce `$150` minimum service fee unless:
  - bundled
  - membership-included
  - promo
  - owner-approved
- Add estimate risk/modifier fields:
  - one-trip vs multi-trip
  - drying/curing required
  - difficult access
  - old-house risk
  - premium finish expectation
  - coordination burden
  - travel surcharge
  - risk adjustment
- Add typed adjustments:
  - bundle credit
  - member credit
  - promo
  - travel surcharge
  - risk adjustment
  - return-trip charge
  - coordination fee
- Upgrade price book records with:
  - default trip count
  - return-trip flag
  - additional-unit pricing
  - material inclusion rule
  - risk flags
- Add pre-send pricing review gate.

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
- Add document filename generator:
  - `YYYY-MM-DD_CLIENTLASTNAME_JOBTYPE_DOCTYPE_STATUS`
- Add document status:
  - Draft
  - Sent
  - Approved
  - Final
  - Superseded
  - Archived
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

- Visit schema now has:
  - membership visit phase
  - included labor cap minutes
  - included labor minutes used
  - cap status
- Generated membership visits inherit the plan labor cap.

Still needed:

- Split visit UI into:
  - Phase 1: Health Check
  - Phase 2: Included Action
- Add technician controls for labor minutes used.
- Add cap-reached workflow.
- Convert remaining items into:
  - quoted follow-up
  - monitor item
  - referral
  - optional improvement
- Require same-day/next-day visit snapshot.
- Add report categories:
  - work completed
  - Fix Now
  - Monitor
  - Optional Improvements
  - Refer
  - next steps

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

1. Pricing minimums and estimate review gate.
2. Membership visit workflow and labor-cap controls.
3. Client visit snapshot report.
4. Digital Home Vault foundation.
5. Document naming/archive/master-template controls.
6. Job intake and calendar protection.
7. Realtor/concierge/routing workflows.
8. Dashboards and enforcement.

## Next Suggested Release

Highest-leverage next release:

- Enforce the `$150` minimum service fee on estimates.
- Add estimate risk fields.
- Add pre-send estimate review gate.
- Add document filename generator.

Reason:

These changes protect margin and document quality before more data-heavy vault work begins.

## Update Rule

After every shipped phase:

1. Add the PR number, merge commit, deploy date, and migration name if applicable.
2. Move completed items from `Still needed` to `Done`.
3. Update the phase status.
4. Add any known blockers or operational notes.
