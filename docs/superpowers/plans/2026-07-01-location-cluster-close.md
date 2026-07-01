# Location Cluster Close — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End-to-end end-of-day experience — RAM Bluetooth triggers start-day prompt, home zone arrival after 5 PM triggers day review, smart review surface reconciles visits/time/mileage, Close Day stamps the record.

**Architecture:** Two new HA-facing internal endpoints set state on `business_days`. A new day-review read endpoint assembles three data sections from existing tables. The UI is a single `/app/day-review` page with three collapsible sections and a Close Day button that drives the existing business-day state machine through READY_TO_CLOSE → CLOSED. Settings knobs live as new columns on `accounts` surfaced in a new tab on the existing settings page.

**Tech Stack:** Next.js App Router, Vitest, PostgreSQL, Zod, `withAuth` middleware, existing `setBusinessDayStatus`/`checkBusinessDayTransition` domain functions, Tailwind CSS following existing component patterns.

## Global Constraints

- All migrations must be additive (`ADD COLUMN IF NOT EXISTS`); include rollback comment at bottom.
- Internal endpoints authenticate via `x-api-key` header against a `process.env.*_INTERNAL_KEY` env var (see `apps/web/app/api/internal/location/route.ts` for the exact pattern).
- All `withAuth` routes use the existing pattern from `apps/web/app/api/v1/business-day/transition/route.ts`.
- Unit tests go in `packages/domain/src/day-review.test.ts` using Vitest (`import { describe, it, expect } from "vitest"`).
- Integration tests go in `apps/web/lib/day-review/__tests__/day-review.integration.test.ts`, guard with `describe.skipIf(!RUN_HTTP_INTEGRATION)`, match the pattern in `apps/web/lib/auth/__tests__/auth.integration.test.ts`.
- E2E tests go in `tests/e2e/day-review.spec.ts`, follow the pattern in `tests/e2e/core-flow.spec.ts`.
- Run unit tests: `pnpm --filter @ai-fsm/domain test`.
- Run fast gate: `pnpm gate:fast`.
- Pages live at `apps/web/app/app/<name>/page.tsx` (no route group wrapper — the app uses `app/app/`).
- Close Day = transition to `READY_TO_CLOSE` then `CLOSED` via existing domain state machine; never bypass `checkBusinessDayTransition`.
- `business_days.closed_at` already exists (migration 127). Do NOT re-add it.

---

## File Map

**Create:**
- `db/migrations/136_business_days_review_prompted.sql`
- `db/migrations/137_accounts_day_review_settings.sql`
- `packages/domain/src/day-review.ts`
- `packages/domain/src/day-review.test.ts`
- `apps/web/app/api/internal/start-day-prompt/route.ts`
- `apps/web/app/api/internal/day-review-prompt/route.ts`
- `apps/web/lib/day-review/queries.ts`
- `apps/web/lib/day-review/__tests__/day-review.integration.test.ts`
- `apps/web/app/api/v1/day-review/[date]/route.ts`
- `apps/web/app/api/v1/day-review/close/route.ts`
- `apps/web/app/app/day-review/page.tsx`
- `apps/web/app/app/day-review/VisitsSection.tsx`
- `apps/web/app/app/day-review/TimeSection.tsx`
- `apps/web/app/app/day-review/MileageSection.tsx`
- `apps/web/app/app/day-review/CloseButton.tsx`
- `apps/web/app/app/settings/LocationDaySettings.tsx`
- `tests/e2e/day-review.spec.ts`

**Modify:**
- `packages/domain/src/index.ts` — add `export * from "./day-review"`
- `apps/web/app/api/v1/location-settings/route.ts` — extend PATCH schema for 7 new settings columns
- `apps/web/app/app/settings/SettingsTabsClient.tsx` — add "Location & Day" tab
- `apps/web/app/app/layout.tsx` (or the nav component) — add review-pending badge

---

## Task 1: Database Migrations

**Files:**
- Create: `db/migrations/136_business_days_review_prompted.sql`
- Create: `db/migrations/137_accounts_day_review_settings.sql`

**Interfaces:**
- Produces: `business_days.review_prompted_at TIMESTAMPTZ`, `activity_entries.revised_after_close BOOLEAN`, 7 new `accounts` columns (see below)

- [ ] **Step 1: Write migration 136**

```sql
-- Migration 136: day-review state columns.
--
-- business_days.review_prompted_at — when HA fired the home-arrival trigger.
-- activity_entries.revised_after_close — stamps entries created/modified after
--   the business day was already CLOSED (the audit trail for post-close edits).

ALTER TABLE business_days
  ADD COLUMN IF NOT EXISTS review_prompted_at TIMESTAMPTZ;

ALTER TABLE activity_entries
  ADD COLUMN IF NOT EXISTS revised_after_close BOOLEAN NOT NULL DEFAULT FALSE;

-- Rollback:
-- ALTER TABLE business_days DROP COLUMN IF EXISTS review_prompted_at;
-- ALTER TABLE activity_entries DROP COLUMN IF EXISTS revised_after_close;
```

- [ ] **Step 2: Write migration 137**

```sql
-- Migration 137: account-level day-review settings.
--
-- All nullable or with safe defaults so existing rows are unaffected.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS day_review_cutoff_time     TIME     NOT NULL DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS min_stop_dwell_minutes     INTEGER  NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS visit_confidence_threshold INTEGER  NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS suppress_weekend_start_prompt BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS close_day_followup_hours   INTEGER,
  ADD COLUMN IF NOT EXISTS tracking_start_time        TIME,
  ADD COLUMN IF NOT EXISTS tracking_end_time          TIME;

-- Note: location_retention_days already exists (migration 124). Not re-added.

-- Rollback:
-- ALTER TABLE accounts
--   DROP COLUMN IF EXISTS day_review_cutoff_time,
--   DROP COLUMN IF EXISTS min_stop_dwell_minutes,
--   DROP COLUMN IF EXISTS visit_confidence_threshold,
--   DROP COLUMN IF EXISTS suppress_weekend_start_prompt,
--   DROP COLUMN IF EXISTS close_day_followup_hours,
--   DROP COLUMN IF EXISTS tracking_start_time,
--   DROP COLUMN IF EXISTS tracking_end_time;
```

- [ ] **Step 3: Apply migrations**

```bash
pnpm db:migrate
```

Expected: `Applied migration 136_business_days_review_prompted.sql` and `Applied migration 137_accounts_day_review_settings.sql`

- [ ] **Step 4: Commit**

```bash
git add db/migrations/136_business_days_review_prompted.sql db/migrations/137_accounts_day_review_settings.sql
git commit -m "feat: add review_prompted_at, revised_after_close, and day-review account settings"
```

---

## Task 2: Domain Pure Functions

**Files:**
- Create: `packages/domain/src/day-review.ts`
- Create: `packages/domain/src/day-review.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces:
  - `detectGaps(segments: Segment[], entries: ActivityEntry[], minDwellMinutes: number): DayGap[]`
  - `preSelectCandidates(candidates: ScoredCandidate[], threshold: number): ScoredCandidate[]`
  - `checkMileageDelta(odometerMiles: number | null, gpsMiles: number): MileageDeltaResult`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/domain/src/day-review.test.ts
import { describe, it, expect } from "vitest";
import { detectGaps, preSelectCandidates, checkMileageDelta } from "./day-review";

describe("detectGaps", () => {
  const makeSegment = (startedAt: string, endedAt: string) => ({ startedAt, endedAt });
  const makeEntry = (startedAt: string, endedAt: string) => ({ startedAt, endedAt });

  it("returns empty when segments cover the full day", () => {
    const segments = [
      makeSegment("2026-07-01T08:00:00Z", "2026-07-01T12:00:00Z"),
      makeSegment("2026-07-01T12:05:00Z", "2026-07-01T17:00:00Z"),
    ];
    expect(detectGaps(segments, [], 30)).toEqual([]);
  });

  it("detects a gap between two segments when > minDwellMinutes", () => {
    const segments = [
      makeSegment("2026-07-01T08:00:00Z", "2026-07-01T10:00:00Z"),
      makeSegment("2026-07-01T12:00:00Z", "2026-07-01T15:00:00Z"),
    ];
    const gaps = detectGaps(segments, [], 30);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].durationMinutes).toBe(120);
    expect(gaps[0].startsAt).toBe("2026-07-01T10:00:00Z");
    expect(gaps[0].endsAt).toBe("2026-07-01T12:00:00Z");
  });

  it("ignores gaps shorter than minDwellMinutes", () => {
    const segments = [
      makeSegment("2026-07-01T08:00:00Z", "2026-07-01T10:00:00Z"),
      makeSegment("2026-07-01T10:10:00Z", "2026-07-01T12:00:00Z"),
    ];
    expect(detectGaps(segments, [], 30)).toEqual([]);
  });

  it("ignores gaps covered by an activity entry", () => {
    const segments = [
      makeSegment("2026-07-01T08:00:00Z", "2026-07-01T10:00:00Z"),
      makeSegment("2026-07-01T12:00:00Z", "2026-07-01T14:00:00Z"),
    ];
    const entries = [makeEntry("2026-07-01T10:00:00Z", "2026-07-01T12:00:00Z")];
    expect(detectGaps(segments, entries, 30)).toEqual([]);
  });
});

describe("preSelectCandidates", () => {
  const c = (id: string, score: number) => ({ id, confidenceScore: score });

  it("selects candidates at or above threshold", () => {
    const result = preSelectCandidates([c("a", 80), c("b", 70), c("c", 60)], 70);
    expect(result.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("returns empty when nothing meets threshold", () => {
    expect(preSelectCandidates([c("a", 50)], 70)).toEqual([]);
  });
});

describe("checkMileageDelta", () => {
  it("flags when GPS differs from odometer by more than 20%", () => {
    const result = checkMileageDelta(100, 130);
    expect(result.flagged).toBe(true);
    expect(result.deltaPercent).toBe(30);
  });

  it("does not flag when within 20%", () => {
    const result = checkMileageDelta(100, 115);
    expect(result.flagged).toBe(false);
    expect(result.deltaPercent).toBe(15);
  });

  it("returns flagged=false and null deltaPercent when odometer is null", () => {
    const result = checkMileageDelta(null, 50);
    expect(result.flagged).toBe(false);
    expect(result.deltaPercent).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
pnpm --filter @ai-fsm/domain test day-review
```

Expected: FAIL — `Cannot find module './day-review'`

- [ ] **Step 3: Implement the functions**

```typescript
// packages/domain/src/day-review.ts

export type DayGap = {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
};

type Segment = { startedAt: string; endedAt: string };
type ActivityEntry = { startedAt: string; endedAt: string };

/**
 * Returns coverage gaps between segments that are not filled by an activity
 * entry and exceed minDwellMinutes.
 */
export function detectGaps(
  segments: Segment[],
  entries: ActivityEntry[],
  minDwellMinutes: number,
): DayGap[] {
  if (segments.length < 2) return [];
  const sorted = [...segments].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const gaps: DayGap[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].endedAt;
    const gapEnd = sorted[i + 1].startedAt;
    const gapMs = new Date(gapEnd).getTime() - new Date(gapStart).getTime();
    const durationMinutes = gapMs / 60000;
    if (durationMinutes < minDwellMinutes) continue;
    const covered = entries.some((e) => {
      const es = new Date(e.startedAt).getTime();
      const ee = new Date(e.endedAt).getTime();
      return es <= new Date(gapStart).getTime() && ee >= new Date(gapEnd).getTime();
    });
    if (!covered) gaps.push({ startsAt: gapStart, endsAt: gapEnd, durationMinutes });
  }
  return gaps;
}

export type ScoredCandidate = { id: string; confidenceScore: number; [key: string]: unknown };

/** Returns candidates whose confidenceScore is at or above threshold. */
export function preSelectCandidates<T extends ScoredCandidate>(
  candidates: T[],
  threshold: number,
): T[] {
  return candidates.filter((c) => c.confidenceScore >= threshold);
}

export type MileageDeltaResult = {
  deltaPercent: number | null;
  flagged: boolean;
};

/** Compares GPS-estimated miles to odometer miles; flags if delta > 20%. */
export function checkMileageDelta(
  odometerMiles: number | null,
  gpsMiles: number,
): MileageDeltaResult {
  if (odometerMiles == null) return { deltaPercent: null, flagged: false };
  const deltaPercent = Math.round(Math.abs((gpsMiles - odometerMiles) / odometerMiles) * 100);
  return { deltaPercent, flagged: deltaPercent > 20 };
}
```

- [ ] **Step 4: Export from the domain index**

Add to the bottom of `packages/domain/src/index.ts`:
```typescript
export * from "./day-review";
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm --filter @ai-fsm/domain test day-review
```

Expected: all 7 tests PASS

- [ ] **Step 6: Fast gate**

```bash
pnpm gate:fast
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/day-review.ts packages/domain/src/day-review.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): add detectGaps, preSelectCandidates, checkMileageDelta"
```

---

## Task 3: Internal HA Endpoints

**Files:**
- Create: `apps/web/app/api/internal/start-day-prompt/route.ts`
- Create: `apps/web/app/api/internal/day-review-prompt/route.ts`
- Create: `apps/web/lib/day-review/__tests__/day-review.integration.test.ts` (partial — internal endpoint tests)

**Interfaces:**
- Consumes: `LOCATION_INTERNAL_KEY` auth pattern from `apps/web/app/api/internal/location/route.ts`
- Produces:
  - `POST /api/internal/start-day-prompt` → `{ signal: "start" | "suppress_weekend" | "already_started" | "no_action" }`
  - `POST /api/internal/day-review-prompt` → `{ result: "prompted" | "skipped", reason?: string }`

- [ ] **Step 1: Write start-day-prompt route**

```typescript
// apps/web/app/api/internal/start-day-prompt/route.ts
import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

const KEY = process.env.LOCATION_INTERNAL_KEY;

type AccountRow = {
  account_id: string;
  suppress_weekend_start_prompt: boolean;
  has_open_day: boolean;
};

export async function POST(req: NextRequest) {
  if (!KEY || req.headers.get("x-api-key") !== KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await queryOne<AccountRow>(
    `SELECT a.id AS account_id,
            a.suppress_weekend_start_prompt,
            EXISTS (
              SELECT 1 FROM business_days bd
              WHERE bd.account_id = a.id
                AND bd.business_date = CURRENT_DATE
                AND bd.status NOT IN ('CLOSED','REOPENED')
            ) AS has_open_day
     FROM accounts a
     JOIN users u ON u.account_id = a.id
     WHERE u.role = 'owner'
     ORDER BY u.created_at LIMIT 1`,
  );

  if (!row) return NextResponse.json({ signal: "no_action" });
  if (row.has_open_day) return NextResponse.json({ signal: "already_started" });

  const dayOfWeek = new Date().getDay(); // 0=Sun, 6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (isWeekend && row.suppress_weekend_start_prompt) {
    return NextResponse.json({ signal: "suppress_weekend" });
  }

  return NextResponse.json({ signal: "start" });
}
```

- [ ] **Step 2: Write day-review-prompt route**

```typescript
// apps/web/app/api/internal/day-review-prompt/route.ts
import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

const KEY = process.env.LOCATION_INTERNAL_KEY;

type GateRow = {
  account_id: string;
  business_day_id: string | null;
  cutoff_time: string; // e.g. "17:00:00"
  already_prompted: boolean;
};

export async function POST(req: NextRequest) {
  if (!KEY || req.headers.get("x-api-key") !== KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await queryOne<GateRow>(
    `SELECT a.id AS account_id,
            bd.id AS business_day_id,
            a.day_review_cutoff_time::text AS cutoff_time,
            (bd.review_prompted_at IS NOT NULL) AS already_prompted
     FROM accounts a
     JOIN users u ON u.account_id = a.id
     LEFT JOIN business_days bd
       ON bd.account_id = a.id
       AND bd.business_date = CURRENT_DATE
       AND bd.status NOT IN ('CLOSED')
     WHERE u.role = 'owner'
     ORDER BY u.created_at LIMIT 1`,
  );

  if (!row?.business_day_id) {
    return NextResponse.json({ result: "skipped", reason: "no_open_day" });
  }
  if (row.already_prompted) {
    return NextResponse.json({ result: "skipped", reason: "already_prompted" });
  }

  // Check time gate: current time (UTC) vs cutoff stored as TIME in local-ish
  // context. Use AT TIME ZONE in postgres for accuracy; here we check server time.
  // The cutoff is stored as a plain TIME (e.g. "17:00:00"). Parse hours/minutes.
  const [cutoffHour, cutoffMin] = row.cutoff_time.split(":").map(Number);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const cutoffMinutes = cutoffHour * 60 + cutoffMin;

  if (nowMinutes < cutoffMinutes) {
    return NextResponse.json({ result: "skipped", reason: "before_cutoff" });
  }

  await queryOne(
    `UPDATE business_days SET review_prompted_at = now(), updated_at = now()
     WHERE id = $1`,
    [row.business_day_id],
  );

  return NextResponse.json({ result: "prompted" });
}
```

- [ ] **Step 3: Write integration tests (internal endpoints)**

```typescript
// apps/web/lib/day-review/__tests__/day-review.integration.test.ts
import { describe, it, expect } from "vitest";

const RUN_HTTP_INTEGRATION =
  !!process.env.TEST_BASE_URL && !!process.env.TEST_DATABASE_URL;

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const INTERNAL_KEY = process.env.LOCATION_INTERNAL_KEY ?? "test-key";

describe.skipIf(!RUN_HTTP_INTEGRATION)("Day Review internal endpoints", () => {
  async function postInternal(path: string) {
    return fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "x-api-key": INTERNAL_KEY, "Content-Type": "application/json" },
      body: "{}",
    });
  }

  describe("POST /api/internal/start-day-prompt", () => {
    it("returns 401 without key", async () => {
      const res = await fetch(`${BASE_URL}/api/internal/start-day-prompt`, { method: "POST" });
      expect(res.status).toBe(401);
    });

    it("returns a valid signal with auth key", async () => {
      const res = await postInternal("/api/internal/start-day-prompt");
      expect(res.status).toBe(200);
      const body = await res.json() as { signal: string };
      expect(["start", "suppress_weekend", "already_started", "no_action"]).toContain(body.signal);
    });
  });

  describe("POST /api/internal/day-review-prompt", () => {
    it("returns 401 without key", async () => {
      const res = await fetch(`${BASE_URL}/api/internal/day-review-prompt`, { method: "POST" });
      expect(res.status).toBe(401);
    });

    it("returns a valid result with auth key", async () => {
      const res = await postInternal("/api/internal/day-review-prompt");
      expect(res.status).toBe(200);
      const body = await res.json() as { result: string };
      expect(["prompted", "skipped"]).toContain(body.result);
    });
  });
});
```

- [ ] **Step 4: Fast gate**

```bash
pnpm gate:fast
```

Expected: PASS (integration tests skip without env vars)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/internal/start-day-prompt/route.ts \
        apps/web/app/api/internal/day-review-prompt/route.ts \
        apps/web/lib/day-review/__tests__/day-review.integration.test.ts
git commit -m "feat: add HA-facing start-day-prompt and day-review-prompt endpoints"
```

---

## Task 4: Day Review Data Endpoint + Close Convenience

**Files:**
- Create: `apps/web/lib/day-review/queries.ts`
- Create: `apps/web/app/api/v1/day-review/[date]/route.ts`
- Create: `apps/web/app/api/v1/day-review/close/route.ts`
- Modify: `apps/web/lib/day-review/__tests__/day-review.integration.test.ts` (add API tests)

**Interfaces:**
- Consumes: `detectGaps`, `preSelectCandidates`, `checkMileageDelta` from `@ai-fsm/domain`
- Consumes: `setBusinessDayStatus`, `getBusinessDayById` from `@/lib/operations/business-day`
- Produces:
  - `GET /api/v1/day-review/[date]` → `DayReviewPayload`
  - `POST /api/v1/day-review/close` → `{ data: { closedAt: string } }`

```typescript
// Type produced by GET /api/v1/day-review/[date] — consumed by Task 5 UI
export type DayReviewPayload = {
  businessDayId: string;
  date: string;
  status: string;
  reviewPromptedAt: string | null;
  closedAt: string | null;
  visits: {
    id: string;
    propertyName: string;
    clientName: string;
    arrivalTime: string;
    departureTime: string;
    durationMinutes: number;
    confidenceScore: number;
    preSelected: boolean;
    linkedJobId: string | null;
    classification: string | null;
    status: string;
  }[];
  segments: {
    id: string;
    kind: "stop" | "drive";
    startedAt: string;
    endedAt: string;
    placeLabel: string | null;
    zone: string | null;
    status: string;
    isLikelyNoise: boolean;
  }[];
  gaps: { startsAt: string; endsAt: string; durationMinutes: number }[];
  mileage: {
    vehicleSessionId: string | null;
    vehicleName: string | null;
    odometerMiles: number | null;
    gpsMiles: number;
    deltaPercent: number | null;
    flagged: boolean;
  };
};
```

- [ ] **Step 1: Write the query layer**

```typescript
// apps/web/lib/day-review/queries.ts
import { query, queryOne } from "@/lib/db";
import {
  detectGaps,
  preSelectCandidates,
  checkMileageDelta,
  type DayReviewPayload,
} from "@ai-fsm/domain";

export async function getDayReview(
  accountId: string,
  date: string, // YYYY-MM-DD
): Promise<DayReviewPayload | null> {
  const day = await queryOne<{
    id: string;
    status: string;
    review_prompted_at: string | null;
    closed_at: string | null;
    confidence_threshold: number;
    min_dwell: number;
  }>(
    `SELECT bd.id, bd.status, bd.review_prompted_at::text, bd.closed_at::text,
            a.visit_confidence_threshold AS confidence_threshold,
            a.min_stop_dwell_minutes AS min_dwell
     FROM business_days bd
     JOIN accounts a ON a.id = bd.account_id
     WHERE bd.account_id = $1 AND bd.business_date = $2::date`,
    [accountId, date],
  );
  if (!day) return null;

  // Visit candidates
  const candidateRows = await query<{
    id: string;
    property_name: string;
    client_name: string;
    arrival_time: string;
    departure_time: string;
    duration_minutes: number;
    confidence_score: number;
    linked_job_id: string | null;
    classification: string | null;
    status: string;
  }>(
    `SELECT vc.id, p.address AS property_name, c.name AS client_name,
            vc.arrival_time::text, vc.departure_time::text,
            vc.duration_minutes, vc.confidence_score,
            vc.job_id AS linked_job_id, vc.classification, vc.status
     FROM visit_candidates vc
     JOIN properties p ON p.id = vc.property_id
     JOIN clients c ON c.id = vc.matched_client_id
     WHERE vc.account_id = $1
       AND vc.arrival_time::date = $2::date
       AND vc.status = 'pending'
     ORDER BY vc.arrival_time ASC`,
    [accountId, date],
  );

  const scoredCandidates = candidateRows.map((r) => ({
    id: r.id,
    confidenceScore: r.confidence_score,
    propertyName: r.property_name,
    clientName: r.client_name,
    arrivalTime: r.arrival_time,
    departureTime: r.departure_time,
    durationMinutes: r.duration_minutes,
    linkedJobId: r.linked_job_id,
    classification: r.classification,
    status: r.status,
  }));
  const preSelected = preSelectCandidates(scoredCandidates, day.confidence_threshold);
  const preSelectedIds = new Set(preSelected.map((c) => c.id));

  // Location segments
  const segmentRows = await query<{
    id: string;
    kind: "stop" | "drive";
    started_at: string;
    ended_at: string;
    place_label: string | null;
    zone: string | null;
    status: string;
    is_likely_noise: boolean;
  }>(
    `SELECT id, kind, started_at::text, ended_at::text,
            place_label, zone, status, is_likely_noise
     FROM location_segments
     WHERE account_id = $1 AND segment_date = $2::date AND ended_at IS NOT NULL
     ORDER BY started_at ASC`,
    [accountId, date],
  );

  // Activity entries (for gap coverage check)
  const entryRows = await query<{ started_at: string; ended_at: string }>(
    `SELECT started_at::text AS started_at, ended_at::text AS ended_at
     FROM activity_entries
     WHERE account_id = $1 AND started_at::date = $2::date
       AND voided_at IS NULL AND ended_at IS NOT NULL`,
    [accountId, date],
  );

  const gaps = detectGaps(
    segmentRows.map((s) => ({ startedAt: s.started_at, endedAt: s.ended_at })),
    entryRows.map((e) => ({ startedAt: e.started_at, endedAt: e.ended_at })),
    day.min_dwell,
  );

  // Mileage: vehicle session for the day + GPS drive totals
  const mileageRow = await queryOne<{
    vehicle_session_id: string | null;
    vehicle_name: string | null;
    odometer_miles: number | null;
    gps_meters: number | null;
  }>(
    `SELECT vs.id AS vehicle_session_id,
            v.name AS vehicle_name,
            vs.distance_miles AS odometer_miles,
            SUM(ls.distance_meters) AS gps_meters
     FROM vehicle_sessions vs
     LEFT JOIN vehicles v ON v.id = vs.vehicle_id
     LEFT JOIN location_segments ls
       ON ls.account_id = vs.account_id
       AND ls.segment_date = vs.session_date
       AND ls.kind = 'drive'
       AND ls.status = 'confirmed'
     WHERE vs.account_id = $1 AND vs.session_date = $2::date
     GROUP BY vs.id, v.name, vs.distance_miles
     LIMIT 1`,
    [accountId, date],
  );

  const gpsMiles = mileageRow?.gps_meters ? mileageRow.gps_meters / 1609.34 : 0;
  const mileageDelta = checkMileageDelta(mileageRow?.odometer_miles ?? null, gpsMiles);

  return {
    businessDayId: day.id,
    date,
    status: day.status,
    reviewPromptedAt: day.review_prompted_at,
    closedAt: day.closed_at,
    visits: scoredCandidates.map((c) => ({ ...c, preSelected: preSelectedIds.has(c.id) })),
    segments: segmentRows.map((s) => ({
      id: s.id,
      kind: s.kind,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      placeLabel: s.place_label,
      zone: s.zone,
      status: s.status,
      isLikelyNoise: s.is_likely_noise,
    })),
    gaps,
    mileage: {
      vehicleSessionId: mileageRow?.vehicle_session_id ?? null,
      vehicleName: mileageRow?.vehicle_name ?? null,
      odometerMiles: mileageRow?.odometer_miles ?? null,
      gpsMiles: Math.round(gpsMiles * 10) / 10,
      deltaPercent: mileageDelta.deltaPercent,
      flagged: mileageDelta.flagged,
    },
  };
}
```

- [ ] **Step 2: Write the GET route**

```typescript
// apps/web/app/api/v1/day-review/[date]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { logger } from "@/lib/logger";
import { getDayReview } from "@/lib/day-review/queries";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (
  _req: NextRequest,
  session,
  { params }: { params: { date: string } },
) => {
  const { date } = params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "date must be YYYY-MM-DD" } },
      { status: 400 },
    );
  }
  try {
    const payload = await getDayReview(session.accountId, date);
    if (!payload) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "No business day for this date" } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: payload });
  } catch (err) {
    logger.error("GET /api/v1/day-review/[date] error", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load day review" } },
      { status: 500 },
    );
  }
});
```

- [ ] **Step 3: Write the close convenience route**

This endpoint transitions the day from any open status → READY_TO_CLOSE → CLOSED in two steps. It reuses the existing `getBusinessDayById` and `setBusinessDayStatus` functions.

```typescript
// apps/web/app/api/v1/day-review/close/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getBusinessDayById, setBusinessDayStatus } from "@/lib/operations/business-day";
import { checkBusinessDayTransition } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const schema = z.object({ id: z.string().uuid() });

export const POST = withAuth(async (request: NextRequest, session) => {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "id required" } },
      { status: 400 },
    );
  }
  const { id } = parsed.data;
  try {
    const result = await withDbSession(session, async (client) => {
      const day = await getBusinessDayById(client, session.accountId, id, { lockForUpdate: true });
      if (!day) return { kind: "not_found" as const };
      if (day.status === "CLOSED") return { kind: "already_closed" as const, day };

      // Transition to READY_TO_CLOSE first if not already there.
      let currentStatus = day.status;
      if (currentStatus !== "READY_TO_CLOSE") {
        const check = checkBusinessDayTransition(currentStatus, "READY_TO_CLOSE", {});
        if (!check.ok) return { kind: "invalid" as const, reason: check.reason };
        const intermediate = await setBusinessDayStatus(
          client, session.accountId, id, currentStatus, "READY_TO_CLOSE", null,
        );
        if (!intermediate) return { kind: "conflict" as const };
        currentStatus = "READY_TO_CLOSE";
      }

      const updated = await setBusinessDayStatus(
        client, session.accountId, id, currentStatus, "CLOSED", null,
      );
      if (!updated) return { kind: "conflict" as const };
      return { kind: "ok" as const, updated };
    });

    if (result.kind === "not_found") {
      return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    }
    if (result.kind === "invalid") {
      return NextResponse.json(
        { error: { code: "INVALID_TRANSITION", message: result.reason } },
        { status: 409 },
      );
    }
    if (result.kind === "conflict") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "Business day changed — reload and retry." } },
        { status: 409 },
      );
    }
    const closedAt = result.kind === "already_closed"
      ? result.day.closed_at
      : result.updated?.closed_at;
    return NextResponse.json({ data: { closedAt } });
  } catch (err) {
    logger.error("POST /api/v1/day-review/close error", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to close day" } },
      { status: 500 },
    );
  }
});
```

- [ ] **Step 4: Add API integration tests**

Append to `apps/web/lib/day-review/__tests__/day-review.integration.test.ts`:

```typescript
// Append after existing internal endpoint tests:

describe.skipIf(!RUN_HTTP_INTEGRATION)("Day Review API", () => {
  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

  async function login() {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.com", password: "password" }),
    });
    const cookie = res.headers.get("set-cookie") ?? "";
    return cookie.match(/fsm_session=[^;]+/)?.[0] ?? "";
  }

  describe("GET /api/v1/day-review/[date]", () => {
    it("returns 400 for invalid date format", async () => {
      const session = await login();
      const res = await fetch(`${BASE_URL}/api/v1/day-review/not-a-date`, {
        headers: { Cookie: session },
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 when no business day exists for date", async () => {
      const session = await login();
      const res = await fetch(`${BASE_URL}/api/v1/day-review/1990-01-01`, {
        headers: { Cookie: session },
      });
      expect(res.status).toBe(404);
    });

    it("returns 401 without auth", async () => {
      const res = await fetch(`${BASE_URL}/api/v1/day-review/2026-07-01`);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/v1/day-review/close", () => {
    it("returns 400 without id", async () => {
      const session = await login();
      const res = await fetch(`${BASE_URL}/api/v1/day-review/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: session },
        body: "{}",
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 for unknown business day id", async () => {
      const session = await login();
      const res = await fetch(`${BASE_URL}/api/v1/day-review/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: session },
        body: JSON.stringify({ id: "00000000-0000-0000-0000-000000000000" }),
      });
      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **Step 5: Fast gate**

```bash
pnpm gate:fast
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/day-review/queries.ts \
        apps/web/app/api/v1/day-review/\[date\]/route.ts \
        apps/web/app/api/v1/day-review/close/route.ts \
        apps/web/lib/day-review/__tests__/day-review.integration.test.ts
git commit -m "feat: add day-review data endpoint and close convenience route"
```

---

## Task 5: Day Review UI Page

**Files:**
- Create: `apps/web/app/app/day-review/page.tsx`
- Create: `apps/web/app/app/day-review/VisitsSection.tsx`
- Create: `apps/web/app/app/day-review/TimeSection.tsx`
- Create: `apps/web/app/app/day-review/MileageSection.tsx`
- Create: `apps/web/app/app/day-review/CloseButton.tsx`
- Create: `tests/e2e/day-review.spec.ts`

**Interfaces:**
- Consumes: `DayReviewPayload` type from `apps/web/lib/day-review/queries.ts`
- Consumes: `GET /api/v1/day-review/[date]`, `POST /api/v1/day-review/close`
- Produces: `/app/day-review` page route

- [ ] **Step 1: Write the page (server component, fetches data)**

```typescript
// apps/web/app/app/day-review/page.tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDayReview } from "@/lib/day-review/queries";
import { VisitsSection } from "./VisitsSection";
import { TimeSection } from "./TimeSection";
import { MileageSection } from "./MileageSection";
import { CloseButton } from "./CloseButton";
import { PageContainer, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DayReviewPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const date = searchParams.date ?? new Date().toISOString().slice(0, 10);
  const payload = await getDayReview(session.accountId, date);

  if (!payload) {
    return (
      <PageContainer>
        <PageHeader title="Day Review" />
        <p className="text-muted-foreground mt-8 text-center">
          No business day found for {date}. Start your day first.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Day Review"
        subtitle={new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
      />

      {payload.visits.length > 0 && (
        <VisitsSection visits={payload.visits} date={date} />
      )}

      <TimeSection segments={payload.segments} gaps={payload.gaps} date={date} />

      <MileageSection mileage={payload.mileage} />

      <div className="mt-8 pb-8">
        <CloseButton
          businessDayId={payload.businessDayId}
          status={payload.status}
          closedAt={payload.closedAt}
        />
      </div>
    </PageContainer>
  );
}
```

- [ ] **Step 2: Write VisitsSection**

```typescript
// apps/web/app/app/day-review/VisitsSection.tsx
"use client";
import { useState } from "react";
import type { DayReviewPayload } from "@/lib/day-review/queries";

type Visit = DayReviewPayload["visits"][number];

export function VisitsSection({
  visits,
  date,
}: {
  visits: Visit[];
  date: string;
}) {
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const preSelected = visits.filter((v) => v.preSelected && !confirmed.has(v.id) && !ignored.has(v.id));
  const pending = visits.filter((v) => !v.preSelected && !confirmed.has(v.id) && !ignored.has(v.id));

  async function confirmVisit(id: string, classification: string) {
    await fetch(`/api/v1/visit-candidates/${id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classification }),
    });
    setConfirmed((s) => new Set([...s, id]));
  }

  async function confirmAll() {
    await Promise.all(preSelected.map((v) => confirmVisit(v.id, v.classification ?? "job_work")));
  }

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Visits</h2>
        {preSelected.length > 0 && (
          <button
            onClick={confirmAll}
            className="text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-md"
          >
            Confirm All ({preSelected.length})
          </button>
        )}
      </div>

      {[...preSelected, ...pending].map((visit) => (
        <div key={visit.id} className="border rounded-lg p-4 mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">{visit.clientName}</span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {visit.confidenceScore}% match
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {visit.propertyName} · {visit.durationMinutes} min
          </p>
          <div className="flex flex-wrap gap-2">
            {(["job_work", "estimate", "warranty", "material_drop", "ignore"] as const).map((cls) => (
              <button
                key={cls}
                onClick={() =>
                  cls === "ignore"
                    ? setIgnored((s) => new Set([...s, visit.id]))
                    : confirmVisit(visit.id, cls)
                }
                className="text-xs border rounded px-2 py-1 hover:bg-muted capitalize"
              >
                {cls.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
      ))}

      {visits.length === 0 && (
        <p className="text-sm text-muted-foreground">No detected visits for this day.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Write TimeSection**

```typescript
// apps/web/app/app/day-review/TimeSection.tsx
"use client";
import type { DayReviewPayload } from "@/lib/day-review/queries";

type Segment = DayReviewPayload["segments"][number];
type Gap = DayReviewPayload["gaps"][number];

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function TimeSection({
  segments,
  gaps,
}: {
  segments: Segment[];
  gaps: Gap[];
  date: string;
}) {
  const allItems = [
    ...segments.map((s) => ({ type: "segment" as const, startsAt: s.startedAt, data: s })),
    ...gaps.map((g) => ({ type: "gap" as const, startsAt: g.startsAt, data: g })),
  ].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-3">Time</h2>
      {allItems.length === 0 && (
        <p className="text-sm text-muted-foreground">No segments captured for this day.</p>
      )}
      <div className="space-y-2">
        {allItems.map((item, i) => {
          if (item.type === "gap") {
            const gap = item.data as Gap;
            return (
              <div key={`gap-${i}`} className="border border-dashed rounded-lg p-3 bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  {fmt(gap.startsAt)} – {fmt(gap.endsAt)} · {gap.durationMinutes} min untracked
                </p>
              </div>
            );
          }
          const seg = item.data as Segment;
          return (
            <div
              key={seg.id}
              className={`border rounded-lg p-3 ${
                seg.status === "confirmed"
                  ? "bg-muted/20 opacity-60"
                  : seg.isLikelyNoise
                  ? "border-yellow-300"
                  : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">
                  {seg.kind} · {seg.placeLabel ?? seg.zone ?? "Unknown location"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {fmt(seg.startedAt)} – {fmt(seg.endedAt)}
                </span>
              </div>
              {seg.isLikelyNoise && seg.status !== "confirmed" && (
                <p className="text-xs text-yellow-600 mt-1">Likely noise</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Write MileageSection**

```typescript
// apps/web/app/app/day-review/MileageSection.tsx
import type { DayReviewPayload } from "@/lib/day-review/queries";

type Mileage = DayReviewPayload["mileage"];

export function MileageSection({ mileage }: { mileage: Mileage }) {
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-3">Mileage</h2>
      <div className="border rounded-lg p-4">
        {mileage.vehicleName ? (
          <>
            <div className="flex justify-between mb-2">
              <span className="text-sm text-muted-foreground">Vehicle</span>
              <span className="text-sm font-medium">{mileage.vehicleName}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-sm text-muted-foreground">Odometer miles</span>
              <span className="text-sm font-medium">
                {mileage.odometerMiles != null ? `${mileage.odometerMiles} mi` : "—"}
              </span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-sm text-muted-foreground">GPS estimate</span>
              <span className="text-sm font-medium">{mileage.gpsMiles} mi</span>
            </div>
            {mileage.flagged && (
              <p className="text-xs text-yellow-600 mt-2">
                GPS and odometer differ by {mileage.deltaPercent}% — worth a double-check.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No vehicle session recorded for this day.</p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Write CloseButton**

```typescript
// apps/web/app/app/day-review/CloseButton.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CloseButton({
  businessDayId,
  status,
  closedAt,
}: {
  businessDayId: string;
  status: string;
  closedAt: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isClosed = status === "CLOSED";

  async function closeDay() {
    setLoading(true);
    const res = await fetch("/api/v1/day-review/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: businessDayId }),
    });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  async function reopenDay() {
    setLoading(true);
    await fetch("/api/v1/business-day/transition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: businessDayId, to: "REOPENED", reason: "Post-close edit" }),
    });
    setLoading(false);
    router.refresh();
  }

  if (isClosed) {
    return (
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-2">
          Day closed{closedAt ? ` at ${new Date(closedAt).toLocaleTimeString()}` : ""}.
        </p>
        <button
          onClick={reopenDay}
          disabled={loading}
          className="text-sm underline text-muted-foreground"
        >
          {loading ? "Opening…" : "Tap to reopen"}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={closeDay}
      disabled={loading}
      className="w-full bg-primary text-primary-foreground rounded-lg py-3 text-base font-medium"
    >
      {loading ? "Closing…" : "Close Day"}
    </button>
  );
}
```

- [ ] **Step 6: Write E2E smoke test**

```typescript
// tests/e2e/day-review.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Day Review", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "admin@test.com");
    await page.fill('[name="password"]', "password");
    await page.click('[type="submit"]');
    await page.waitForURL(/\/app/);
  });

  test("navigates to day-review page", async ({ page }) => {
    await page.goto("/app/day-review");
    await expect(page.getByText("Day Review")).toBeVisible();
  });

  test("shows empty state when no business day exists for a past date", async ({ page }) => {
    await page.goto("/app/day-review?date=1990-01-01");
    await expect(page.getByText(/No business day found/i)).toBeVisible();
  });
});
```

- [ ] **Step 7: Fast gate**

```bash
pnpm gate:fast
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/app/day-review/ tests/e2e/day-review.spec.ts
git commit -m "feat: add Day Review page with Visits, Time, Mileage sections and Close Day"
```

---

## Task 6: Settings Additions + Nav Badge

**Files:**
- Create: `apps/web/app/app/settings/LocationDaySettings.tsx`
- Modify: `apps/web/app/app/settings/SettingsTabsClient.tsx`
- Modify: `apps/web/app/api/v1/location-settings/route.ts`
- Modify: `apps/web/app/app/layout.tsx` (or the nav component — find the nav component by checking `apps/web/app/app/layout.tsx`)

**Interfaces:**
- Consumes: `PATCH /api/v1/location-settings` (extended schema)
- Consumes: `review_prompted_at` + `closed_at` from business day (for badge)

- [ ] **Step 1: Extend the location-settings PATCH schema**

In `apps/web/app/api/v1/location-settings/route.ts`, add these fields to `patchSchema`:

```typescript
// Add to the existing patchSchema object:
day_review_cutoff_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),      // "HH:MM"
min_stop_dwell_minutes: z.number().int().min(1).max(60).optional(),
visit_confidence_threshold: z.number().int().min(0).max(100).optional(),
suppress_weekend_start_prompt: z.boolean().optional(),
close_day_followup_hours: z.number().int().min(1).max(24).nullable().optional(),
tracking_start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
tracking_end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
```

And extend the UPDATE query to include these columns with `COALESCE` guards (same pattern as the existing `enabled` and `paused_until` updates). Add the 7 columns to the `RETURNING` clause as well.

- [ ] **Step 2: Write LocationDaySettings component**

```typescript
// apps/web/app/app/settings/LocationDaySettings.tsx
"use client";
import { useState } from "react";

type Props = {
  dayReviewCutoffTime: string;       // "HH:MM"
  minStopDwellMinutes: number;
  visitConfidenceThreshold: number;
  suppressWeekendStartPrompt: boolean;
  closeDayFollowupHours: number | null;
  trackingStartTime: string | null;
  trackingEndTime: string | null;
  locationRetentionDays: number;
};

export function LocationDaySettings(props: Props) {
  const [cutoff, setCutoff] = useState(props.dayReviewCutoffTime);
  const [dwell, setDwell] = useState(props.minStopDwellMinutes);
  const [threshold, setThreshold] = useState(props.visitConfidenceThreshold);
  const [suppressWeekend, setSuppressWeekend] = useState(props.suppressWeekendStartPrompt);
  const [followup, setFollowup] = useState(props.closeDayFollowupHours ?? "");
  const [trackStart, setTrackStart] = useState(props.trackingStartTime ?? "");
  const [trackEnd, setTrackEnd] = useState(props.trackingEndTime ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    await fetch("/api/v1/location-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        day_review_cutoff_time: cutoff,
        min_stop_dwell_minutes: dwell,
        visit_confidence_threshold: threshold,
        suppress_weekend_start_prompt: suppressWeekend,
        close_day_followup_hours: followup === "" ? null : Number(followup),
        tracking_start_time: trackStart || null,
        tracking_end_time: trackEnd || null,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-1">End-of-day review cutoff</label>
        <input
          type="time"
          value={cutoff}
          onChange={(e) => setCutoff(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Home zone arrivals before this time won't trigger the day review prompt.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Minimum stop dwell ({dwell} min)
        </label>
        <input
          type="range" min={1} max={30} value={dwell}
          onChange={(e) => setDwell(Number(e.target.value))}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Stops shorter than this won't create visit candidates.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Confirm All threshold ({threshold}%)
        </label>
        <input
          type="range" min={50} max={100} value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Visits above this confidence are pre-selected for bulk confirm.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="suppress-weekend"
          checked={suppressWeekend}
          onChange={(e) => setSuppressWeekend(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="suppress-weekend" className="text-sm">
          Suppress start-day prompt on weekends
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Follow-up reminder (hours after arriving home)
        </label>
        <input
          type="number" min={1} max={24} value={followup}
          onChange={(e) => setFollowup(e.target.value)}
          placeholder="Off"
          className="border rounded px-3 py-1.5 text-sm w-24"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Leave blank to disable the follow-up reminder.
        </p>
      </div>

      <div className="flex gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Tracking start</label>
          <input
            type="time" value={trackStart}
            onChange={(e) => setTrackStart(e.target.value)}
            placeholder="No restriction"
            className="border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tracking end</label>
          <input
            type="time" value={trackEnd}
            onChange={(e) => setTrackEnd(e.target.value)}
            placeholder="No restriction"
            className="border rounded px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm"
      >
        {saving ? "Saving…" : saved ? "Saved!" : "Save Location & Day Settings"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Add "Location & Day" tab to SettingsTabsClient**

Open `apps/web/app/app/settings/SettingsTabsClient.tsx`. Follow the existing pattern for adding a tab. Add `"Location & Day"` as a new tab value and render `<LocationDaySettings>` in its panel, passing the account's current values (which the parent `SettingsPage` server component must now fetch and pass as props).

In `apps/web/app/app/settings/page.tsx`, extend the account query to include the 7 new columns and the existing `location_retention_days`, then pass them to `SettingsTabsClient` which passes to `LocationDaySettings`.

- [ ] **Step 4: Add review-pending badge to nav**

Open `apps/web/app/app/layout.tsx` to find the nav component. In the server component, fetch whether today's business day has `review_prompted_at IS NOT NULL AND closed_at IS NULL`:

```typescript
// In the layout's data fetch (or a shared nav server component):
const reviewPending = await queryOne<{ pending: boolean }>(
  `SELECT EXISTS (
     SELECT 1 FROM business_days bd
     JOIN users u ON u.id = bd.user_id
     WHERE u.account_id = $1
       AND bd.business_date = CURRENT_DATE
       AND bd.review_prompted_at IS NOT NULL
       AND bd.closed_at IS NULL
   ) AS pending`,
  [session.accountId],
);
```

Add a red dot or badge to the "Day Review" nav link when `reviewPending?.pending` is true. Follow the existing badge pattern in the nav (check how other badges are rendered — likely a small `<span>` with a red background absolutely positioned).

If no nav link to `/app/day-review` exists yet, add one alongside the existing nav items.

- [ ] **Step 5: Fast gate**

```bash
pnpm gate:fast
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/app/settings/LocationDaySettings.tsx \
        apps/web/app/app/settings/SettingsTabsClient.tsx \
        apps/web/app/app/settings/page.tsx \
        apps/web/app/api/v1/location-settings/route.ts \
        apps/web/app/app/layout.tsx
git commit -m "feat: add Location & Day settings tab and review-pending nav badge"
```

---

## Task 7: HA Automation Documentation

**Files:**
- Modify: `docs/working/ha-location-capture.yaml`

- [ ] **Step 1: Add two new automations**

Append to `docs/working/ha-location-capture.yaml`:

```yaml
# ── Day-review automations (added 2026-07-01) ──────────────────────────────

# Automation 1: RAM Bluetooth connect → start-day prompt
# Triggers when the phone connects to the RAM's car stereo Bluetooth.
# Posts to FSM to get the appropriate signal, then sends a Companion notification.
- alias: "FSM: RAM BT connect → start-day prompt"
  trigger:
    - platform: state
      entity_id: sensor.YOUR_PHONE_bluetooth_connection  # replace with your sensor
      to: "Uconnect"
  action:
    - service: rest_command.fsm_start_day_prompt
    - choose:
        - conditions:
            - condition: template
              value_template: "{{ states('input_text.fsm_start_day_signal') == 'start' }}"
          sequence:
            - service: notify.mobile_app_YOUR_PHONE  # replace with your device
              data:
                title: "Ready to start your day?"
                message: "Tap to open Start Day"
                data:
                  url: "/app/my-day"
                  actions:
                    - action: "START_DAY"
                      title: "Start Day"
                    - action: "DAY_OFF"
                      title: "Day Off"
                    - action: "PERSONAL"
                      title: "Personal / Errand"

# rest_command to call FSM and store the signal in an input_text helper:
rest_command:
  fsm_start_day_prompt:
    url: "https://YOUR_FSM_URL/api/internal/start-day-prompt"
    method: POST
    headers:
      x-api-key: !secret fsm_location_key
    verify_ssl: true

# Automation 2: Home zone arrival after cutoff → day-review prompt
# Only fires if FSM responds with result=prompted (open day exists, after cutoff).
- alias: "FSM: Home arrival → day-review prompt"
  trigger:
    - platform: zone
      entity_id: device_tracker.YOUR_PHONE  # replace with your device tracker
      zone: zone.home
      event: enter
  action:
    - service: rest_command.fsm_day_review_prompt
    - condition: template
      value_template: "{{ states('input_text.fsm_day_review_result') == 'prompted' }}"
    - service: notify.mobile_app_YOUR_PHONE
      data:
        title: "Time to close out your day"
        message: "Review your day and close it out."
        data:
          url: "/app/day-review"

rest_command:
  fsm_day_review_prompt:
    url: "https://YOUR_FSM_URL/api/internal/day-review-prompt"
    method: POST
    headers:
      x-api-key: !secret fsm_location_key
    verify_ssl: true

# NOTE: Replace YOUR_PHONE, YOUR_FSM_URL with real values.
# Add fsm_location_key to your secrets.yaml (same value as LOCATION_INTERNAL_KEY env var).
# The REST command responses must be stored in input_text helpers to be read by the
# choose/condition blocks. Create two input_text helpers in HA:
#   - input_text.fsm_start_day_signal
#   - input_text.fsm_day_review_result
# and add a response_variable step to capture the REST response into them.
```

- [ ] **Step 2: Commit**

```bash
git add docs/working/ha-location-capture.yaml
git commit -m "docs: add HA automation stubs for start-day-prompt and day-review-prompt"
```

---

## Self-Review Checklist

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| RAM BT → start-day prompt (Start/Day Off/Personal) | Task 3 (endpoint) + Task 7 (HA docs) |
| Suppress weekend start prompt | Task 1 (column) + Task 3 (logic) + Task 6 (settings) |
| Home zone after 5PM → review prompt | Task 3 (endpoint) + Task 7 (HA docs) |
| `review_prompted_at` set on trigger | Task 1 (column) + Task 3 (endpoint) |
| Nav badge when review pending | Task 6 |
| Day Review page with 3 sections | Task 5 |
| Confirm All for high-confidence visits | Task 5 (VisitsSection) |
| Gap cards for uncovered time | Task 2 (detectGaps) + Task 5 (TimeSection) |
| Mileage delta flag >20% | Task 2 (checkMileageDelta) + Task 5 (MileageSection) |
| Close Day button (READY_TO_CLOSE → CLOSED) | Task 4 (close route) + Task 5 (CloseButton) |
| Close Day unblocked even with flags | Task 5 (CloseButton — always enabled) |
| Reopen after close | Task 5 (CloseButton reopenDay) |
| `revised_after_close` audit trail | Task 1 (column added; stamping is follow-up per activity creation path) |
| All 7 settings knobs | Task 1 (137 migration) + Task 6 (settings UI) |
| Settings defaults | Task 1 (migration DEFAULT values) |
| HA docs | Task 7 |

**Known scope item:** `revised_after_close` stamping (setting the flag when creating entries after close) requires modifying the visit-candidate confirm endpoint and any other activity_entries write paths. The column is added in Task 1 with `DEFAULT FALSE`. Stamping logic should be added to `POST /api/v1/visit-candidates/[id]/confirm` in a follow-up — the confirm endpoint should check `SELECT closed_at FROM business_days WHERE id = $business_day_id` and set `revised_after_close = true` if non-null. Scoping this as a follow-up keeps Task 4 focused; the column is in place for it.
