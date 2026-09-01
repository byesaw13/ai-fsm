# TASK-115 Promise Capture Pilot — implementation plan

Worktree: `/home/nick/ai-fsm-promise-capture`
Branch: `feat/promise-capture-pilot` from `origin/main`

## Contract constants

- `action_type` for promises: `owner_promise`
- Supported entities: `booking_request` | `estimate` | `job` | `invoice`
- Upload dir: `/app/uploads/captures/<captureId>/`
- Roles: owner, admin only
- Review cap: 3
- Snooze max: 1

## File ownership (do not cross)

Foundation (already in this change or immediately after docs):
- `db/migrations/175_capture_evidence.sql`
- `db/migrations/176_action_items_promise_source.sql`
- `packages/domain/src/promise-capture.ts`
- `packages/domain/src/promise-capture.test.ts`
- `packages/domain/src/index.ts` (one export line)

Slice A — capture recorder (only these plus new files under capture/):
- `apps/web/app/app/capture/**`
- `apps/web/app/api/v1/captures/**`
- `apps/web/app/manifest.ts`
- `apps/web/app/(auth)/login/page.tsx` (honor `?next=/app/capture` only)
- `apps/web/lib/auth/post-login-destination.ts` (optional next allowlist)
- `apps/web/app/app/layout.tsx` (redirect to `/login?next=` only when path is `/app/capture`)

Slice B — processing:
- `apps/web/lib/captures/**` (transcribe + apply domain extract; no UI)
- `services/worker/src/process-captures.ts`
- `services/worker/src/process-captures.test.ts`
- `services/worker/src/index.ts` (one poll call)

Slice C — Day Review confirm:
- `apps/web/app/app/day-review/PromiseStrip.tsx` (new)
- `apps/web/app/app/day-review/page.tsx`
- `apps/web/app/api/v1/captures/[id]/review/route.ts` (new)
- `apps/web/lib/captures/review-query.ts` (new)
- `apps/web/lib/captures/entity-picker.ts` (new)

Slice D — Action Queue + resolve:
- `apps/web/app/app/page.tsx` (one extra query + bucket)
- `apps/web/app/app/action-queue/page.tsx` (bucket + open-row list)
- `apps/web/app/api/v1/action-items/[id]/resolve/route.ts` (new)

## Sequence

Docs + foundation, then A/B/C/D in parallel, then integrate `pnpm gate:fast`.
