# TASK-174 — Align public booking with Dovetails service scope

- Phase: cross-cutting
- Epic: 005 — Platform and delivery
- Status: In Progress
- Source: Nick's 2026-10-05 website content brief; UX implementation direction sections 22, 23, 25.

## Objective

Help a homeowner request the work advertised on the marketing site without presenting unconfirmed electrical, plumbing, exterior painting, or renovation services as standard offerings.

## Scope

Use five public choices: Painting & drywall, Repairs, Mounting & installations, Maintenance, Custom woodworking. Retain the corresponding existing category IDs and all downstream API, pricing, consent, referral, and intake behavior. Historical categories remain valid in the domain and existing requests.

The screen exists so a homeowner can describe a service need for review. Continue remains the primary first-step action. No inquiry is submitted in live validation.

## Acceptance criteria

- Five public category names match the marketing site; painting/drywall leads.
- Descriptions cover the supported scope and do not advertise unconfirmed specialist work.
- Scope review and agreement precede scheduling; additional work needs approval.
- Selection still reaches contact details on desktop and mobile.
- Existing booking API unit tests, applicable static checks, and build pass.
- Production release is separately authorized and verified; do not mark the app live just because the branch is ready.

## Validation

- `pnpm gate:fast` passed: lint, dead-code/migration/RLS checks, types, build, and unit suites (2,606 unit tests across workspaces).
- Targeted ESLint on the two changed booking files passed after the public question changes.
- Local production-build browser checks: five categories at 390px and 1440px (10 paths), every category reached contact details, no JavaScript errors or horizontal overflow, no submissions.
- Added `tests/e2e/public-booking.spec.ts` to required CI smoke coverage. Both 390px/1440px regression cases passed locally; each blocks `/api/booking` and verifies public categories, omitted specialist follow-ups, and continuation to contact details.
- Independent source review confirmed the narrowed follow-ups and historical metadata remain consistent.
- Separate production release remains pending explicit authorization. This branch does not change the live booking form.
