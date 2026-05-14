# Booking Request Boundaries

Item 4 of the domain simplification plan.

## Rule

A booking request is an **intake source record only**. It captures the raw
submitted contact info and service description. After conversion, `client_id`,
`property_id`, `job_id`, and `visit_id` are output linkages — they point to
the real work objects that were created.

Do not treat booking requests as active work objects after conversion.

## Field Ownership Map

| Field | Owner | Notes |
|---|---|---|
| `contact_name`, `contact_email`, `contact_phone` | Booking request | Snapshot of what was submitted. Do not overwrite with CRM updates. |
| `service_description`, `preferred_date` | Booking request | Original intake text, preserved as submitted. |
| `status` | Booking request | Intake lifecycle: `pending → needs_info / duplicate / reviewed → converted / cancelled`. |
| `client_id`, `property_id`, `job_id`, `visit_id` | Output linkages | Written once on conversion. Read-only after that. |
| Client name, property address, job title | `clients`, `properties`, `jobs` | Always derive from canonical tables — never back-fill into booking request. |

## Conversion Lifecycle

```
Booking request submitted (status: pending)
  ↓
Admin reviews — may mark needs_info or duplicate
  ↓
Admin accepts → conversion creates:
  - client (or links existing)
  - property (or links existing)
  - job (status: draft, source: booking_request)
  - booking_request.status = "converted"
  - booking_request.job_id, client_id, property_id set
  ↓
Job proceeds through normal work lifecycle
Booking request is historical record only
```

## UI Behavior Rules

- Booking requests list shows unreviewed/pending items as the primary view.
- Converted requests are historical — show them in a collapsed/secondary view.
- Never show booking request status as the "job status" anywhere in pipeline.
- The pipeline stage `new_lead` covers all pre-estimate booking request states.
- After conversion, link to the job, not the booking request, as the primary action.

## What to Clean Up (future work)

1. Add `jobs.source` column: `manual | booking_request | membership` — lets
   you filter/group by origin without joining booking_requests.
2. The intake records creator (`lib/intake/records.ts`) creates a job and visit
   immediately on submission. Revisit whether draft job creation should be
   deferred until admin review to reduce pipeline noise.
3. The portal page (`/portal/[clientToken]`) shows `job.scheduled_end` as a
   completion date — replace with the actual visit completed_at.

## Safe to Do Now

None of the above requires a migration. The field ownership rules above are
behavioral — enforce them in code review and AI prompt context.
