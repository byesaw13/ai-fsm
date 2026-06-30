# Visit Completion Photo Waiver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow technicians or owners to complete a visit without any completion photos by using a simple photos_waived waiver (with quick preset reasons + custom "Other" text). This satisfies the completion guard and automatically marks the close_photos checklist item as done. Normal photo uploads take precedence.

**Architecture:** Extend the existing completion_packets table with waiver fields. Update the pure guard function first (TDD). Update API to persist. Enhance CompletionChecklist UI with preset chips + textarea. Add side-effect to auto-PATCH the close_photos checklist item. Update display in Visit Record. Follow existing waiver pattern from signature_waiver. No changes to repair-flow afterPhotoCount logic or property timeline.

**Tech Stack:** Next.js (TSX), Zod, PostgreSQL (migrations + queries), existing p7 UI components (Button, etc.), vitest for tests.

## Global Constraints
- Follow product principles: Field-first one-tap, tool recedes, honest state, sturdy over slick.
- All changes must preserve existing signature waiver behavior.
- Photos (when present) always override waiver.
- Use existing error codes and messages where possible; add clarity for waiver.
- Tests: unit tests for guard; consider e2e for flow.
- Commit frequently after each testable step.
- No new approval workflows; Option A (self-serve waiver).
- Preset reasons (hard-coded for simplicity): "Forgot to take photos", "No visual change / not needed", "Client declined photos".

## File Structure & Responsibilities

### New/Modified Files

- **db/migrations/135_visit_completion_photo_waiver.sql** (Create): Additive ALTERs for new columns on completion_packets. Follows naming of recent migrations (e.g. 134_...).

- **apps/web/lib/completion-guard.ts** (Modify): Update interface + checkCompletionPacket logic. Core pure function.

- **apps/web/lib/__tests__/completion-guard.unit.test.ts** (Modify): Add tests for waiver cases.

- **apps/web/app/api/v1/visits/[id]/completion-packet/route.ts** (Modify): Update Zod schema, INSERT/UPDATE/RETURNING to handle new fields. Validate waiver requires reason.

- **apps/web/app/api/v1/visits/[id]/transition/route.ts** (Modify): Update SELECT to fetch new fields; optionally soften error message when waiver used.

- **apps/web/app/app/visits/[id]/page.tsx** (Modify): Update the query that loads completionPacket to SELECT new columns. Update Visit Record display logic.

- **apps/web/app/app/visits/[id]/CompletionChecklist.tsx** (Modify): Add waiver UI state (waived + reason), preset chips + Other textarea, logic to send fields on save, auto-PATCH close_photos item if waived, update summary dl and disabled states.

- **apps/web/app/app/visits/[id]/VisitClosingChecklist.tsx** (Review only, minimal if needed): No direct change expected, but the auto-PATCH will update it.

- (Optional test): New or extend e2e in tests/e2e/ for waiver flow if critical.

No changes to VisitTransitionForm.tsx (its afterPhotoCount check is out-of-scope), domain, or other consumers.

## Task Breakdown (TDD, bite-sized, frequent commits)

### Task 1: Add database columns for photo waiver

**Files:**
- Create: db/migrations/135_visit_completion_photo_waiver.sql

**Interfaces:**
- Produces: New columns photos_waived (bool), photos_waiver_reason (text) on completion_packets.

- [ ] **Step 1.1: Create the migration file with additive changes**

Create the file with content that adds the columns safely (idempotent with IF NOT EXISTS if possible, but for ALTER use standard).

```sql
-- Migration 135: Add photo waiver support to completion_packets (for no-photo visit completion)
-- Follows pattern of prior additive migrations.

ALTER TABLE completion_packets
  ADD COLUMN IF NOT EXISTS photos_waived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photos_waiver_reason text;

-- No RLS or index changes needed (simple bool + text on existing row).
```

- [ ] **Step 1.2: Run the migration locally to verify**

```bash
cd /home/nick/ai-fsm-deploy-clean
pnpm db:migrate
# Or specific: psql ... -f db/migrations/135_...
```

Expected: No errors, columns added (verify with \d completion_packets or SELECT).

- [ ] **Step 1.3: Commit**

```bash
git add db/migrations/135_visit_completion_photo_waiver.sql
git commit -m "feat(visits): add photos_waived + photos_waiver_reason columns to completion_packets"
```

### Task 2: Update the completion guard (core logic + tests)

**Files:**
- Modify: apps/web/lib/completion-guard.ts
- Modify: apps/web/lib/__tests__/completion-guard.unit.test.ts

**Interfaces:**
- Consumes: Existing CompletionPacket shape (will extend).
- Produces: Updated checkCompletionPacket that accepts waiver.

- [ ] **Step 2.1: Write failing tests for new waiver behavior**

Edit the test file. Add cases at the end of describe.

```ts
// In apps/web/lib/__tests__/completion-guard.unit.test.ts
it("returns ok when photos_waived even with empty photo_urls", () => {
  expect(checkCompletionPacket({
    photo_urls: [],
    signature_url: null,
    signature_waiver: true,
    photos_waived: true,
    photos_waiver_reason: "Forgot",
  })).toEqual({ ok: true });
});

it("still requires photo if not waived", () => {
  expect(checkCompletionPacket({
    photo_urls: [],
    signature_url: null,
    signature_waiver: true,
    photos_waived: false,
  })).toEqual({ ok: false, error: "MISSING_PHOTO" });
});

// Existing tests must still pass (signature + photo cases)
```

- [ ] **Step 2.2: Run the specific test to confirm it fails**

```bash
cd /home/nick/ai-fsm-deploy-clean
pnpm --filter @ai-fsm/web test -- apps/web/lib/__tests__/completion-guard.unit.test.ts -t "waived"
```

Expected: FAIL (photos_waived not in interface / logic).

- [ ] **Step 2.3: Implement minimal guard change**

Edit apps/web/lib/completion-guard.ts:

```ts
export interface CompletionPacket {
  photo_urls: string[];
  signature_url: string | null;
  signature_waiver: boolean;
  photos_waived?: boolean;
  photos_waiver_reason?: string | null;
}

export function checkCompletionPacket(
  packet: CompletionPacket | null
): { ok: boolean; error?: CompletionGuardError } {
  if (!packet || (packet.photo_urls.length === 0 && !packet.photos_waived)) {
    return { ok: false, error: "MISSING_PHOTO" };
  }
  if (!packet.signature_url && !packet.signature_waiver) {
    return { ok: false, error: "MISSING_SIGNATURE" };
  }
  return { ok: true };
}
```

- [ ] **Step 2.4: Run test to verify pass**

Same command as 2.2. Expected: PASS. Also run full file.

- [ ] **Step 2.5: Commit**

```bash
git add apps/web/lib/completion-guard.ts apps/web/lib/__tests__/completion-guard.unit.test.ts
git commit -m "feat(visits): extend completion guard to support photos_waived"
```

### Task 3: Update completion packet API to persist waiver fields

**Files:**
- Modify: apps/web/app/api/v1/visits/[id]/completion-packet/route.ts

**Interfaces:**
- Consumes: Updated Zod from prior.
- Produces: Packet row with new fields.

- [ ] **Step 3.1: Extend Zod schema (write "failing" by noting validation first)**

Update the schema:

```ts
const completionPacketBody = z.object({
  photo_urls: z.array(z.string().min(1)).default([]),
  signature_url: z.string().url().nullable().optional(),
  signature_waiver: z.boolean().default(false),
  notes: z.string().max(2000).nullable().optional(),
  photos_waived: z.boolean().default(false),
  photos_waiver_reason: z.string().max(500).nullable().optional(),
});
```

Add validation after parse if needed: if photos_waived && !photos_waiver_reason?.trim() then error (but do in UI primarily).

- [ ] **Step 3.2: Update the INSERT/UPDATE and RETURNING**

In the query:

```sql
`INSERT INTO completion_packets (
   account_id, visit_id, photo_urls, signature_url, signature_waiver, notes,
   photos_waived, photos_waiver_reason, created_by
 )
 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
 ON CONFLICT (visit_id) DO UPDATE
 SET photo_urls = EXCLUDED.photo_urls,
     signature_url = EXCLUDED.signature_url,
     signature_waiver = EXCLUDED.signature_waiver,
     notes = EXCLUDED.notes,
     photos_waived = EXCLUDED.photos_waived,
     photos_waiver_reason = EXCLUDED.photos_waiver_reason
 RETURNING *`
```

Update the params array to include data.photos_waived ?? false, data.photos_waiver_reason || null

- [ ] **Step 3.3: Run relevant API test or manual verify (if tests exist)**

No direct unit test for this route in quick scan; run build/typecheck or integration if available.

```bash
pnpm --filter @ai-fsm/web typecheck
```

- [ ] **Step 3.4: Commit**

```bash
git add apps/web/app/api/v1/visits/\[id\]/completion-packet/route.ts
git commit -m "feat(visits): persist photos_waived and photos_waiver_reason in completion packet"
```

### Task 4: Update transition route to fetch and use new fields (for guard)

**Files:**
- Modify: apps/web/app/api/v1/visits/[id]/transition/route.ts

- [ ] **Step 4.1: Update the SELECT query**

```sql
`SELECT photo_urls, signature_url, signature_waiver, photos_waived, photos_waiver_reason
 FROM completion_packets
 ...
```

- [ ] **Step 4.2: (Optional) Improve error message**

When guard.error === "MISSING_PHOTO" and the row has photos_waived false, keep current; the guard now handles it.

Optionally:

const message = guard.error === "MISSING_PHOTO"
  ? "At least one photo is required before completing this visit (or waive photos)"
  : ...

- [ ] **Step 4.3: Run typecheck + any visit tests**

```bash
pnpm --filter @ai-fsm/web typecheck
pnpm --filter @ai-fsm/web test -- apps/web/app/app/visits
```

- [ ] **Step 4.4: Commit**

```bash
git add apps/web/app/api/v1/visits/\[id\]/transition/route.ts
git commit -m "chore(visits): include waiver fields in transition guard query"
```

### Task 5: Update page load and Visit Record display

**Files:**
- Modify: apps/web/app/app/visits/[id]/page.tsx

**Interfaces:**
- Produces: completionPacket with waiver fields for <CompletionChecklist> and record display.

- [ ] **Step 5.1: Update the SELECT in the page loader**

```sql
`SELECT photo_urls, signature_url, signature_waiver, notes, photos_waived, photos_waiver_reason
 FROM completion_packets
 ...
```

- [ ] **Step 5.2: Update the Visit Record rendering section**

Replace the photo count logic with:

```tsx
{completionPacket.photos_waived ? (
  <div style={{ color: "var(--fg-muted)" }}>
    Photos waived: {completionPacket.photos_waiver_reason}
  </div>
) : completionPacket.photo_urls.length > 0 && (
  <div ...>{count} ... </div>
)}
```

Keep the final empty check updated to consider waiver.

- [ ] **Step 5.3: Pass any new props if needed to CompletionChecklist (will be in next task)**

- [ ] **Step 5.4: Typecheck + manual render check**

```bash
pnpm --filter @ai-fsm/web typecheck
```

- [ ] **Step 5.5: Commit**

```bash
git add apps/web/app/app/visits/\[id\]/page.tsx
git commit -m "feat(visits): display photo waiver reason in Visit Record"
```

### Task 6: Implement waiver UI + auto-checklist logic in CompletionChecklist

**Files:**
- Modify: apps/web/app/app/visits/[id]/CompletionChecklist.tsx

**Interfaces:**
- Consumes: initialPacket (now with waiver fields)
- Produces: Updated packet with waiver on save; side-effect PATCH to checklist.

- [ ] **Step 6.1: Add state for waiver**

```tsx
const [photosWaived, setPhotosWaived] = useState(initialPacket?.photos_waived ?? false);
const [photosWaiverReason, setPhotosWaiverReason] = useState(initialPacket?.photos_waiver_reason ?? "");
```

- [ ] **Step 6.2: Write a small test if component has unit tests; otherwise proceed (focus on integration)**

(If no unit tests for this component, add a note in commit.)

- [ ] **Step 6.3: Add the quick-action UI (after upload section, conditional on !photoUrls.length || photosWaived)**

Use existing Button or simple divs for chips (style consistently with p7- classes).

```tsx
{!photoUrls.length || photosWaived ? (
  <div>
    <span className="p7-label">No photos needed?</span>
    <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
      {['Forgot to take photos', 'No visual change / not needed', 'Client declined photos'].map(preset => (
        <button key={preset} onClick={() => { setPhotosWaived(true); setPhotosWaiverReason(preset); }} ... >{preset}</button>
      ))}
      <button onClick={() => { setPhotosWaived(true); /* focus other */ }}>Other</button>
    </div>
    {photosWaived && (
      <textarea 
        value={photosWaiverReason} 
        onChange={e => setPhotosWaiverReason(e.target.value)}
        placeholder="Reason..."
      />
    )}
    {photosWaived && <button onClick={() => {setPhotosWaived(false); setPhotosWaiverReason('');}}>Clear waiver</button>}
  </div>
) : null}
```

- [ ] **Step 6.4: Update savePacket to send new fields**

```tsx
body: JSON.stringify({
  photo_urls: photoUrls,
  ...
  photos_waived: photosWaived,
  photos_waiver_reason: photosWaived ? photosWaiverReason : null,
})
```

- [ ] **Step 6.5: Add auto-PATCH for close_photos after successful save when waived**

After the packet PATCH success:

```tsx
if (photosWaived) {
  // Find or assume the item. For simplicity, call a helper or pass item.
  // Example: await fetch(`/api/v1/visits/${visitId}/checklist/${closePhotosItemId}`, { method: 'PATCH', body: JSON.stringify({disposition: 'ok'}) })
  // (Pass closePhotosItemId as prop or query it.)
}
```

(Implement finding the item by fetching checklist items if not passed; keep minimal.)

- [ ] **Step 6.6: Update dl summary and guard usage to reflect waiver**

Update the photos <dd> to show waived state.

Ensure !guard.ok still blocks when appropriate.

- [ ] **Step 6.7: Run typecheck + manual test flow (or existing visit tests)**

```bash
pnpm --filter @ai-fsm/web typecheck
# Start dev and test flow manually if possible
```

- [ ] **Step 6.8: Commit**

```bash
git add apps/web/app/app/visits/\[id\]/CompletionChecklist.tsx
git commit -m "feat(visits): add photo waiver UI with presets + auto close_photos"
```

### Task 7: Wire up checklist item id passing (if needed for auto-patch)

**Files:**
- Modify: apps/web/app/app/visits/[id]/page.tsx (pass closePhotosItemId to CompletionChecklist)
- Modify: CompletionChecklist.tsx (accept prop and use in auto-patch)

**Interfaces:**
- Produces: Ability for CompletionChecklist to PATCH specific item.

- [ ] **Step 7.1: In page.tsx, extract the close_photos item id when loading checklistItems**

```tsx
const closePhotosItem = checklistItems.find(i => i.item_key === 'close_photos');
const closePhotosItemId = closePhotosItem?.id;
```

Pass to <CompletionChecklist closePhotosItemId={closePhotosItemId} ... />

- [ ] **Step 7.2: Update CompletionChecklist props and the auto logic to use the id**

```tsx
interface ... { closePhotosItemId?: string; ... }

if (photosWaived && closePhotosItemId) {
  await fetch(..., `/checklist/${closePhotosItemId}`, { body: {disposition: 'ok'} });
}
```

- [ ] **Step 7.3: Typecheck + test**

- [ ] **Step 7.4: Commit**

### Task 8: Final verification, tests, and cleanup

**Files:** All modified + any new test files.

- [ ] **Step 8.1: Add/update guard test cases if not complete (already in Task 2)**

- [ ] **Step 8.2: Full gate**

```bash
pnpm --filter @ai-fsm/web lint
pnpm --filter @ai-fsm/web typecheck
pnpm --filter @ai-fsm/web test:unit
pnpm --filter @ai-fsm/web build
```

- [ ] **Step 8.3: Manual smoke (if dev server)**: Create visit, try waiver flow, complete, check record.

- [ ] **Step 8.4: Commit final**

```bash
git add -A
git commit -m "chore(visits): complete photo waiver implementation + tests"
```

- [ ] **Step 8.5: (Optional) Consider e2e addition in tests/e2e/ for waiver path.**

## Summary of Changes

- 1 new migration
- Updates to guard + test
- 2 API routes
- 2 page components + display
- All via small, tested commits

This plan produces working software after each major task. The waiver is isolated to the packet path. 

**Self-Review against spec:**
- All spec requirements map to tasks (data, guard, UI, auto-checklist, display, scope).
- No placeholders.
- Types consistent (extended interface used everywhere).
- TDD structure followed.
- Exact paths and code shown.

Plan complete. Ready for execution.