# Canonical Workflow Validation Report

Date: 2026-06-05

Authority:

- `docs/canonical/WORKFLOW.md`
- `docs/canonical/DOMAIN_MODEL.md`
- `docs/canonical/PRODUCT_VISION.md`
- Current implementation in `apps/web/app/app/**`

Scope: validate the current implementation as-is against the canonical workflow:

```text
Lead -> Client -> Property -> Estimate -> Job -> Visit -> Invoice -> History
```

No features were added. No pages were redesigned. No routes were created.

## Verdict

The workflow is executable without needing the product rethought, but it is not yet friction-free. The main breaks are at request conversion, visit-to-billing handoff, and the amount of contextual branching the user has to infer across request, job, and visit screens.

## Workflow Diagrams

### Canonical Path

```text
Lead
  -> Client
  -> Property
  -> Estimate
  -> Job
  -> Visit
  -> Invoice
  -> History
```

### Current Implementation Path

```text
Public booking / intake
  -> Requests queue
  -> Request detail
  -> Client page
  -> Property page
  -> Estimate detail
  -> Job page
  -> Visit detail
  -> Invoice detail
  -> Property history / client activity timeline
```

### Where The Flow Branches

```text
Request detail
  -> Fixed bid path
  -> Time and materials path
  -> Site visit path
  -> Duplicate / needs info / cancelled

Estimate detail
  -> Sent
  -> Approved
  -> Create job / schedule visit

Job detail
  -> Schedule visit
  -> Create estimate
  -> Create invoice
  -> Close out job

Visit detail
  -> Assessment
  -> Checklist / resolution / completion
  -> Follow-up estimate recommendation

Invoice detail
  -> Send
  -> Record payment
  -> Transition status
```

## Scenario Traces

### Scenario A: Small Handyman Repair

Goal: a small repair enters as a request, becomes a client/property record, becomes a job, gets executed in a visit, then gets invoiced and paid.

#### Pages Visited

1. `/booking` or `/app/intake/new`
2. `/app/requests`
3. `/app/booking-requests/[id]`
4. `/app/clients/[id]`
5. `/app/properties/[id]`
6. `/app/jobs/[id]`
7. `/app/jobs/[id]/visits/new`
8. `/app/visits/[id]`
9. `/app/invoices/new`
10. `/app/invoices/[id]`
11. `/app/properties/[id]` or `/app/clients/[id]` for history review

#### Buttons Clicked

- `New Request`
- `Choose Path`
- `Convert to T&M Job` or `Create Job`
- `+ Schedule Visit`
- `Start Job`
- `Complete Job`
- `+ Create Invoice`
- `Record Payment`

#### Records Created

- Booking request
- Client
- Property
- Job
- Visit
- Invoice

#### Records Updated

- Booking request status: `pending -> reviewed -> converted`
- Job status: `draft/quoted -> scheduled -> in_progress -> completed -> invoiced`
- Visit status: `scheduled -> arrived -> in_progress -> completed`
- Invoice status: `draft -> sent -> partial/paid`

#### Next-Step Prompts

- Request detail: `Choose Path`, `Create Job`, `Book Walkthrough`, `Open Job`
- Job page: `Next step: create an estimate`, `Deposit received - schedule the work`, `Work complete - send the final invoice`, or `View visits`
- Visit page: `Start Job`, `Complete Job`, `Open Assessment Form`, `Open Checklist`, `Open Summary`
- Invoice page: `Record Payment`, `Payment History`, `Transition Status`

#### Friction

- The request detail screen presents multiple branches before the user has a single canonical direction.
- Small repair work can bypass the estimate step, which is valid operationally but weakens the mental model of the canonical workflow.
- The user must understand that job completion and billing are separate steps on different pages.

### Scenario B: Multi-Visit Project

Goal: a larger fixed-bid project uses the estimate to job handoff and then schedules multiple visits.

#### Pages Visited

1. `/booking`
2. `/app/requests`
3. `/app/booking-requests/[id]`
4. `/app/clients/[id]`
5. `/app/estimates/new`
6. `/app/estimates/[id]`
7. `/app/jobs/[id]`
8. `/app/jobs/[id]/visits/new`
9. `/app/visits/[id]`
10. `/app/jobs/[id]` again for the next visit
11. `/app/invoices/new`
12. `/app/invoices/[id]`
13. `/app/properties/[id]`

#### Buttons Clicked

- `Start estimate`
- `Send Estimate`
- `Approve`
- `Schedule First Visit`
- `+ Schedule Visit`
- `Open Visit`
- `Create Invoice`

#### Records Created

- Booking request
- Client
- Property
- Estimate
- Job
- Multiple visits
- Invoice(s)

#### Records Updated

- Estimate status: `draft -> sent -> approved`
- Job status: `draft/quoted -> scheduled -> in_progress -> completed -> invoiced`
- Visit statuses for each visit
- Invoice status: `draft -> sent -> partial/paid`

#### Next-Step Prompts

- Estimate page approved banner: `Schedule First Visit`, `Go to job / manage visits`
- Job page banner: `Schedule Visit`, `View visits`, `Create Invoice`
- Visit page banner: `Open Actions`, `Open Checklist`, `Open Summary`, `Open Assessment Form`

#### Friction

- Approved estimate handoff is understandable, but the user still has to choose whether to go to the job or schedule directly from estimate detail.
- Multi-visit work is managed through both job and visit pages, which is clear once learned but not obvious at first glance.
- The job page carries a lot of commercial context in one place.

### Scenario C: Site Visit -> Estimate -> Approved Work

Goal: the request is routed to a walkthrough, the walkthrough produces an estimate, and the approved estimate becomes a job with scheduled work.

#### Pages Visited

1. `/booking`
2. `/app/requests`
3. `/app/booking-requests/[id]`
4. `/app/jobs/[id]` or `/app/visits/[id]` depending on conversion outcome
5. `/app/visits/[id]/assessment`
6. `/app/estimates/new`
7. `/app/estimates/[id]`
8. `/app/jobs/[id]`
9. `/app/jobs/[id]/visits/new`
10. `/app/visits/[id]`

#### Buttons Clicked

- `Book Walkthrough`
- `Open Assessment Form`
- `Create Estimate`
- `Send Estimate`
- `Approve`
- `Schedule First Visit`

#### Records Created

- Booking request
- Client
- Property
- Visit
- Estimate
- Job

#### Records Updated

- Request status: `pending -> reviewed -> converted`
- Visit status: `scheduled -> completed`
- Estimate status: `draft -> sent -> approved`
- Job status: `draft/quoted -> scheduled`

#### Next-Step Prompts

- Request detail: `Book Walkthrough`
- Visit detail: `Open Assessment Form`
- Visit detail after completion: `Create Estimate`
- Estimate detail after approval: `Schedule First Visit` or `Go to job / manage visits`

#### Friction

- Assessment is a separate sub-route, so the site-visit flow is split between visit detail and assessment detail.
- The estimate creation step depends on the user understanding that the visit completed successfully should lead into pricing, not immediately into billing.

### Scenario D: Completed Work -> Invoice -> Paid

Goal: work is already finished, billing is generated, payment is captured, and history is retained.

#### Pages Visited

1. `/app/jobs/[id]`
2. `/app/visits/[id]`
3. `/app/invoices/new`
4. `/app/invoices/[id]`
5. `/app/properties/[id]`
6. `/app/clients/[id]`

#### Buttons Clicked

- `Create Invoice`
- `Send to Client`
- `Record Payment`
- `Transition Status`

#### Records Created

- Invoice

#### Records Updated

- Invoice status: `draft -> sent -> partial -> paid`
- Job status: `completed -> invoiced`
- Property timeline receives the completed job / visit / invoice history entries

#### Next-Step Prompts

- Job page: `+ Create Invoice`
- Invoice page: `Record Payment`, `Payment History`, `View Estimate`
- Property page: service history and timeline entries show the completed work

#### Friction

- The user may have to move from job to invoice manually even when the work is obviously complete.
- The invoice page is strong, but the handoff from job completion to invoicing is a separate explicit action.

## Friction Points

### Dead Ends

- `/app/pipeline` is only a redirect and adds no user value.
- Deprecated recurring-plan routes are a parallel branch outside the canonical workflow.
- Legacy estimate response surfaces are separate from the client portal estimate flow.

### Duplicate Actions

- Requests are visible through both the main request queue and older request-detail links.
- Active work is presented through Today, Job detail, Schedule, and Visit list.
- Estimate health is visible in multiple places, which is useful for operations but easy to over-expose.

### Missing Prompts

- Client and property pages could be more explicit about the next canonical step when a user lands cold from a search or bookmark.
- Visit completion is clear inside the visit screen, but the billing handoff is not always surfaced there.
- Property history exists, but the relationship between completed work and the durable history record is not always framed as a single action.

### Confusing Terminology

- `Requests` and `booking-requests` still coexist in code paths and some direct links.
- `Job`, `Visit`, and `Work` are sometimes used as near-synonyms in prompts.
- `On My Way`, `Open Actions`, and `Start Job` are all valid, but they require context to distinguish.

### Unnecessary Clicks

- Request detail can force multiple branching decisions before the user gets to the canonical work object.
- Visit assessment is a separate route that interrupts the flow from visit execution to estimate creation.
- Job completion and invoice creation are separate screens, even in the obvious happy path.

### Places Users Can Get Stuck

- A request with no pricing mode yet.
- An approved estimate with no obvious visit scheduled.
- A completed visit with no obvious billing follow-up.
- A paid invoice with no clear property/history confirmation unless the user knows where to look.

## Workflow Breaks

- Approved estimate but no obvious next action if the user does not notice the estimate approved banner.
- Job with no scheduled visit still depends on the job page banner to expose the scheduling path.
- Completed visit can end without the user immediately moving to invoice creation unless they switch to the job page.
- Property history is present, but it is still a destination rather than a continuously reinforced hub.

## Workflow Scorecard

Scale: 1 = weak, 5 = clear and reliable.

| Step | Score | Notes |
|---|---:|---|
| Lead | 3 | Functional, but multiple intake and request surfaces still exist. |
| Client | 4 | Client 360 is strong and operationally useful. |
| Property | 4 | Property is a first-class object with timeline and history. |
| Estimate | 4 | Approved estimate handoff is clear, but still branchy. |
| Job | 4 | Good control surface for scheduling, commercial context, and closeout. |
| Visit | 4 | Strong execution screen, though assessment remains separate. |
| Invoice | 5 | Clear and complete billing flow with payment and status controls. |
| History | 4 | Property timeline is present and useful, but it is still a destination. |

## Quick Wins

1. Make the request detail page consistently push users toward a single next action.
2. Make the approved-estimate banner the default handoff point into work scheduling.
3. Make job completion route directly toward invoice creation when billing is the next step.
4. Embed or more directly surface assessment/context inside visit execution.
5. Reinforce property history as the durable record for completed work and media.

## High-Risk Gaps

1. Request conversion still branches into multiple paths before a user learns the product.
2. The visit-to-billing handoff requires a context switch to the job or invoice page.
3. Separate assessment and completion surfaces make the visit experience feel split.
4. Legacy request and dashboard surfaces can still confuse a new employee if they land on them from an old link.

## Recommended Implementation Order

1. Request detail and request queue simplification.
2. Estimate approved handoff clarity.
3. Visit-to-invoice handoff clarity.
4. Property history reinforcement and media consolidation.
5. Remaining dashboard and duplicate surface cleanup.

## Implementation Notes

- The workflow is already executable with the current UI.
- The biggest issue is not missing capability; it is the number of places a user can choose the wrong next screen.
- The canonical path becomes easier when one surface is clearly the source of truth for each step.
