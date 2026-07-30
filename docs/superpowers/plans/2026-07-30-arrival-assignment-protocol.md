# Arrival → Assignment Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect on-site presence, propose the correct work order, and let the owner authorize with one smart tap (My Work banner + HA push + Day Review) so `job_work` labor attaches to the right WO for seamless project rollups—without silent billable writes.

**Architecture:** Extend existing `visit_candidates` + `confirm-visit` / PATCH confirm path into an “arrival proposal” protocol: pure WO resolution + live eligibility in `@ai-fsm/domain`, migration for WO/live columns and open-stop nulls, confirm transaction prefers `entity_type=work_order`, Day Review + My Work share the same API, location ingest returns `arrival_prompt` for HA. Align PR #543 auto-record so presence may stamp visits but **activity + candidate confirm stay human-gated**.

**Tech Stack:** Next.js App Router, PostgreSQL + RLS, `@ai-fsm/domain` pure helpers, Vitest unit/integration, Playwright e2e, HA Companion push (manual verify)

**Spec:** `docs/superpowers/specs/2026-07-30-arrival-assignment-protocol-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/domain/src/visit-matching.ts` | Add `resolveWorkOrderForProperty`, `isLivePromptEligible`, constants |
| `packages/domain/src/visit-matching.test.ts` | Unit tests for new pure helpers |
| `db/migrations/160_arrival_assignment_protocol.sql` | `work_order_id`, `wo_resolution`, live fields, nullable departure/duration |
| `apps/web/app/api/internal/location/route.ts` | Populate WO resolution on candidate insert; `arrival_prompt` in response; stop auto-confirming activity |
| `apps/web/lib/field/confirm-visit.ts` | WO-aware entity link, open activity support, mark confirmed with WO, presence-only auto path |
| `apps/web/app/api/v1/visit-candidates/[id]/route.ts` | Accept `work_order_id`; ambiguous 409; open `ended_at`; switch open activity |
| `apps/web/lib/day-review/queries.ts` | Expose WO fields on visit payload |
| `apps/web/app/app/day-review/VisitsSection.tsx` | Fix confirm API (PATCH), ignore API, WO label + picker |
| `apps/web/components/field/WorkOrderPicker.tsx` | Shared WO list for banner + Day Review |
| `apps/web/components/field/ArrivalProposalBanner.tsx` | Live one-tap confirm card |
| `apps/web/app/app/my-work/page.tsx` | Load pending live proposals; mount banner; `?proposal=` |
| `apps/web/lib/field/load-arrival-proposals.ts` | Query pending live-eligible candidates for My Work |
| `docs/working/location-capture.md` | Document `arrival_prompt` response field for HA |
| `tests/e2e/day-review.spec.ts` | Smoke: confirm attaches WO (or extend existing) |

---

## Important codebase facts (do not rediscover)

1. Confirm today is **`PATCH /api/v1/visit-candidates/[id]`** with body `{ action: "confirm"|"ignore", classification?, note?, rebalance? }` — **not** `POST .../confirm`. Day Review `VisitsSection` currently calls the wrong URL/method; fix it in Task 5.
2. `ensureFieldDayVisit` already returns `reason: "ambiguous_work_order"` when multi-WO; wire that to HTTP 409.
3. `autoRecordScheduledVisitPresence` (location route, PR #543) auto-writes `activity_entries` and marks candidates confirmed — **violates** the approved “always one human tap for billable” rule. Task 3 converts it to **presence-only** (visit status/times) and leaves candidate `pending`.
4. `entityLinkFromCandidate` prefers `visit` then `job`. Spec wants **`work_order`** when known.
5. Partial unique index: at most **one open** activity (`ended_at IS NULL`) per account — switch path must close the prior open entry.
6. Next migration number: **160**.

---

### Task 1: Domain pure helpers — WO resolution + live eligibility

**Files:**
- Modify: `packages/domain/src/visit-matching.ts`
- Modify: `packages/domain/src/visit-matching.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/domain/src/visit-matching.test.ts`:

```ts
import {
  resolveWorkOrderForProperty,
  isLivePromptEligible,
  LIVE_PROMPT_CONFIDENCE_FLOOR,
  type OpenWorkOrderOption,
} from "./visit-matching";

const wo = (id: string, extra: Partial<OpenWorkOrderOption> = {}): OpenWorkOrderOption => ({
  id,
  title: `WO ${id}`,
  status: "scheduled",
  scheduledToday: false,
  ...extra,
});

describe("resolveWorkOrderForProperty", () => {
  it("returns clear when exactly one open WO", () => {
    const r = resolveWorkOrderForProperty({ openWorkOrders: [wo("a")], overrideWorkOrderId: null });
    expect(r).toEqual({
      status: "clear",
      workOrderId: "a",
      visitId: null,
      options: [expect.objectContaining({ id: "a" })],
    });
  });

  it("returns ambiguous when multiple open WOs even if one is scheduled today", () => {
    const r = resolveWorkOrderForProperty({
      openWorkOrders: [wo("a", { scheduledToday: true, visitId: "v1" }), wo("b")],
      overrideWorkOrderId: null,
    });
    expect(r.status).toBe("ambiguous");
    expect(r.workOrderId).toBeNull();
    expect(r.options).toHaveLength(2);
  });

  it("returns none when no open WOs", () => {
    const r = resolveWorkOrderForProperty({ openWorkOrders: [], overrideWorkOrderId: null });
    expect(r.status).toBe("none");
    expect(r.workOrderId).toBeNull();
  });

  it("honors override when it matches an open WO", () => {
    const r = resolveWorkOrderForProperty({
      openWorkOrders: [wo("a"), wo("b", { visitId: "v2", scheduledToday: true })],
      overrideWorkOrderId: "b",
    });
    expect(r).toEqual({
      status: "clear",
      workOrderId: "b",
      visitId: "v2",
      options: expect.any(Array),
    });
  });

  it("ignores override that is not in the open list", () => {
    const r = resolveWorkOrderForProperty({
      openWorkOrders: [wo("a"), wo("b")],
      overrideWorkOrderId: "zzz",
    });
    expect(r.status).toBe("ambiguous");
  });
});

describe("isLivePromptEligible", () => {
  const base = {
    workdayOpen: true,
    confidenceScore: 90,
    distanceProven: true,
    scheduledToday: true,
    alreadyPrompted: false,
    status: "pending" as const,
  };

  it("true when all high bars pass", () => {
    expect(isLivePromptEligible(base)).toBe(true);
  });

  it("false when workday closed", () => {
    expect(isLivePromptEligible({ ...base, workdayOpen: false })).toBe(false);
  });

  it("false when confidence below floor", () => {
    expect(isLivePromptEligible({ ...base, confidenceScore: LIVE_PROMPT_CONFIDENCE_FLOOR - 1 })).toBe(false);
  });

  it("false when not distance-proven", () => {
    expect(isLivePromptEligible({ ...base, distanceProven: false })).toBe(false);
  });

  it("false when not scheduled today", () => {
    expect(isLivePromptEligible({ ...base, scheduledToday: false })).toBe(false);
  });

  it("false when already prompted or not pending", () => {
    expect(isLivePromptEligible({ ...base, alreadyPrompted: true })).toBe(false);
    expect(isLivePromptEligible({ ...base, status: "confirmed" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /home/nick/ai-fsm-deploy-clean
pnpm --filter @ai-fsm/domain exec vitest run src/visit-matching.test.ts
```

Expected: FAIL — `resolveWorkOrderForProperty` / `isLivePromptEligible` not exported.

- [ ] **Step 3: Implement helpers**

Append to `packages/domain/src/visit-matching.ts` (keep existing exports):

```ts
/** High bar for interrupting the tech with a live push/banner (stricter than VISIT_CONFIDENCE_FLOOR). */
export const LIVE_PROMPT_CONFIDENCE_FLOOR = 70;

export type OpenWorkOrderOption = {
  id: string;
  title: string;
  status: string;
  /** True if this WO has a non-cancelled visit scheduled for the stop's local day. */
  scheduledToday: boolean;
  visitId?: string | null;
};

export type WorkOrderResolution = {
  status: "clear" | "ambiguous" | "none";
  workOrderId: string | null;
  visitId: string | null;
  options: OpenWorkOrderOption[];
};

/**
 * Product rule: multiple open WOs → always ambiguous unless override picks one.
 * Single open WO → clear. Zero → none.
 */
export function resolveWorkOrderForProperty(input: {
  openWorkOrders: OpenWorkOrderOption[];
  overrideWorkOrderId?: string | null;
}): WorkOrderResolution {
  const options = input.openWorkOrders;
  if (input.overrideWorkOrderId) {
    const hit = options.find((o) => o.id === input.overrideWorkOrderId);
    if (hit) {
      return {
        status: "clear",
        workOrderId: hit.id,
        visitId: hit.visitId ?? null,
        options,
      };
    }
  }
  if (options.length === 0) {
    return { status: "none", workOrderId: null, visitId: null, options };
  }
  if (options.length === 1) {
    const only = options[0];
    return {
      status: "clear",
      workOrderId: only.id,
      visitId: only.visitId ?? null,
      options,
    };
  }
  return { status: "ambiguous", workOrderId: null, visitId: null, options };
}

export function isLivePromptEligible(input: {
  workdayOpen: boolean;
  confidenceScore: number;
  distanceProven: boolean;
  scheduledToday: boolean;
  alreadyPrompted: boolean;
  status: "pending" | "confirmed" | "ignored" | string;
}): boolean {
  if (input.status !== "pending") return false;
  if (input.alreadyPrompted) return false;
  if (!input.workdayOpen) return false;
  if (!input.scheduledToday) return false;
  if (!input.distanceProven) return false;
  if (input.confidenceScore < LIVE_PROMPT_CONFIDENCE_FLOOR) return false;
  return true;
}
```

Already exported via `export * from "./visit-matching"` in `packages/domain/src/index.ts` — no index change.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @ai-fsm/domain exec vitest run src/visit-matching.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/visit-matching.ts packages/domain/src/visit-matching.test.ts
git commit -m "feat(domain): WO resolution + live prompt eligibility for arrival protocol"
```

---

### Task 2: Migration 160 — candidate WO + live + open-stop nulls

**Files:**
- Create: `db/migrations/160_arrival_assignment_protocol.sql`

- [ ] **Step 1: Write migration**

```sql
-- Migration 160: Arrival → Assignment Protocol
-- Extends visit_candidates with work order targeting + live prompt metadata.
-- Allows open-stop proposals (nullable departure/duration).

ALTER TABLE visit_candidates
  ADD COLUMN IF NOT EXISTS work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wo_resolution TEXT NOT NULL DEFAULT 'unknown'
    CHECK (wo_resolution IN ('unknown', 'clear', 'ambiguous', 'none', 'resolved')),
  ADD COLUMN IF NOT EXISTS live_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS live_prompted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

ALTER TABLE visit_candidates
  ALTER COLUMN departure_time DROP NOT NULL,
  ALTER COLUMN duration_minutes DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visit_candidates_work_order
  ON visit_candidates (account_id, work_order_id)
  WHERE work_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visit_candidates_live_pending
  ON visit_candidates (account_id, status)
  WHERE status = 'pending' AND live_eligible = TRUE;

-- Reversal:
-- DROP INDEX IF EXISTS idx_visit_candidates_live_pending;
-- DROP INDEX IF EXISTS idx_visit_candidates_work_order;
-- ALTER TABLE visit_candidates
--   DROP COLUMN IF EXISTS confirmed_at,
--   DROP COLUMN IF EXISTS live_prompted_at,
--   DROP COLUMN IF EXISTS live_eligible,
--   DROP COLUMN IF EXISTS wo_resolution,
--   DROP COLUMN IF EXISTS work_order_id;
-- (re-adding NOT NULL on departure/duration requires backfill — do not reverse in prod without plan)
```

- [ ] **Step 2: Apply migration locally**

```bash
pnpm db:migrate
```

Expected: migration 160 applies cleanly.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/160_arrival_assignment_protocol.sql
git commit -m "db: visit_candidates WO resolution + live prompt columns (160)"
```

---

### Task 3: Proposal builder + stop silent auto-billable

**Files:**
- Modify: `apps/web/app/api/internal/location/route.ts` (`detectVisitCandidate` insert + `autoRecord` call)
- Modify: `apps/web/lib/field/confirm-visit.ts` (`autoRecordScheduledVisitPresence` → presence-only)

**Intent:** On closed stop, compute open WOs for the matched property/job, set `work_order_id` / `wo_resolution` / `live_eligible`. Return `arrival_prompt` when eligible and not yet prompted. **Do not** auto-insert `activity_entries` or mark candidate confirmed.

- [ ] **Step 1: Presence-only auto path**

In `autoRecordScheduledVisitPresence` (`confirm-visit.ts`):

1. Keep `applyGpsPresenceToVisit` for calendar “I was there”.
2. **Remove** (or hard-skip) `insertVisitActivityEntry` + `markVisitCandidateConfirmed`.
3. Return `{ recorded: true, reason: "presence_only" }` always when visit stamped; never set candidate to confirmed from this path.

Update any unit tests that expected auto activity insert (search `autoRecordScheduledVisitPresence` / “Auto-logged from GPS”).

- [ ] **Step 2: Load open WOs + resolve when inserting candidate**

Inside `detectVisitCandidate` after `top` is chosen and `shouldCreateVisitCandidate` passes:

```ts
// Load open/bookable WOs at this property (via jobs).
const { rows: openWos } = await client.query<{
  id: string; title: string; status: string; visit_id: string | null; scheduled_today: boolean;
}>(
  `SELECT w.id, w.title, w.status,
          tv.id AS visit_id,
          (tv.id IS NOT NULL) AS scheduled_today
   FROM work_orders w
   JOIN jobs j ON j.id = w.job_id
   LEFT JOIN LATERAL (
     SELECT v.id FROM visits v
     WHERE v.work_order_id = w.id AND v.status <> 'cancelled'
       AND (v.scheduled_start AT TIME ZONE 'America/New_York')::date
           = ($3::timestamptz AT TIME ZONE 'America/New_York')::date
     ORDER BY v.scheduled_start ASC LIMIT 1
   ) tv ON true
   WHERE j.property_id = $1 AND w.account_id = $2
     AND w.status IN ('draft','ready','scheduled','dispatched','waiting')
   ORDER BY w.created_at ASC`,
  [top.propertyId, accountId, stop.startedAt],
);

import { resolveWorkOrderForProperty, isLivePromptEligible, LIVE_PROMPT_CONFIDENCE_FLOOR } from "@ai-fsm/domain";

const resolution = resolveWorkOrderForProperty({
  openWorkOrders: openWos.map((w) => ({
    id: w.id,
    title: w.title,
    status: w.status,
    scheduledToday: w.scheduled_today,
    visitId: w.visit_id,
  })),
  overrideWorkOrderId: null,
});

const distanceProven =
  top.distanceMeters != null &&
  top.distanceMeters <= 150 * 0.3048; // within ~150 ft — same near band as matcher

// workday open?
const { rows: bd } = await client.query<{ id: string }>(
  `SELECT id FROM business_days
   WHERE account_id = $1 AND closed_at IS NULL
     AND business_date = ($2::timestamptz AT TIME ZONE 'America/New_York')::date
   LIMIT 1`,
  [accountId, stop.startedAt],
);

const liveEligible = isLivePromptEligible({
  workdayOpen: bd.length > 0,
  confidenceScore: top.score,
  distanceProven,
  scheduledToday: top.visitId != null,
  alreadyPrompted: false,
  status: "pending",
});
```

Update INSERT:

```sql
INSERT INTO visit_candidates
  (account_id, location_segment_id, property_id, matched_client_id, job_id, visit_id,
   work_order_id, wo_resolution, live_eligible,
   distance_meters, confidence_score, arrival_time, departure_time, duration_minutes)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
ON CONFLICT (location_segment_id) DO NOTHING
RETURNING id
```

Params include `resolution.workOrderId`, `resolution.status`, `liveEligible`, times.

- [ ] **Step 3: Surface `arrival_prompt` on location response**

When a new candidate is inserted with `live_eligible` and `live_prompted_at` null, include in the HTTP JSON response (location route’s success payload):

```ts
arrival_prompt: {
  candidate_id: candidateId,
  property_label: /* from property address or client name */,
  wo_title: resolution.options.find(o => o.id === resolution.workOrderId)?.title ?? null,
  wo_resolution: resolution.status,
  deep_link: `/app/my-work?proposal=${candidateId}`,
  confidence: top.score,
}
```

Do **not** set `live_prompted_at` here — HA ack endpoint (Task 7) does that after sending push. Optionally set it when My Work banner is rendered if no HA (Task 6 can stamp via client ack).

- [ ] **Step 4: Unit/integration for presence-only**

If `confirm-visit` has tests under `apps/web/lib/field/__tests__`, update them. Otherwise add `apps/web/lib/field/__tests__/auto-record-presence.unit.test.ts` testing pure helpers already covered; for integration, extend location/candidate tests if present.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/internal/location/route.ts apps/web/lib/field/confirm-visit.ts
git commit -m "feat(location): WO on candidates; presence-only GPS; arrival_prompt payload"
```

---

### Task 4: Confirm API — WO body, entity_type work_order, open activity, switch

**Files:**
- Modify: `apps/web/app/api/v1/visit-candidates/[id]/route.ts`
- Modify: `apps/web/lib/field/confirm-visit.ts` (`entityLinkFromCandidate`, `markVisitCandidateConfirmed`, `insertVisitActivityEntry` for null `endedAt`)

- [ ] **Step 1: Extend body schema**

```ts
const bodySchema = z.object({
  action: z.enum(["confirm", "ignore"]),
  classification: z.enum(VISIT_CLASSIFICATIONS).optional(),
  note: z.string().max(500).nullish(),
  work_order_id: z.string().uuid().nullish(),
  visit_id: z.string().uuid().nullish(),
  rebalance: rebalanceSchema,
  /** When true, end any open activity before writing (required if overlap is open-ended). */
  switch_activity: z.boolean().optional(),
});
```

- [ ] **Step 2: SELECT new columns**

Extend `CandidateRow` + SELECT with `work_order_id`, `wo_resolution`, `departure_time` nullable, `duration_minutes` nullable.

- [ ] **Step 3: Resolve WO before field day**

```ts
// After ignore branch; before overlap check:
let workOrderId = d.work_order_id ?? cand.work_order_id ?? null;

// If still need resolution from property open WOs:
if (!workOrderId || cand.wo_resolution === "ambiguous") {
  // query open WOs same SQL as location route (extract shared helper
  // apps/web/lib/field/open-work-orders.ts to avoid duplication)
  const resolution = resolveWorkOrderForProperty({
    openWorkOrders,
    overrideWorkOrderId: d.work_order_id ?? null,
  });
  if (resolution.status === "ambiguous") {
    await client.query("ROLLBACK");
    return NextResponse.json(
      {
        error: {
          code: "ambiguous_work_order",
          message: "Choose a work order",
          options: resolution.options,
          traceId: session.traceId,
        },
      },
      { status: 409 },
    );
  }
  if (resolution.status === "none" && fieldClass is job_work/warranty) {
    // allow confirm with entity_type job/client only — do not invent WO
    workOrderId = null;
  } else {
    workOrderId = resolution.workOrderId;
  }
}
```

Pass `workOrderId` into `ensureFieldDayVisit({ ..., workOrderId })`.

If `ensureFieldDayVisit` returns `reason: "ambiguous_work_order"`, return same 409 shape.

- [ ] **Step 4: Entity link prefers work_order**

Replace `entityLinkFromCandidate` usage for job_work:

```ts
export function entityLinkFromCandidate(
  cand: Pick<PendingVisitCandidate, "job_id" | "visit_id" | "matched_client_id"> & {
    work_order_id?: string | null;
  },
): [string | null, string | null] {
  if (cand.work_order_id) return ["work_order", cand.work_order_id];
  if (cand.visit_id) return ["visit", cand.visit_id];
  if (cand.job_id) return ["job", cand.job_id];
  if (cand.matched_client_id) return ["client", cand.matched_client_id];
  return [null, null];
}
```

- [ ] **Step 5: Open activity when still on site**

```ts
const endedAt = cand.departure_time; // may be null
// Overlap query: if endedAt null, treat end as infinity for conflict detection
// INSERT: ended_at = endedAt (null allowed)

// If another open activity exists and switch_activity !== true:
// return 409 { code: "activity_open", open_activity_id }
// If switch_activity: UPDATE that row SET ended_at = cand.arrival_time (or now)
```

- [ ] **Step 6: markVisitCandidateConfirmed stores WO**

```ts
await client.query(
  `UPDATE visit_candidates
   SET status = 'confirmed', classification = $1, activity_entry_id = $2,
       visit_id = COALESCE($5, visit_id),
       work_order_id = COALESCE($6, work_order_id),
       job_id = COALESCE($7, job_id),
       wo_resolution = 'resolved',
       confirmed_at = now(),
       updated_at = now()
   WHERE id = $3 AND account_id = $4`,
  [classification, entryId, candidateId, accountId, visitId ?? null, workOrderId ?? null, jobId ?? null],
);
```

- [ ] **Step 7: Add/adjust route unit tests**

In existing visit-candidate or confirm tests (or create `apps/web/app/api/v1/visit-candidates/__tests__/confirm-wo.unit.test.ts` with mocked pool):

- ambiguous multi-WO without override → 409 `ambiguous_work_order`
- clear single WO → activity `entity_type=work_order`
- open departure null → `ended_at` null on activity
- already confirmed → `{ already: true }`

Run:

```bash
pnpm --filter @ai-fsm/web test:unit -- visit-candidates
# or the specific test file path used in this repo
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/api/v1/visit-candidates apps/web/lib/field/confirm-visit.ts apps/web/lib/field/open-work-orders.ts
git commit -m "feat(confirm): WO-aware arrival confirm; work_order entity; open activity"
```

---

### Task 5: Day Review — fix API wiring + WO UI

**Files:**
- Modify: `apps/web/lib/day-review/queries.ts`
- Modify: `apps/web/app/app/day-review/VisitsSection.tsx`
- Create: `apps/web/components/field/WorkOrderPicker.tsx`
- Modify: `apps/web/lib/day-review/group-visits.ts` if group payload needs WO fields

- [ ] **Step 1: Query WO fields**

In `getDayReview` candidate SELECT, add:

```sql
vc.work_order_id, vc.wo_resolution,
w.title AS work_order_title
-- LEFT JOIN work_orders w ON w.id = vc.work_order_id
```

Extend `DayReviewPayload["visits"]` with `workOrderId`, `workOrderTitle`, `woResolution`.

- [ ] **Step 2: Fix confirm/ignore client calls**

In `VisitsSection.tsx`, replace broken `fetch('/api/v1/visit-candidates/${id}/confirm', { method: 'POST', ...})` with:

```ts
async function confirmIds(ids: string[], classification: string, workOrderId?: string) {
  await Promise.all(
    ids.map((id) =>
      fetch(`/api/v1/visit-candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: classification === "ignore" ? "ignore" : "confirm",
          classification: classification === "ignore" ? undefined : classification,
          work_order_id: workOrderId ?? undefined,
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw Object.assign(new Error("confirm failed"), { status: res.status, body });
        }
      }),
    ),
  );
  setDone((s) => new Set([...s, ...ids]));
}
```

Ignore button must call API with `action: "ignore"` (currently only local state).

- [ ] **Step 3: Show WO + picker on ambiguous**

On each group, if any member has `woResolution === "ambiguous"` (or missing WO for job_work):

- Show `WorkOrderPicker` (fetch open WOs for `propertyId` via small GET or embed options from server).
- Prefer server-side: add `openWorkOrders` to day-review payload per property in Task 5 query join (cleaner, no extra round trip).

`WorkOrderPicker.tsx` (client):

```tsx
"use client";
export function WorkOrderPicker({
  options,
  value,
  onChange,
}: {
  options: { id: string; title: string; scheduledToday?: boolean }[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <select
      className="text-sm border rounded px-2 py-1 mb-2 w-full"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      data-testid="work-order-picker"
    >
      <option value="" disabled>Select work order…</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.title}{o.scheduledToday ? " · today" : ""}
        </option>
      ))}
    </select>
  );
}
```

Disable Job work button until WO selected when ambiguous.

- [ ] **Step 4: Manual smoke**

```bash
pnpm dev:web
# Open /app/day-review with pending candidates
# Confirm job work → activity_entries.entity_type = work_order
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/day-review apps/web/app/app/day-review/VisitsSection.tsx apps/web/components/field/WorkOrderPicker.tsx
git commit -m "feat(day-review): WO-aware confirm; fix PATCH API; ignore hits server"
```

---

### Task 6: My Work — ArrivalProposalBanner + deep link

**Files:**
- Create: `apps/web/lib/field/load-arrival-proposals.ts`
- Create: `apps/web/components/field/ArrivalProposalBanner.tsx`
- Modify: `apps/web/app/app/my-work/page.tsx`

- [ ] **Step 1: Loader**

```ts
// apps/web/lib/field/load-arrival-proposals.ts
import type { AuthSession } from "@/lib/auth/middleware";
import { queryForSession } from "@/lib/db";

export type ArrivalProposalDto = {
  id: string;
  propertyName: string;
  clientName: string;
  workOrderId: string | null;
  workOrderTitle: string | null;
  woResolution: string;
  confidenceScore: number;
  arrivalTime: string;
  departureTime: string | null;
  liveEligible: boolean;
};

export async function loadPendingArrivalProposals(
  session: AuthSession,
): Promise<ArrivalProposalDto[]> {
  return queryForSession(
    session,
    `SELECT vc.id, COALESCE(p.address, 'Property') AS "propertyName",
            COALESCE(c.name, 'Client') AS "clientName",
            vc.work_order_id AS "workOrderId",
            w.title AS "workOrderTitle",
            vc.wo_resolution AS "woResolution",
            vc.confidence_score AS "confidenceScore",
            vc.arrival_time::text AS "arrivalTime",
            vc.departure_time::text AS "departureTime",
            vc.live_eligible AS "liveEligible"
     FROM visit_candidates vc
     LEFT JOIN properties p ON p.id = vc.property_id
     LEFT JOIN clients c ON c.id = vc.matched_client_id
     LEFT JOIN work_orders w ON w.id = vc.work_order_id
     WHERE vc.account_id = $1 AND vc.status = 'pending'
       AND vc.arrival_time::date = (now() AT TIME ZONE 'America/New_York')::date
     ORDER BY vc.live_eligible DESC, vc.arrival_time DESC
     LIMIT 10`,
    [session.accountId],
  );
}
```

(Adjust `queryForSession` signature to match existing helpers if it returns `{ rows }` — mirror `loadFieldDayData` patterns.)

- [ ] **Step 2: Banner component**

```tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { ArrivalProposalDto } from "@/lib/field/load-arrival-proposals";
import { WorkOrderPicker } from "./WorkOrderPicker";

export function ArrivalProposalBanner({
  proposals,
  openWorkOrdersByProperty,
}: {
  proposals: ArrivalProposalDto[];
  openWorkOrdersByProperty: Record<string, { id: string; title: string; scheduledToday?: boolean }[]>;
}) {
  const params = useSearchParams();
  const focus = params.get("proposal");
  const ordered = [...proposals].sort((a, b) =>
    a.id === focus ? -1 : b.id === focus ? 1 : 0,
  );
  const top = ordered[0];
  const [woId, setWoId] = useState<string | null>(top?.workOrderId ?? null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  if (!top) return null;

  const ambiguous = top.woResolution === "ambiguous";

  async function act(action: "confirm" | "ignore") {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/visit-candidates/${top.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          classification: action === "confirm" ? "job_work" : undefined,
          work_order_id: action === "confirm" ? woId : undefined,
          switch_activity: true,
        }),
      });
      if (!res.ok) {
        // surface error toast/text — keep banner
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border rounded-xl p-4 mb-4 bg-card" data-testid="arrival-proposal-banner">
      <div className="text-xs uppercase text-muted-foreground mb-1">On site</div>
      <div className="font-semibold">{top.clientName}</div>
      <div className="text-sm text-muted-foreground mb-3">
        {top.propertyName}
        {top.workOrderTitle ? ` · ${top.workOrderTitle}` : ""}
        {" · "}{top.confidenceScore}%
      </div>
      {ambiguous && (
        <WorkOrderPicker
          options={/* load from openWorkOrdersByProperty using property id if available */}
          value={woId}
          onChange={setWoId}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="p7-btn p7-btn-primary"
          disabled={busy || (ambiguous && !woId)}
          onClick={() => act("confirm")}
        >
          Confirm job work
        </button>
        <button className="p7-btn" disabled={busy} onClick={() => act("ignore")}>
          Not this
        </button>
      </div>
    </div>
  );
}
```

Wire real `openWorkOrdersByProperty` from page query (same SQL as open WOs helper).

- [ ] **Step 3: Mount on My Work page**

In `apps/web/app/app/my-work/page.tsx`, after session load:

```tsx
const proposals = await loadPendingArrivalProposals(session);
// also load open WOs for properties in proposals
// Render <ArrivalProposalBanner /> near top of layout (above Right Now)
```

Wrap banner in a small client boundary if page is RSC — export a client wrapper that takes serializable props.

- [ ] **Step 4: Smoke**

Open `/app/my-work?proposal=<pending-id>` with seeded pending candidate → banner focused → Confirm → activity on WO.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/field/load-arrival-proposals.ts apps/web/components/field/ArrivalProposalBanner.tsx apps/web/app/app/my-work/page.tsx
git commit -m "feat(my-work): live arrival proposal banner + deep link"
```

---

### Task 7: HA arrival prompt ack + docs

**Files:**
- Create: `apps/web/app/api/internal/arrival-prompt/route.ts` (optional dedicated ack)
- Modify: `docs/working/location-capture.md`
- Modify: `docs/working/ha-location-capture.yaml` if present (document notification)

- [ ] **Step 1: Ack endpoint**

`POST /api/internal/arrival-prompt` with internal API key:

Body: `{ candidate_id: uuid, action: "prompted" }`

```sql
UPDATE visit_candidates
SET live_prompted_at = COALESCE(live_prompted_at, now()), updated_at = now()
WHERE id = $1 AND account_id = $2 AND status = 'pending'
```

Returns `{ ok: true, already: boolean }`.

Alternatively stamp `live_prompted_at` when location response first returns `arrival_prompt` if HA cannot ack — **prefer ack** for accurate “push sent” semantics; if HA not ready, stamp on first My Work load of live-eligible row as fallback.

- [ ] **Step 2: Document response field**

Update `docs/working/location-capture.md` Response section:

```markdown
### arrival_prompt (optional)

When a new live-eligible visit_candidate is created, response may include:

```json
{
  "arrival_prompt": {
    "candidate_id": "uuid",
    "property_label": "68 Claremont",
    "wo_title": "Kitchen refresh",
    "wo_resolution": "clear",
    "deep_link": "/app/my-work?proposal=uuid",
    "confidence": 92
  }
}
```

HA automation: if `arrival_prompt` present, send Companion notification with deep link,
then `POST /api/internal/arrival-prompt` with `{ "candidate_id", "action": "prompted" }`.
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/internal/arrival-prompt docs/working/location-capture.md
git commit -m "feat(ha): arrival_prompt ack endpoint + location capture docs"
```

---

### Task 8: Shared open-WOs helper + extract duplication

**Files:**
- Create: `apps/web/lib/field/open-work-orders.ts`
- Modify: location route + confirm route + day-review queries to import it

- [ ] **Step 1: Extract**

```ts
// apps/web/lib/field/open-work-orders.ts
import type { PoolClient } from "pg";
import type { OpenWorkOrderOption } from "@ai-fsm/domain";

export async function listOpenWorkOrdersAtProperty(
  client: PoolClient,
  accountId: string,
  propertyId: string,
  atIso: string,
): Promise<OpenWorkOrderOption[]> {
  const { rows } = await client.query<{
    id: string; title: string; status: string; visit_id: string | null; scheduled_today: boolean;
  }>(/* same SQL as Task 3 */);
  return rows.map((w) => ({
    id: w.id,
    title: w.title,
    status: w.status,
    scheduledToday: w.scheduled_today,
    visitId: w.visit_id,
  }));
}
```

- [ ] **Step 2: Replace inlined SQL in location + confirm + day-review**

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/field/open-work-orders.ts apps/web/app/api/internal/location/route.ts apps/web/app/api/v1/visit-candidates
git commit -m "refactor(field): shared open work orders at property helper"
```

---

### Task 9: E2E smoke + gate

**Files:**
- Modify: `tests/e2e/day-review.spec.ts` and/or `tests/e2e/my-day-mobile.spec.ts`

- [ ] **Step 1: Day Review smoke**

If seed helpers exist for candidates, add:

```ts
test("day review confirm job work attaches work order", async ({ page }) => {
  // login as owner (existing helper)
  await page.goto(`${BASE}/app/day-review`);
  // if pending visit group visible:
  const jobWork = page.getByRole("button", { name: /job work/i }).first();
  if (await jobWork.isVisible()) {
    await jobWork.click();
    // assert no error toast; group disappears or marked done
  }
});
```

- [ ] **Step 2: My Work banner smoke**

```ts
test("my work shows arrival banner when proposal query present", async ({ page }) => {
  await page.goto(`${BASE}/app/my-work`);
  // With seeded live-eligible candidate: expect data-testid=arrival-proposal-banner
});
```

- [ ] **Step 3: Run unit + fast gate**

```bash
pnpm --filter @ai-fsm/domain exec vitest run src/visit-matching.test.ts
pnpm gate:fast
```

Expected: pass (or fix failures introduced).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): arrival assignment day-review + my-work smokes"
```

---

### Task 10: Spec status + backlog note

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-arrival-assignment-protocol-design.md` status → Implemented (or leave until shipped)
- Optionally add backlog TASK pointer under EPIC-007

- [ ] **Step 1:** After all tasks land, set spec **Status: Implemented** with PR links.
- [ ] **Step 2: Final commit**

```bash
git add docs/superpowers/specs/2026-07-30-arrival-assignment-protocol-design.md
git commit -m "docs: mark arrival assignment protocol implemented"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| `resolveWorkOrderForProperty` multi always ambiguous | Task 1 |
| `isLivePromptEligible` high bar | Task 1 |
| Migration WO + live + open stop nulls | Task 2 |
| Proposal builder sets WO resolution | Task 3 |
| No silent billable (autoRecord presence-only) | Task 3 |
| `arrival_prompt` for HA | Task 3, 7 |
| Confirm API WO + work_order entity | Task 4 |
| Open activity when still on site | Task 4 |
| Switch open activity | Task 4 |
| 409 ambiguous_work_order | Task 4 |
| Day Review same confirm + WO picker | Task 5 |
| Fix Confirm All / ignore API | Task 5 |
| My Work banner + deep link | Task 6 |
| HA ack + docs | Task 7 |
| DRY open WO SQL | Task 8 |
| E2E / gate | Task 9 |
| Out of scope: invoice lines, auto-start TASK-077, Operational Inbox | Not planned |

---

## Out of scope (do not implement in this plan)

- Silent auto-start of `job_work` (TASK-077)
- Full Operational Inbox (TASK-049)
- Draft invoice lines from labor
- Auto-close activity on departure
- Open-stop candidate creation mid-dwell (nullable columns enable it; **closed-stop path is required**; open-stop live path can follow as Task 3b if time allows — optional stretch: on `location_update` with open stop dwell ≥ 5 min, upsert candidate with `departure_time` null)

**Optional stretch (only if Tasks 1–9 green):** open-stop provisional proposal in location reducer path.
