# Release Manifest

This manifest defines the narrow launch surface for ai-fsm. Until every item here is green, non-core feature work should stay hidden, flagged, or out of navigation.

## Launch Spine

The required user flow is:

1. Owner/admin logs in.
2. Owner/admin creates or selects a client.
3. Owner/admin creates a job for that client.
4. Owner/admin schedules a visit for the job.
5. Owner/admin creates an estimate for the client/job context.
6. Owner/admin sends and approves the estimate.
7. Owner/admin converts the approved estimate to an invoice.
8. Owner/admin records a manual payment.
9. Owner/admin can verify the invoice is paid.

The CI release smoke test for this spine is `tests/e2e/core-flow.spec.ts`.

## Launch-Critical App Routes

- `/login`
- `/app/jobs`
- `/app/jobs/new`
- `/app/jobs/[id]`
- `/app/visits/[id]`
- `/app/clients`
- `/app/clients/new`
- `/app/clients/[id]`
- `/app/estimates`
- `/app/estimates/new`
- `/app/estimates/[id]`
- `/app/invoices`
- `/app/invoices/[id]`
- `/app/settings`

## Launch-Critical APIs

- `/api/health`
- `/api/v1/auth/login`
- `/api/v1/auth/logout`
- `/api/v1/auth/me`
- `/api/v1/clients`
- `/api/v1/clients/[id]`
- `/api/v1/jobs`
- `/api/v1/jobs/[id]`
- `/api/v1/jobs/[id]/visits`
- `/api/v1/visits/[id]`
- `/api/v1/estimates`
- `/api/v1/estimates/[id]`
- `/api/v1/estimates/[id]/transition`
- `/api/v1/estimates/[id]/convert`
- `/api/v1/invoices`
- `/api/v1/invoices/[id]`
- `/api/v1/invoices/[id]/transition`
- `/api/v1/invoices/[id]/payments`

## Launch-Critical Worker Jobs

- Visit reminder processing.
- Overdue invoice follow-up processing.

## Default-Release Infrastructure

- Next.js web service.
- Node worker service.
- PostgreSQL.
- Stripe CLI only when local webhook forwarding is required.

Redis is not part of the default release stack until the app has a live Redis-backed code path.

## Explicitly Non-Core For Launch

These surfaces may remain in the repo, but should be treated as beta/internal unless deliberately promoted into this manifest:

- Membership and maintenance-plan configuration.
- Property vault and rich media workflows beyond what the core visit/job path requires.
- Paperless and Homebox integrations.
- AI estimate interview/draft/material/scope extras beyond basic estimate creation.
- Pricing dashboards and long-tail reports.
- Vehicles, mileage, and auxiliary admin surfaces.
- Portal enhancements not required for estimate/invoice access.

## Required Gates

- `lint`
- `typecheck`
- `build`
- `test`
- `e2e-smoke`

`e2e-smoke` must run `tests/e2e/core-flow.spec.ts` against a migrated and seeded database. It must not skip the launch spine because of missing fixture data.
