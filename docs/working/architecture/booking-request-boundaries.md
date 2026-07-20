# Booking Request Boundaries

Item 4 of the domain simplification plan. Updated for the sales funnel (migration 153).

## Rule

A booking request is the **front-door lead record**. It tracks progress from first
contact through win/loss. After conversion (or loss), it is historical —
`client_id`, `property_id`, `job_id`, and `visit_id` are output linkages to the
real work objects.

Do not treat booking requests as active work objects after `converted` or `lost`.

## Sales funnel

```
Called (pending)
  ↓  schedule assessment / walkthrough visit
Assessment booked
  ↓  create estimate (booking_request_id set)
Estimated
  ↓  estimate approved                    ↘ estimate declined / customer no-go / 60d idle
Converted (won)                              Lost
```

Side lanes (not on the happy path):

| Status | Meaning |
|--------|---------|
| `needs_info` | Waiting on contact or scope details |
| `reviewed` | Classified; path chosen |
| `duplicate` | Matches another request |
| `cancelled` | Spam / not a real lead (admin) |

`closed_reason` on `lost` / `cancelled`: `estimate_declined` | `customer_declined` | `stale` | `other` | `spam`.

## Field Ownership Map

| Field | Owner | Notes |
|---|---|---|
| contact snapshot fields | Booking request | Do not overwrite with CRM updates. |
| `service_description`, `preferred_date` | Booking request | Original intake text. |
| `status` | Booking request | Funnel lifecycle (see above). System advances stages; staff set side/terminal. |
| `closed_reason`, `closed_at` | Booking request | Set when lost/cancelled. |
| `client_id`, `property_id`, `job_id`, `visit_id` | Output linkages | Written on conversion/linking. |
| Client name, property address, job title | Canonical tables | Never back-fill into booking request. |

## Auto-advance rules

| Event | Stage |
|-------|--------|
| Request created | `pending` (Called) |
| Assessment visit scheduled with `booking_request_id` | `assessment_booked` |
| Work-day visit / explicit convert (book-work path) | `converted` |
| Estimate created with `booking_request_id` | `estimated` |
| Estimate approved | `converted` |
| Estimate declined | `lost` + `estimate_declined` |
| Staff “Mark lost” | `lost` + `customer_declined` |
| Idle 60 days (`updated_at`) | `lost` + `stale` (worker) |

Stages never regress. Terminal statuses (`converted`, `lost`, `cancelled`, `duplicate`) are no-ops for further advance.

## UI Behavior Rules

- Requests list **defaults to open funnel**: pending, needs_info, reviewed, assessment_booked, estimated.
- Converted / lost / cancelled / duplicate are secondary filters.
- Progress strip on detail: Called → Assessment → Estimated → Converted (Lost as branch).
- Never show booking request status as the job status in the pipeline.
- After conversion, link to the job/visit as the primary follow-up.

## What to Clean Up (future work)

1. Per-account stale threshold (today hard-coded 60 days).
2. Optional owner email when a request is auto-marked lost.
3. `jobs.source` column for origin analytics without joining booking_requests.
