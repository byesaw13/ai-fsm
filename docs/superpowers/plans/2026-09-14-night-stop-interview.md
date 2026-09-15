# Night stop interview Implementation Plan

> **For agentic workers:** implement TASK-145 on `feat/task-145-night-stop-interview`. Reuse visit closeout and confirm-visit; do not add a chatbot.

**Goal:** Day Review walks today’s GPS stops, asks what each was, creates or attaches jobs, and only then closes the day.

**Architecture:** Pure reason picker in `packages/domain/src/stop-interview.ts`. Loader reads `location_segments` + `visit_candidates` + open jobs at the property. `POST /api/v1/day-review/stops` writes `stop_reason` / `stop_notes` on the segment and applies job/receipt/closeout. UI is the first section on `/app/day-review`.

**Tech Stack:** Next.js app router, Postgres, existing closeout + quick-book job insert.

## Lived fixture (2026-09-14)

| Time ET | GPS place | Truth | Today’s bug |
|---|---|---|---|
| 09:37 | 4 Ash | Peter job work | Auto `job_work` on `J-2026-0029`, no notes |
| 10:07–10:41 | drive | Tools from Landing | No Landing stop |
| 10:42–13:03 | 8 Bus Rd | Return to Peter | Matched 4 Ash, auto job_work |
| 13:14 | Home Depot | Materials for fridge | Confirmed segment, no interview |
| 13:43 / 14:17 | 63 / 39 Landing | New fridge work | `job_work`, **job_id null** (invoiced) |
| 14:47 | 4 Ash | Peter rest of day | Auto job_work |
| 16:07 | 236 N Broadway | Unknown | No candidate |

## Files

| File | Change |
|---|---|
| `packages/domain/src/stop-interview.ts` | Reasons, defaults, options |
| `packages/domain/src/stop-interview.test.ts` | Invoiced vs open vs store |
| `db/migrations/182_segment_stop_reason.sql` | `stop_reason`, `stop_notes` |
| `apps/web/lib/day-review/load-stop-interview.ts` | Day’s stop cards |
| `apps/web/lib/day-review/apply-stop-interview.ts` | Persist + create job + receipts |
| `apps/web/app/api/v1/day-review/stops/route.ts` | POST |
| `apps/web/app/app/day-review/StopInterviewSection.tsx` | UI |
| `apps/web/app/app/day-review/page.tsx` | Lead with interview; unanswered blocks close |
| `apps/web/app/api/internal/push/day-review-reminder/route.ts` | Copy |

## Do not

- Auto-accept ready `job_work` as the night story
- Attach a new stop to an `invoiced` / `completed` job
- Invent a second home besides Day Review
