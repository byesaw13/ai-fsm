# Activity Timeline Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-captured activity can replace overlapping manual time with an audit archive, optional job link, and a cleanup path for unlinked job-costing activity.

**Architecture:** Reuse the existing `activity_entries` ledger, `applyRebalance()` helper, and `audit_log` archive behavior. Add explicit override payloads to auto confirmation routes so overlap replacement only happens after the UI has shown a confirmation dialog.

**Tech Stack:** Next.js route handlers, React client components, Vitest, PostgreSQL via `pg`, existing domain activity constants.

---

## File Structure

- Modify: `apps/web/app/api/v1/activities/segments/[id]/route.ts`
  - Accept optional `rebalance` on segment confirmation.
  - Apply accepted rebalance after inserting the confirmed auto activity.
  - Preserve current 409 overlap behavior when no rebalance is supplied.

- Modify: `apps/web/app/api/v1/visit-candidates/[id]/route.ts`
  - Accept optional `rebalance` on detected visit confirmation.
  - Apply accepted rebalance after inserting the confirmed auto visit activity.
  - Preserve current 409 overlap behavior when no rebalance is supplied.

- Modify: `apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts`
  - Add route tests for explicit auto overlap replacement and audit behavior.

- Create: `apps/web/app/api/v1/activities/needs-job-link/route.ts`
  - Return confirmed activities that matter to job costing and have no `entity_type/entity_id`.

- Modify: `apps/web/app/app/timeline/page.tsx`
  - Fetch needs-job-link rows and pass them into the editor or a small panel.

- Modify: `apps/web/app/app/TimelineEditor.tsx`
  - Reuse existing rebalance confirmation for auto confirmation flows.
  - Show archive wording in the dialog.

- Modify: `apps/web/app/app/LocationSegmentsPanel.tsx`
  - Accept current timeline entries from the page.
  - Precompute rebalance for segment confirmation.
  - Send `rebalance` only after the user accepts the dialog.

- Modify: `apps/web/app/app/VisitCandidatesPanel.tsx`
  - Accept current timeline entries from the page.
  - Precompute rebalance for detected visit confirmation.
  - Send `rebalance` only after the user accepts the dialog.

---

### Task 1: Backend Override For Auto Segment Confirmation

**Files:**
- Modify: `apps/web/app/api/v1/activities/segments/[id]/route.ts`
- Test: `apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts`

- [ ] **Step 1: Add failing segment route test**

Append this test setup and test to `apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts`.

```ts
import { PATCH as patchSegment } from "../segments/[id]/route";

const SEGMENT_ID = "33333333-3333-3333-3333-333333333333";
const MANUAL_ID = "44444444-4444-4444-4444-444444444444";

const PROVISIONAL_SEGMENT = {
  id: SEGMENT_ID,
  kind: "stop",
  segment_date: "2026-06-11",
  started_at: "2026-06-11T12:00:00.000Z",
  ended_at: "2026-06-11T13:00:00.000Z",
  place_label: "Smith kitchen",
  status: "provisional",
  activity_entry_id: null,
  vehicle_session_id: null,
};

describe("PATCH /api/v1/activities/segments/[id]", () => {
  it("keeps rejecting overlap without an accepted rebalance", async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM location_segments")) return Promise.resolve({ rows: [PROVISIONAL_SEGMENT] });
      if (sql.includes("FROM activity_entries") && sql.includes("LIMIT 1")) {
        return Promise.resolve({ rows: [{ id: MANUAL_ID }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await patchSegment(req(`/api/v1/activities/segments/${SEGMENT_ID}`, "PATCH", {
      action: "confirm",
      activity_type: "job_work",
    }));

    expect(res.status).toBe(409);
  });

  it("confirms an overlapping segment when rebalance is accepted and audits the replaced manual row", async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM location_segments")) return Promise.resolve({ rows: [PROVISIONAL_SEGMENT] });
      if (sql.includes("FROM activity_entries") && sql.includes("LIMIT 1")) {
        return Promise.resolve({ rows: [{ id: MANUAL_ID }] });
      }
      if (sql.startsWith("INSERT INTO activity_entries")) return Promise.resolve({ rows: [{ id: "new-segment-entry" }] });
      if (sql.startsWith("DELETE FROM activity_entries")) {
        return Promise.resolve({ rows: [{ ...EXISTING, id: MANUAL_ID }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await patchSegment(req(`/api/v1/activities/segments/${SEGMENT_ID}`, "PATCH", {
      action: "confirm",
      activity_type: "job_work",
      rebalance: [{ id: MANUAL_ID, delete: true }],
    }));

    expect(res.status).toBe(200);
    expect(mockAppendAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entity_type: "activity_entry",
      entity_id: MANUAL_ID,
      action: "delete",
    }));
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @ai-fsm/web test:unit apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts
```

Expected: FAIL because `rebalance` is not accepted by the segment confirmation schema and the route still returns `409`.

- [ ] **Step 3: Implement the minimal route change**

In `apps/web/app/api/v1/activities/segments/[id]/route.ts`, import the helper:

```ts
import { applyRebalance } from "@/lib/activities/rebalance";
```

Add this schema near the existing schemas:

```ts
const rebalanceSchema = z.array(z.object({
  id: z.string().uuid(),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
  delete: z.boolean().optional(),
})).optional();
```

Add `rebalance: rebalanceSchema` to `confirmSchema`.

Replace the overlap rejection block with:

```ts
if (overlap.length > 0 && !d.rebalance?.length) {
  await client.query("ROLLBACK");
  return err(
    "CONFLICT",
    "This time range overlaps activity already logged. Adjust it in the timeline or dismiss the segment.",
    409,
    session.traceId,
  );
}
```

After the `INSERT INTO activity_entries` and before updating `location_segments`, add:

```ts
await applyRebalance(
  client,
  { accountId: session.accountId, userId: session.userId, traceId: session.traceId },
  d.rebalance,
);
```

- [ ] **Step 4: Run the test**

Run:

```bash
pnpm --filter @ai-fsm/web test:unit apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/activities/segments/[id]/route.ts apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts
git commit -m "Allow confirmed segments to replace manual activity"
```

---

### Task 2: Backend Override For Detected Visit Confirmation

**Files:**
- Modify: `apps/web/app/api/v1/visit-candidates/[id]/route.ts`
- Test: `apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts`

- [ ] **Step 1: Add failing detected visit test**

Append this import and test to `apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts`.

```ts
import { PATCH as patchVisitCandidate } from "../../visit-candidates/[id]/route";

const CANDIDATE_ID = "55555555-5555-5555-5555-555555555555";
const VISIT_ID = "66666666-6666-6666-6666-666666666666";

const PENDING_CANDIDATE = {
  id: CANDIDATE_ID,
  status: "pending",
  location_segment_id: SEGMENT_ID,
  property_id: "77777777-7777-7777-7777-777777777777",
  matched_client_id: "88888888-8888-8888-8888-888888888888",
  job_id: null,
  visit_id: VISIT_ID,
  arrival_time: "2026-06-11T12:00:00.000Z",
  departure_time: "2026-06-11T13:00:00.000Z",
};

describe("PATCH /api/v1/visit-candidates/[id]", () => {
  it("confirms an overlapping visit candidate when rebalance is accepted", async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM visit_candidates")) return Promise.resolve({ rows: [PENDING_CANDIDATE] });
      if (sql.includes("FROM activity_entries") && sql.includes("LIMIT 1")) {
        return Promise.resolve({ rows: [{ id: MANUAL_ID }] });
      }
      if (sql.startsWith("INSERT INTO activity_entries")) return Promise.resolve({ rows: [{ id: "new-visit-entry" }] });
      if (sql.startsWith("DELETE FROM activity_entries")) return Promise.resolve({ rows: [{ ...EXISTING, id: MANUAL_ID }] });
      return Promise.resolve({ rows: [] });
    });

    const res = await patchVisitCandidate(req(`/api/v1/visit-candidates/${CANDIDATE_ID}`, "PATCH", {
      action: "confirm",
      classification: "job_work",
      rebalance: [{ id: MANUAL_ID, delete: true }],
    }));

    expect(res.status).toBe(200);
    const insertCall = mockClientQuery.mock.calls.find((call) => String(call[0]).startsWith("INSERT INTO activity_entries"));
    expect(insertCall?.[1]).toContain("visit");
    expect(insertCall?.[1]).toContain(VISIT_ID);
    expect(mockAppendAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entity_id: MANUAL_ID,
      action: "delete",
    }));
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @ai-fsm/web test:unit apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts
```

Expected: FAIL because visit candidate confirmation does not accept `rebalance`.

- [ ] **Step 3: Implement route support**

In `apps/web/app/api/v1/visit-candidates/[id]/route.ts`, import:

```ts
import { applyRebalance } from "@/lib/activities/rebalance";
```

Add `rebalanceSchema` as in Task 1 and add `rebalance: rebalanceSchema` to `bodySchema`.

Change the overlap rejection to:

```ts
if (overlap.length > 0 && !d.rebalance?.length) {
  await client.query("ROLLBACK");
  return err(
    "CONFLICT",
    "This time overlaps activity already logged. Resolve it in the timeline first.",
    409,
    session.traceId,
  );
}
```

After inserting the activity entry and before updating `visit_candidates`, add:

```ts
await applyRebalance(
  client,
  { accountId: session.accountId, userId: session.userId, traceId: session.traceId },
  d.rebalance,
);
```

- [ ] **Step 4: Run the test**

Run:

```bash
pnpm --filter @ai-fsm/web test:unit apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/visit-candidates/[id]/route.ts apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts
git commit -m "Allow detected visits to replace manual activity"
```

---

### Task 3: Needs Job Link API

**Files:**
- Create: `apps/web/app/api/v1/activities/needs-job-link/route.ts`
- Test: `apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts`

- [ ] **Step 1: Add failing API test**

Append this import and test:

```ts
import { GET as getNeedsJobLink } from "../needs-job-link/route";

describe("GET /api/v1/activities/needs-job-link", () => {
  it("returns confirmed costing activities with no business link", async () => {
    const rows = [{
      id: "99999999-9999-9999-9999-999999999999",
      activity_type: "travel",
      started_at: "2026-06-11T12:00:00.000Z",
      ended_at: "2026-06-11T13:00:00.000Z",
      note: "Drive to Smith",
    }];
    const db = await import("@/lib/db");
    vi.mocked(db.queryForSession).mockResolvedValue(rows);

    const res = await getNeedsJobLink(req("/api/v1/activities/needs-job-link?date=2026-06-11", "GET"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { activities: rows } });
    expect(vi.mocked(db.queryForSession).mock.calls[0][1]).toContain("entity_id IS NULL");
    expect(vi.mocked(db.queryForSession).mock.calls[0][2]).toEqual([mockSession.accountId, "2026-06-11"]);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @ai-fsm/web test:unit apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts
```

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Create the route**

Create `apps/web/app/api/v1/activities/needs-job-link/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { queryForSession } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function normalizedDay(request: NextRequest): string {
  const d = request.nextUrl.searchParams.get("date");
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return new Date().toLocaleDateString("en-CA");
}

export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const day = normalizedDay(request);
  try {
    const activities = await queryForSession(
      session,
      `SELECT id, activity_type, started_at::text, ended_at::text, note
         FROM activity_entries
        WHERE account_id = $1
          AND session_date = $2::date
          AND voided_at IS NULL
          AND entity_id IS NULL
          AND ended_at IS NOT NULL
          AND activity_type IN ('job_work','travel','material_run','estimate','warranty_callback','walkthrough','material_drop')
        ORDER BY started_at ASC`,
      [session.accountId, day],
    );
    return NextResponse.json({ data: { activities } });
  } catch (error) {
    logger.error("GET /api/v1/activities/needs-job-link error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load activities needing job link", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
```

- [ ] **Step 4: Run the test**

Run:

```bash
pnpm --filter @ai-fsm/web test:unit apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/activities/needs-job-link/route.ts apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts
git commit -m "Add activities needing job link endpoint"
```

---

### Task 4: UI Confirmation For Auto Overlap Replacement

**Files:**
- Modify: `apps/web/app/app/timeline/page.tsx`
- Modify: `apps/web/app/app/LocationSegmentsPanel.tsx`
- Modify: `apps/web/app/app/VisitCandidatesPanel.tsx`
- Modify: `apps/web/app/app/TimelineEditor.tsx`

- [ ] **Step 1: Extract shared timeline entry type export**

In `apps/web/app/app/TimelineEditor.tsx`, export the existing conversion target:

```ts
export type TimelineEditorEntry = ActivityEntryDto;
```

No behavior change.

- [ ] **Step 2: Pass current entries to auto panels**

In `apps/web/app/app/timeline/page.tsx`, pass `entries` into both panels:

```tsx
<VisitCandidatesPanel day={day} entries={entries} />
```

```tsx
<LocationSegmentsPanel day={day} entries={entries} />
```

- [ ] **Step 3: Add overlap dialog to LocationSegmentsPanel**

In `LocationSegmentsPanel.tsx`, add imports:

```ts
import { ConfirmDialog } from "@/components/ui";
import { proposeRebalance, type RebalanceAdjustment, type TimelineEntry } from "@/lib/activities/timeline";
import type { ActivityEntryDto } from "./ActivityTracker";
```

Change the signature:

```ts
export function LocationSegmentsPanel({ day, entries }: { day?: string; entries: ActivityEntryDto[] }) {
```

Add state:

```ts
const [confirmReplace, setConfirmReplace] = useState<{
  id: string;
  body: Record<string, unknown>;
  rebalance: RebalanceAdjustment[];
} | null>(null);
```

Add helper:

```ts
function timelineEntries(): TimelineEntry[] {
  return entries.map((e) => ({
    id: e.id,
    activity_type: e.activity_type,
    started_at: e.started_at,
    ended_at: e.ended_at,
  }));
}
```

Replace the Confirm button `onClick` with:

```tsx
onClick={() => {
  const body = { action: "confirm", activity_type: choice[seg.id] ?? defaultActivity(seg) };
  if (!seg.ended_at) return;
  const rebalance = proposeRebalance(timelineEntries(), {
    started_at: seg.started_at,
    ended_at: seg.ended_at,
  });
  if (rebalance.length > 0) {
    setConfirmReplace({ id: seg.id, body, rebalance });
    return;
  }
  void patch(seg.id, body, "Logged to your day");
}}
```

Render this dialog before the section closes:

```tsx
<ConfirmDialog
  open={confirmReplace !== null}
  title="Replace manual activity?"
  body="This auto-captured activity overlaps manual time. Confirming will archive the original manual activity for reporting and prevent double-counted time."
  confirmLabel="Confirm and archive"
  onConfirm={() => {
    const pendingReplace = confirmReplace;
    setConfirmReplace(null);
    if (pendingReplace) {
      void patch(
        pendingReplace.id,
        { ...pendingReplace.body, rebalance: pendingReplace.rebalance },
        "Logged to your day",
      );
    }
  }}
  onCancel={() => setConfirmReplace(null)}
  loading={pending === confirmReplace?.id}
/>
```

- [ ] **Step 4: Add the same dialog flow to VisitCandidatesPanel**

In `VisitCandidatesPanel.tsx`, import `ConfirmDialog`, `proposeRebalance`, and `ActivityEntryDto`.

Change signature:

```ts
export function VisitCandidatesPanel({ day, entries }: { day?: string; entries: ActivityEntryDto[] }) {
```

Add the same `confirmReplace` state and `timelineEntries()` helper.

Replace each classification button `onClick` with:

```tsx
onClick={() => {
  const body = { action: "confirm", classification: b.value };
  const rebalance = proposeRebalance(timelineEntries(), {
    started_at: c.arrival_time,
    ended_at: c.departure_time,
  });
  if (rebalance.length > 0) {
    setConfirmReplace({ id: c.id, body, rebalance });
    return;
  }
  void patch(c.id, body, "Logged to your day");
}}
```

Render the same `ConfirmDialog`, sending `{ ...pendingReplace.body, rebalance: pendingReplace.rebalance }`.

- [ ] **Step 5: Run focused UI typecheck**

Run:

```bash
pnpm --filter @ai-fsm/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/app/timeline/page.tsx apps/web/app/app/LocationSegmentsPanel.tsx apps/web/app/app/VisitCandidatesPanel.tsx apps/web/app/app/TimelineEditor.tsx
git commit -m "Confirm auto activity overlap replacements"
```

---

### Task 5: Surface Needs Job Link Cleanup

**Files:**
- Modify: `apps/web/app/app/timeline/page.tsx`
- Modify: `apps/web/app/app/TimelineEditor.tsx`

- [ ] **Step 1: Fetch cleanup rows on the timeline page**

In `timeline/page.tsx`, add a query after `entries`:

```ts
const needsJobLink = await queryForSession<{
  id: string;
  activity_type: string;
  started_at: string;
  ended_at: string;
  note: string | null;
}>(
  session,
  `SELECT id, activity_type, started_at::text, ended_at::text, note
     FROM activity_entries
    WHERE account_id = $1
      AND session_date = $2::date
      AND voided_at IS NULL
      AND entity_id IS NULL
      AND ended_at IS NOT NULL
      AND activity_type IN ('job_work','travel','material_run','estimate','warranty_callback','walkthrough','material_drop')
    ORDER BY started_at ASC`,
  [session.accountId, day],
);
```

Pass it to the editor:

```tsx
<TimelineEditor date={day} entries={entries} needsJobLink={needsJobLink} />
```

- [ ] **Step 2: Show a small cleanup panel**

In `TimelineEditor.tsx`, add a type:

```ts
type NeedsJobLinkRow = {
  id: string;
  activity_type: string;
  started_at: string;
  ended_at: string;
  note: string | null;
};
```

Change the signature:

```ts
export function TimelineEditor({
  date,
  entries,
  needsJobLink,
}: {
  date: string;
  entries: ActivityEntryDto[];
  needsJobLink: NeedsJobLinkRow[];
}) {
```

Render after `DayTimeSummary`:

```tsx
{needsJobLink.length > 0 ? (
  <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "var(--space-3)", background: "var(--bg-card)" }}>
    <strong>Needs job link</strong>
    <p style={{ margin: "var(--space-1) 0 var(--space-2)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
      These confirmed activities affect job costing but are not attached to a job yet.
    </p>
    <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
      {needsJobLink.map((row) => (
        <li key={row.id}>
          {fmtClock(row.started_at)}-{fmtClock(row.ended_at)} {ACTIVITY_TYPE_META[row.activity_type as ActivityType]?.label ?? row.activity_type}
          {row.note ? ` - ${row.note}` : ""}
        </li>
      ))}
    </ul>
  </div>
) : null}
```

This is intentionally read-only for the first slice. The existing edit sheet already has `entity_type/entity_id` API support, but no job picker; add the picker in a later slice if this panel proves useful.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --filter @ai-fsm/web typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/app/timeline/page.tsx apps/web/app/app/TimelineEditor.tsx
git commit -m "Surface activities needing job links"
```

---

### Task 6: Final Verification

**Files:**
- Verify whole repo.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
pnpm --filter @ai-fsm/web test:unit apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm --filter @ai-fsm/web typecheck
```

Expected: PASS.

- [ ] **Step 3: Run fast gate**

Run:

```bash
pnpm gate:fast
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff --stat HEAD~5..HEAD
git status --short
```

Expected: only intended source/test/docs changes, with `.superpowers/` still untracked unless separately ignored.

Skipped: full job-link picker in the first slice; add it when the cleanup panel proves the right place to attach jobs.
