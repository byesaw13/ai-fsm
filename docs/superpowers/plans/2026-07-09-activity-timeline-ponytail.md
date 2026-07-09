# Activity Timeline Ponytail Cuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut ~650 lines of over-engineering from the owner **activity timeline** surface (`activity_entries` ledger, `/app/timeline`, NowBar / DayTimeSummary) without changing ledger rebalance/split behavior.

**Architecture:** Delete dead routes and production debug UI first; then collapse duplicate types and duration/confidence helpers; leave real integrity math (`proposeRebalance`, `applyRebalance`, `splitSegments`, `summarizeDay`) alone. Optional later: merge `log`/`insert` and bottom-sheet chrome.

**Tech Stack:** Next.js App Router (`apps/web`), TypeScript, vitest, `activity_entries` / `location_segments` Postgres tables.

**Source audit:** session ponytail-audit of timeline activity (ranked cuts).

**Out of scope**
- Client CRM `ClientActivityTimeline` (not `activity_entries`)
- Property / work-order timeline UIs
- Changing rebalance rules, payroll, or location capture pipelines
- New product features (e.g. “link job from needs-job-link banner”)

---

## Decisions locked by this plan

| Audit item | Decision |
|------------|----------|
| `LocationDebugPanel` | **Delete** from production timeline (panel + API). Re-add under `?debug=1` only if ops asks later. |
| `needs-job-link` API | **Delete** route + tests. Page keeps server-side SQL + banner. |
| “Needs job link” banner | **Keep** (useful awareness; zero extra API). |
| `validateChronology` | **Delete** (tests-only today). |
| `RebalanceAdjustment` / `RebalanceInput` | **Merge** → single `RebalanceAdjustment` type. |
| Duration formatters | **One** `formatMinutes` (+ thin `formatElapsed` if needed). |
| Confidence scoring | **One** pure helper used by segments UI. |
| `log` vs `insert` routes | **Defer** (Task 7 optional) — real callers differ. |
| Bottom-sheet style dup | **Defer** (Task 8 optional). |
| `DayEntry` / DTO sprawl | Light only: drop unused aliases + `toTimelineEntry` if trivial. |

---

## File map

| Path | Action | Responsibility |
|------|--------|----------------|
| `apps/web/app/app/timeline/page.tsx` | Modify | Remove debug panel mount |
| `apps/web/app/app/LocationDebugPanel.tsx` | Delete | Dead prod debug UI |
| `apps/web/app/api/v1/activities/location-debug/route.ts` | Delete | Debug API |
| `apps/web/app/api/v1/activities/needs-job-link/route.ts` | Delete | Unused API |
| `apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts` | Modify | Drop needs-job-link suite |
| `apps/web/lib/activities/timeline.ts` | Modify | Drop `validateChronology`; export shared rebalance type |
| `apps/web/lib/activities/rebalance.ts` | Modify | Import type from timeline; drop duplicate interface |
| `apps/web/lib/activities/summary.ts` | Modify | Keep `formatMinutes` as the duration formatter |
| `apps/web/lib/activities/duration.ts` | Create (optional) | Only if you prefer not to overload summary — **prefer using summary.ts** |
| `apps/web/lib/location/segment-confidence.ts` | Create | Shared confidence pure fn |
| `apps/web/app/app/LocationSegmentsPanel.tsx` | Modify | Use shared formatters/confidence |
| `apps/web/app/app/ActivityTracker.tsx` | Modify | Use shared elapsed/format |
| `apps/web/app/app/TimelineEditor.tsx` | Modify | Drop alias; optional type cleanup |
| `apps/web/lib/activities/__tests__/*` | Modify | Match deletions/merges |

---

### Task 1: Remove production location debug surface

**Files:**
- Modify: `apps/web/app/app/timeline/page.tsx`
- Delete: `apps/web/app/app/LocationDebugPanel.tsx`
- Delete: `apps/web/app/api/v1/activities/location-debug/route.ts`

- [ ] **Step 1: Confirm nothing else imports LocationDebugPanel or location-debug**

```bash
cd /home/nick/ai-fsm-deploy-clean
grep -R --include='*.ts' --include='*.tsx' -n 'LocationDebugPanel\|location-debug' apps/web \
  --exclude-dir=node_modules --exclude-dir=.next || true
```

Expected: only `timeline/page.tsx` + the two files to delete (and possibly `.next` types — ignore).

- [ ] **Step 2: Strip debug from the timeline page**

In `apps/web/app/app/timeline/page.tsx`:

1. Remove:

```ts
import { LocationDebugPanel } from "../LocationDebugPanel";
```

2. Remove the trailing block:

```tsx
      <div style={{ marginTop: "var(--space-6)" }}>
        <LocationDebugPanel day={day} />
      </div>
```

Leave `TimelineEditor`, `VisitCandidatesPanel`, `DayMapPanel`, `LocationSegmentsPanel` as-is.

- [ ] **Step 3: Delete the files**

```bash
rm apps/web/app/app/LocationDebugPanel.tsx \
   apps/web/app/api/v1/activities/location-debug/route.ts
```

- [ ] **Step 4: Grep again — zero hits outside docs**

```bash
grep -R --include='*.ts' --include='*.tsx' -n 'LocationDebugPanel\|activities/location-debug' apps/web \
  --exclude-dir=node_modules --exclude-dir=.next || true
```

Expected: empty.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/app/timeline/page.tsx
git add -u apps/web/app/app/LocationDebugPanel.tsx \
  apps/web/app/api/v1/activities/location-debug/route.ts
git commit -m "$(cat <<'EOF'
chore(timeline): remove location debug panel from production UI

Owner timeline already has LocationSegmentsPanel for operational stops/drives.
EOF
)"
```

---

### Task 2: Delete unused needs-job-link API

**Files:**
- Delete: `apps/web/app/api/v1/activities/needs-job-link/route.ts`
- Modify: `apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts`
- Keep: server SQL + banner on `timeline/page.tsx` / `TimelineEditor.tsx`

- [ ] **Step 1: Confirm no client fetch**

```bash
grep -R --include='*.ts' --include='*.tsx' -n 'needs-job-link' apps/web \
  --exclude-dir=node_modules --exclude-dir=.next || true
```

Expected: route, tests, and possibly comments only — **no** `fetch(...needs-job-link...)` in UI.

- [ ] **Step 2: Delete the route**

```bash
rm -rf apps/web/app/api/v1/activities/needs-job-link
```

- [ ] **Step 3: Remove the test suite block**

In `apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts`:

1. Remove the import of `GET as getNeedsJobLink` from `../needs-job-link/route`.
2. Remove the entire `describe("GET /api/v1/activities/needs-job-link", ...)` block (and any fixtures only used by it).

Keep other describe blocks in that file.

- [ ] **Step 4: Run the remaining timeline route tests**

```bash
cd /home/nick/ai-fsm-deploy-clean/apps/web
pnpm exec vitest run app/api/v1/activities/__tests__/timeline-routes.unit.test.ts
```

Expected: PASS (needs-job-link suite gone; others green).

- [ ] **Step 5: Commit**

```bash
git add -u apps/web/app/api/v1/activities/needs-job-link \
  apps/web/app/api/v1/activities/__tests__/timeline-routes.unit.test.ts
git commit -m "$(cat <<'EOF'
chore(timeline): drop unused needs-job-link API

Timeline page already loads the same rows server-side for the banner.
EOF
)"
```

---

### Task 3: Delete unused `validateChronology`

**Files:**
- Modify: `apps/web/lib/activities/timeline.ts`
- Modify: `apps/web/lib/activities/__tests__/timeline.unit.test.ts`

- [ ] **Step 1: Confirm production callers**

```bash
grep -R --include='*.ts' --include='*.tsx' -n 'validateChronology' apps/web \
  --exclude-dir=node_modules --exclude-dir=.next
```

Expected: only `timeline.ts` + its unit test.

- [ ] **Step 2: Remove from `timeline.ts`**

Delete:
- `export interface ChronologyIssue { ... }`
- `export function validateChronology(...): ChronologyIssue[] { ... }` entire function

Keep `splitSegments`, `proposeRebalance`, `TimelineEntry`, `RebalanceAdjustment`.

- [ ] **Step 3: Remove tests**

In `apps/web/lib/activities/__tests__/timeline.unit.test.ts`:

1. Drop `validateChronology` from the import.
2. Delete the entire `describe("validateChronology", ...)` block.

- [ ] **Step 4: Run unit tests**

```bash
cd /home/nick/ai-fsm-deploy-clean/apps/web
pnpm exec vitest run lib/activities/__tests__/timeline.unit.test.ts
```

Expected: PASS (`splitSegments` + `proposeRebalance` only).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/activities/timeline.ts \
  apps/web/lib/activities/__tests__/timeline.unit.test.ts
git commit -m "$(cat <<'EOF'
chore(activities): remove unused validateChronology

Never called from routes or UI; rebalance paths already guard overlaps.
EOF
)"
```

---

### Task 4: Unify rebalance types

**Files:**
- Modify: `apps/web/lib/activities/timeline.ts`
- Modify: `apps/web/lib/activities/rebalance.ts`
- Touch call sites only if imports break (usually none)

- [ ] **Step 1: Make `RebalanceAdjustment` the single type**

In `apps/web/lib/activities/timeline.ts`, ensure (already present):

```ts
export interface RebalanceAdjustment {
  id: string;
  started_at?: string;
  ended_at?: string;
  delete?: boolean;
}
```

- [ ] **Step 2: Point rebalance.ts at it**

In `apps/web/lib/activities/rebalance.ts`:

1. Add:

```ts
import type { RebalanceAdjustment } from "./timeline";
```

2. Delete `export interface RebalanceInput { ... }`.

3. Replace every `RebalanceInput` with `RebalanceAdjustment`:

```ts
export function rebalanceCoversOverlaps(
  overlaps: OverlapRow[],
  adjustments: RebalanceAdjustment[] | undefined,
  change: { started_at: string; ended_at: string },
): boolean {
  // body unchanged
}

export async function applyRebalance(
  client: PoolClient,
  ctx: RebalanceContext,
  adjustments: RebalanceAdjustment[] | undefined,
): Promise<void> {
  // body unchanged
}
```

- [ ] **Step 3: Grep for RebalanceInput**

```bash
grep -R --include='*.ts' --include='*.tsx' -n 'RebalanceInput' apps/web \
  --exclude-dir=node_modules --exclude-dir=.next || true
```

Expected: empty.

- [ ] **Step 4: Run activity unit tests**

```bash
cd /home/nick/ai-fsm-deploy-clean/apps/web
pnpm exec vitest run lib/activities/__tests__/timeline.unit.test.ts \
  app/api/v1/activities/__tests__/
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/activities/timeline.ts apps/web/lib/activities/rebalance.ts
git commit -m "$(cat <<'EOF'
refactor(activities): single RebalanceAdjustment type

Drop duplicate RebalanceInput in rebalance.ts.
EOF
)"
```

---

### Task 5: One duration formatter + segment confidence helper

**Files:**
- Modify: `apps/web/lib/activities/summary.ts` (keep `formatMinutes`)
- Create: `apps/web/lib/location/segment-confidence.ts`
- Modify: `apps/web/app/app/LocationSegmentsPanel.tsx`
- Modify: `apps/web/app/app/ActivityTracker.tsx`
- Optional: `apps/web/app/app/ClockBar.tsx` only if same pattern and low risk

- [ ] **Step 1: Add elapsed helper next to `formatMinutes`**

In `apps/web/lib/activities/summary.ts`, after `formatMinutes`:

```ts
/** Elapsed wall time from start ISO to now (or given end). */
export function formatElapsed(
  startedAt: string,
  endMs: number = Date.now(),
): string {
  const mins = Math.max(0, Math.floor((endMs - new Date(startedAt).getTime()) / 60000));
  return formatMinutes(mins);
}
```

Note: `formatMinutes` already produces `45m` / `1h` / `2h 15m`. Call sites that used `0:05` clock style for NowBar can switch to `formatElapsed` (acceptable UX; if product insists on `h:mm`, keep a one-liner only in NowBar — do **not** invent a third shared style).

- [ ] **Step 2: Shared segment confidence**

Create `apps/web/lib/location/segment-confidence.ts`:

```ts
export type SegmentConfidenceLevel = "high" | "medium" | "low";

export type SegmentConfidenceInput = {
  kind: "stop" | "drive";
  zone?: string | null;
  place_label?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  ended_at?: string | null;
  vehicle_id?: string | null;
  estimated_miles?: number | null;
};

/** Operational confidence for location_segments list UI (not debug reasons). */
export function segmentConfidenceLevel(seg: SegmentConfidenceInput): SegmentConfidenceLevel {
  if (seg.kind === "drive") {
    return seg.vehicle_id || seg.estimated_miles != null ? "high" : "medium";
  }
  const score =
    (seg.zone ? 2 : 0) +
    (seg.place_label ? 1 : 0) +
    (seg.latitude != null && seg.longitude != null ? 1 : 0) +
    (seg.ended_at ? 1 : 0);
  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}
```

- [ ] **Step 3: Wire LocationSegmentsPanel**

1. Remove local `durationLabel` and `confidenceLabel`.
2. Import:

```ts
import { formatElapsed } from "@/lib/activities/summary";
import { segmentConfidenceLevel } from "@/lib/location/segment-confidence";
```

3. Replace `durationLabel(a, b)` with `formatElapsed(a, b ? new Date(b).getTime() : Date.now())`.
4. Replace `confidenceLabel(seg)` with `segmentConfidenceLevel(seg)`.

- [ ] **Step 4: Wire ActivityTracker NowBar**

Replace local `elapsedLabel` with:

```ts
import { formatElapsed } from "@/lib/activities/summary";
// ...
{formatElapsed(displayStartedAt, nowMs)}
```

- [ ] **Step 5: Drop dead alias in TimelineEditor**

Delete:

```ts
export type TimelineEditorEntry = ActivityEntryDto;
```

- [ ] **Step 6: Small unit test for confidence**

Create `apps/web/lib/location/__tests__/segment-confidence.unit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { segmentConfidenceLevel } from "../segment-confidence";

describe("segmentConfidenceLevel", () => {
  it("rates drive with vehicle high", () => {
    expect(segmentConfidenceLevel({ kind: "drive", vehicle_id: "v1" })).toBe("high");
  });
  it("rates bare stop low", () => {
    expect(segmentConfidenceLevel({ kind: "stop" })).toBe("low");
  });
  it("rates rich stop high", () => {
    expect(
      segmentConfidenceLevel({
        kind: "stop",
        zone: "home",
        place_label: "Shop",
        latitude: 1,
        longitude: 2,
        ended_at: "2026-07-01T12:00:00Z",
      }),
    ).toBe("high");
  });
});
```

- [ ] **Step 7: Run tests**

```bash
cd /home/nick/ai-fsm-deploy-clean/apps/web
pnpm exec vitest run lib/activities/__tests__/summary.unit.test.ts \
  lib/location/__tests__/segment-confidence.unit.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/activities/summary.ts \
  apps/web/lib/location/segment-confidence.ts \
  apps/web/lib/location/__tests__/segment-confidence.unit.test.ts \
  apps/web/app/app/LocationSegmentsPanel.tsx \
  apps/web/app/app/ActivityTracker.tsx \
  apps/web/app/app/TimelineEditor.tsx
git commit -m "$(cat <<'EOF'
refactor(timeline): share duration and segment confidence helpers

Drop local durationLabel/confidenceLabel copies; remove unused TimelineEditorEntry alias.
EOF
)"
```

---

### Task 6: Light DTO cleanup (optional-but-in-plan)

**Files:**
- Modify: `apps/web/app/app/TimelineEditor.tsx`
- Modify: `apps/web/app/app/LocationSegmentsPanel.tsx` / `VisitCandidatesPanel.tsx` only if needed

- [ ] **Step 1: Inline `toTimelineEntry` if it stays one line**

If still present:

```ts
function toTimelineEntry(e: ActivityEntryDto): TimelineEntry {
  return { id: e.id, activity_type: e.activity_type, started_at: e.started_at, ended_at: e.ended_at };
}
```

Replace:

```ts
const timelineEntries = useMemo(
  () => sorted.map((e) => ({
    id: e.id,
    activity_type: e.activity_type,
    started_at: e.started_at,
    ended_at: e.ended_at,
  })),
  [sorted],
);
```

Or map with a shared helper in `timeline.ts`:

```ts
export function asTimelineEntry(e: {
  id: string;
  activity_type: string;
  started_at: string;
  ended_at: string | null;
}): TimelineEntry {
  return { id: e.id, activity_type: e.activity_type, started_at: e.started_at, ended_at: e.ended_at };
}
```

Use the same helper in `LocationSegmentsPanel` / `VisitCandidatesPanel` if they rebuild the same object.

- [ ] **Step 2: Commit if anything changed**

```bash
git add apps/web/app/app/TimelineEditor.tsx apps/web/lib/activities/timeline.ts \
  apps/web/app/app/LocationSegmentsPanel.tsx apps/web/app/app/VisitCandidatesPanel.tsx
git commit -m "refactor(timeline): collapse timeline entry mapping"
```

If no meaningful lines saved, skip commit.

---

### Task 7 (optional / defer): Merge `log` + `insert`

**Only if Tasks 1–5 are done and product agrees one write path is fine.**

**Files:**
- Modify: `apps/web/app/api/v1/activities/insert/route.ts` (accept optional rebalance already)
- Retarget: backfill/material callers from `/log` → `/insert` with no rebalance
- Delete: `apps/web/app/api/v1/activities/log/route.ts` + its unit tests
- Update: `DayTimeSummary` backfill `fetch` URL

**Acceptance:** material-run + end-day backfill still work; TimelineEditor insert still rebalances.

**Skip by default** in first PR — higher blast radius.

---

### Task 8 (optional / defer): Shared bottom sheet styles

Extract `sheetBackdrop` / `sheetPanel` to a CSS class in `layout.css` or a tiny `BottomSheet` component used by NowBar + TimelineEditor.

**Skip by default** — pure CSS chrome, low line savings vs risk of visual regression.

---

### Task 9: Final verification

- [ ] **Step 1: Greps**

```bash
cd /home/nick/ai-fsm-deploy-clean
grep -R --include='*.ts' --include='*.tsx' -n 'LocationDebugPanel\|location-debug\|needs-job-link\|validateChronology\|RebalanceInput\|TimelineEditorEntry' apps/web \
  --exclude-dir=node_modules --exclude-dir=.next || true
```

Expected: empty (or only this plan file if grepped from docs).

- [ ] **Step 2: Unit tests**

```bash
cd /home/nick/ai-fsm-deploy-clean/apps/web
pnpm exec vitest run lib/activities/__tests__/ \
  lib/location/__tests__/ \
  app/api/v1/activities/__tests__/
```

Expected: all PASS.

- [ ] **Step 3: Manual smoke (when app up)**

1. `/app/timeline` — day nav, edit/split/insert activity, rebalance dialog still works.
2. Location segments panel still shows confidence + duration.
3. My Day / Workday NowBar still switches activities and shows elapsed.
4. No debug panel on timeline.
5. “Needs job link” banner still appears when unlinked job-like entries exist.

- [ ] **Step 4: Do not touch ClientActivityTimeline**

Confirm CRM client page still loads (no shared renames required).

---

## Implementation order

1. Task 1 — debug delete (safest, biggest visual cut)  
2. Task 2 — needs-job-link API  
3. Task 3 — validateChronology  
4. Task 4 — rebalance type merge  
5. Task 5 — formatters + confidence  
6. Task 6 — light DTO map cleanup  
7. Task 9 — verify  
8. Tasks 7–8 only if a follow-up PR is wanted  

## Success criteria

- [ ] No `LocationDebugPanel` / `location-debug` in app source  
- [ ] No `needs-job-link` route  
- [ ] No `validateChronology` / `RebalanceInput` / `TimelineEditorEntry`  
- [ ] One duration path (`formatMinutes` / `formatElapsed`) for timeline UI  
- [ ] One segment confidence helper  
- [ ] Rebalance + split behavior unchanged  
- [ ] Activity unit + route unit tests green  

## Estimated savings

| Task | ~Lines |
|------|--------|
| 1 Debug panel + route | −320 |
| 2 needs-job-link + tests | −80 |
| 3 validateChronology + tests | −50 |
| 4 Type merge | −15 |
| 5 Formatters + confidence | −80 |
| 6 DTO map | −10 |
| **Total (default tasks)** | **~−555** |
| 7 log∪insert (optional) | −80 |
| 8 sheet CSS (optional) | −30 |

**net target: ~-550 lines, 0 new deps** (optional tasks → ~-650)

---

## Spec / audit coverage

| Audit finding | Task |
|---------------|------|
| Delete LocationDebugPanel + API | 1 |
| Delete needs-job-link API | 2 |
| Keep needs-job-link banner | 2 (explicit keep) |
| Delete validateChronology | 3 |
| Merge rebalance DTOs | 4 |
| Share duration formatters | 5 |
| Share confidence scoring | 5 |
| Drop TimelineEditorEntry | 5 |
| Collapse TimelineEntry mapping | 6 |
| log vs insert | 7 optional |
| Bottom sheet styles | 8 optional |
| ClientActivityTimeline | Out of scope |
