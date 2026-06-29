# Dashboard Pipeline Cards

**Date:** 2026-06-29  
**Status:** Approved for implementation

## Problem

The admin dashboard action queue shows badge counts linked to filtered list pages. "Schedule Approved Jobs (3)" sends you to `/app/jobs` where you hunt for the right ones. The Estimate→Job handoff is the worst: an approved estimate may have no job yet, or a job with no visit — but the dashboard can't tell you which state you're in or give you the right next button.

## Goal

Make the dashboard action queue surface the actual items waiting for action — name, client, status, and one direct button — so the owner can process the pipeline without navigating into lists.

## Scope

Three action queue items become pipeline cards. Two stay as count badges.

### Pipeline cards (showing actual rows):

| Card | What it shows | Action button |
|---|---|---|
| Estimate → Job Handoff | Approved estimates: title, client, status tag ("No job yet" / "No visit yet") | "Create Job →" or "Schedule Visit →" direct link |
| Draft Invoices | Draft standard/final invoices: client, estimated amount | "Review →" link to invoice detail |
| Follow-Up Estimates | Sent estimates awaiting response: client, sent date | "View →" link to estimate detail |

Each card shows up to 5 rows, then a "see all →" link to the relevant filtered list page.

### Stays as count badge:

- **Schedule Approved Jobs** — already has a job; less acute, keep as badge
- **Collect Deposits** — keep as badge

## Data Changes

`apps/web/app/app/page.tsx` — replace 3 count-only queries with row-returning queries:

1. **Estimate→Job**: approved estimates where either no `job_id`, or `job_id` exists but no upcoming visit scheduled. Return: `estimate.id`, `estimate.title`, `job.id` (nullable), `client.name`, derived status tag. Limit 6 (5 displayed + overflow detection).

2. **Draft Invoices**: draft standard/final invoices. Return: `invoice.id`, `client.name`, `total_cents`. Limit 6.

3. **Follow-up Estimates**: sent, non-expired estimates. Return: `estimate.id`, `estimate.title`, `client.name`, `sent_at`. Limit 6.

## Component Changes

`apps/web/app/app/OwnerDashboard.tsx` — add a `PipelineCard` section replacing the 3 count-badge items. Each pipeline card:

- Header: card title + count badge
- Row list: up to 5 rows, each with name/client, status tag, action button
- Footer: "see all →" link (visible only if count > 5)

The existing `ActionQueue` component keeps the 2 remaining badge items (Schedule Approved Jobs, Collect Deposits).

## What Is Not Changing

- My Day (`/app/my-day`) — unchanged
- Role routing — unchanged
- Any other page, route, or data model — unchanged
- The `ApprovedHandoff` component on the estimate detail page — unchanged

## Success Criteria

1. Owner can see the 3 pipeline cards on the dashboard without navigating away
2. Each row has a direct action button that goes to the specific item (not a list)
3. Estimate→Job card correctly distinguishes "no job yet" from "job exists, no visit"
4. Cards with 0 items are hidden (same behavior as current zero-count badge items)
5. "see all →" link appears only when there are more than 5 items

## Out of Scope

- Role mode switcher / Field/Office toggle
- Property-centered timeline view (Phase 2 roadmap)
- Any My Day changes
- Mobile-specific layout optimization
