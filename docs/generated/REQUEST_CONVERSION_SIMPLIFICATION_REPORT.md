# Request Conversion Simplification Report

## Authority Used
- `docs/canonical/WORKFLOW.md`
- `docs/generated/CANONICAL_WORKFLOW_VALIDATION_REPORT.md`

## Goal
Make Request the easiest object in the system to process so a new employee can tell:
1. what kind of request it is,
2. what the next action is,
3. what record should be created next.

## What Changed
- Added canonical request guidance in `apps/web/app/app/booking-requests/request-guidance.ts`.
- Simplified the request detail page to show one recommended action at a time.
- Redirected the legacy `/app/booking-requests` list route to `/app/requests`.
- Aligned the request list with the same guidance model.
- Added request guidance and duplicate-conversion tests.

## Request Detail Actions

### Primary
- `Create Estimate` when the request is a fixed-bid remote estimate.
- `Create Job` when the request is an hourly repair or needs a job thread first.
- `Schedule Walkthrough` when the request is a site visit with a job already present.
- `Close Request` for closed, duplicate, or needs-info requests.

### Secondary
- Mark Reviewed
- Needs Info
- Duplicate
- Close Request status change
- Save Notes Only

### Administrative
- Request Type selector
- Send Intake Form
- Linked record navigation to Job, Visit, and Client

### Legacy
- The `/app/booking-requests` list route now redirects to `/app/requests` and is no longer a visible parallel queue.

## Canonical Request Conversion Flow
The request now resolves into exactly one of these primary outcomes:
- Create Estimate
- Create Job
- Schedule Walkthrough
- Close Request

No other request-level primary outcome is surfaced in the UI.

## Duplicate Path Cleanup
- Requests now use `/app/requests` as the visible queue.
- `booking-requests` list navigation is collapsed into a redirect.
- The request detail page remains the record-specific entry point for existing links.

## Validation
### Tests Added
- `app/app/booking-requests/__tests__/request-guidance.unit.test.ts`
- Duplicate conversion protection cases in `app/api/v1/booking-requests/__tests__/booking-requests.unit.test.ts`

### Coverage
- estimate request
- handyman repair request
- walkthrough request
- closed request
- duplicate conversion protection

### Verification
- `pnpm --filter @ai-fsm/web test -- app/app/booking-requests/__tests__/request-guidance.unit.test.ts app/api/v1/booking-requests/__tests__/booking-requests.unit.test.ts`
- `pnpm --filter @ai-fsm/web typecheck`

Both passed.
