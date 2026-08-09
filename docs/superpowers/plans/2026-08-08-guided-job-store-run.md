# Guided Job Store Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a supplier-specific, mobile-first Store Run to each job buy list so a field user can walk departments in aisle order, purchase with one tap, and continue into the existing receipt flow.

**Architecture:** Keep `job_material_lines` as the operational source of truth and add only supplier/location snapshot fields plus one account preference row per supplier. Pure helpers derive the temporary route and session summary in the browser; existing line PATCH requests persist status and location changes. Reuse `/app/expenses/new?mode=run&job=<id>` for receipt upload and do not create a store-run table, history, state machine, or second receipt flow.

**Tech Stack:** Next.js App Router, React, TypeScript, PostgreSQL/RLS, Zod, Vitest, Playwright, pnpm.

## Global Constraints

- A Store Run starts within two taps from a job buy list.
- Only the selected supplier's needed items and unassigned needed items appear.
- Known aisles are visited in ascending numeric order; department-only and unknown-location items follow.
- Item purchase updates are independent and must not block the whole route.
- Department transitions are explicit, never automatic.
- AI may assign a department but must never invent an aisle or bay.
- Owner/admin may edit locations and supplier preferences; an assigned technician may only update item status.
- Unknown item costs make the estimated total unavailable; never treat an unknown price as zero.
- Session supplier, current stop, purchased IDs, and starting total remain browser-only and reset on reload.
- Do not add dependencies, persistent store-run records, cross-job runs, receipt reconciliation, live supplier APIs, or multi-branch supplier storage.

---

## File Map

| File | Responsibility |
|---|---|
| `db/migrations/171_job_store_run.sql` | Add job snapshot fields, catalog location memory, and account supplier preference with RLS. |
| `apps/web/lib/jobs/buy-list.ts` | Own Store Run types and pure supplier filtering, aisle parsing, route ordering, and summary math. |
| `apps/web/lib/jobs/__tests__/buy-list.unit.test.ts` | Protect route ordering, status filtering, unknown locations, and incomplete totals. |
| `apps/web/lib/jobs/buy-list-seed.ts` | Copy supplier/aisle/bay from catalog materials into new job lines. |
| `apps/web/app/api/v1/jobs/[id]/materials/[lineId]/route.ts` | Extend the existing scoped PATCH with job location snapshots and optional catalog memory. |
| `apps/web/app/api/v1/jobs/[id]/materials/[lineId]/__tests__/route.unit.test.ts` | Verify status/location permissions, account scoping, and catalog opt-in. |
| `apps/web/app/api/v1/materials/supplier-preferences/route.ts` | Upsert one preferred branch per normalized supplier for owner/admin only. |
| `apps/web/app/api/v1/materials/supplier-preferences/__tests__/route.unit.test.ts` | Verify validation, role protection, account scoping, and upsert behavior. |
| `apps/web/app/app/jobs/[id]/materials/page.tsx` | Load location/cost snapshots and supplier preferences with existing job access checks. |
| `apps/web/app/app/jobs/[id]/materials/BuyListClient.tsx` | Add the Store Run entry point and switch between the existing list and focused run. |
| `apps/web/app/app/jobs/[id]/materials/StoreRunLauncher.tsx` | Select supplier/branch and start the run within two taps. |
| `apps/web/app/app/jobs/[id]/materials/StoreRunRoute.tsx` | Display ordered stops and coordinate explicit stop transitions and refreshes. |
| `apps/web/app/app/jobs/[id]/materials/StoreRunDepartment.tsx` | Persist one-item purchases, Undo, retry, and owner/admin location edits. |
| `apps/web/app/app/jobs/[id]/materials/StoreRunSummary.tsx` | Show session purchases, still-needed items, complete estimated total, and receipt link. |
| `tests/e2e/store-run-mobile.spec.ts` | Cover the owner mobile happy path through receipt preselection. |

### Task 1: Persist Store Locations and Preferred Branches

**Files:**
- Create: `db/migrations/171_job_store_run.sql`

**Interfaces:**
- Produces: nullable `job_material_lines.supplier`, `.aisle`, `.bay`; nullable `materials_price_book.aisle`, `.bay`; `account_supplier_preferences(account_id, supplier, supplier_normalized, branch_label, address)`.
- Consumes: existing `accounts`, `job_material_lines`, `materials_price_book`, `app_account_id()`, `app_role()`, and `update_updated_at_column()`.

- [ ] **Step 1: Write the migration with database-enforced scope and uniqueness**

```sql
ALTER TABLE job_material_lines
  ADD COLUMN IF NOT EXISTS supplier TEXT,
  ADD COLUMN IF NOT EXISTS aisle TEXT,
  ADD COLUMN IF NOT EXISTS bay TEXT;

ALTER TABLE materials_price_book
  ADD COLUMN IF NOT EXISTS aisle TEXT,
  ADD COLUMN IF NOT EXISTS bay TEXT;

CREATE TABLE IF NOT EXISTS account_supplier_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  supplier TEXT NOT NULL CHECK (btrim(supplier) <> ''),
  supplier_normalized TEXT NOT NULL CHECK (supplier_normalized = lower(btrim(supplier))),
  branch_label TEXT NOT NULL CHECK (btrim(branch_label) <> ''),
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, supplier_normalized)
);

CREATE INDEX IF NOT EXISTS idx_job_material_lines_supplier_needed
  ON job_material_lines (account_id, job_id, lower(supplier))
  WHERE status = 'needed';

CREATE INDEX IF NOT EXISTS idx_account_supplier_preferences_account
  ON account_supplier_preferences (account_id);

DROP TRIGGER IF EXISTS trg_account_supplier_preferences_updated
  ON account_supplier_preferences;
CREATE TRIGGER trg_account_supplier_preferences_updated
  BEFORE UPDATE ON account_supplier_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE account_supplier_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_supplier_preferences FORCE ROW LEVEL SECURITY;

CREATE POLICY account_supplier_preferences_select
  ON account_supplier_preferences FOR SELECT
  USING (account_id = app_account_id());

CREATE POLICY account_supplier_preferences_insert
  ON account_supplier_preferences FOR INSERT
  WITH CHECK (
    account_id = app_account_id()
    AND app_role() IN ('owner', 'admin')
  );

CREATE POLICY account_supplier_preferences_update
  ON account_supplier_preferences FOR UPDATE
  USING (
    account_id = app_account_id()
    AND app_role() IN ('owner', 'admin')
  )
  WITH CHECK (
    account_id = app_account_id()
    AND app_role() IN ('owner', 'admin')
  );

CREATE POLICY account_supplier_preferences_delete
  ON account_supplier_preferences FOR DELETE
  USING (
    account_id = app_account_id()
    AND app_role() IN ('owner', 'admin')
  );

-- Reversal:
-- DROP TABLE account_supplier_preferences;
-- DROP INDEX idx_job_material_lines_supplier_needed;
-- ALTER TABLE materials_price_book DROP COLUMN aisle, DROP COLUMN bay;
-- ALTER TABLE job_material_lines DROP COLUMN supplier, DROP COLUMN aisle, DROP COLUMN bay;
```

- [ ] **Step 2: Run the repository migration checks**

Run: `pnpm gate:fast`

Expected: PASS, including migration ordering and SQL checks.

- [ ] **Step 3: Commit the schema**

```bash
git add db/migrations/171_job_store_run.sql
git commit -m "feat: add job store location fields"
```

### Task 2: Derive the Store Route and Summary with Pure Helpers

**Files:**
- Modify: `apps/web/lib/jobs/buy-list.ts`
- Modify: `apps/web/lib/jobs/__tests__/buy-list.unit.test.ts`

**Interfaces:**
- Produces: `StoreRunLine`, `StoreRunStop`, `filterStoreRunLines(lines, supplier)`, `buildStoreRunStops(lines)`, and `summarizeStoreRun(lines, purchasedIds)`.
- Consumes: existing `BuyListStatus` and the persisted fields from Task 1.

- [ ] **Step 1: Add failing tests for supplier filtering and deterministic stop order**

```ts
import {
  buildStoreRunStops,
  filterStoreRunLines,
  summarizeStoreRun,
  type StoreRunLine,
} from "../buy-list";

const line = (overrides: Partial<StoreRunLine>): StoreRunLine => ({
  id: crypto.randomUUID(),
  name: "Deck screws",
  quantity: 1,
  unit_label: "box",
  store_section: "Fasteners",
  status: "needed",
  supplier: "Home Depot",
  aisle: null,
  bay: null,
  catalog_material_id: null,
  unit_cost_cents: null,
  ...overrides,
});

describe("Store Run helpers", () => {
  it("includes only selected-supplier and unassigned needed lines", () => {
    const selected = filterStoreRunLines(
      [
        line({ id: "hd", supplier: " Home Depot " }),
        line({ id: "none", supplier: null }),
        line({ id: "lowes", supplier: "Lowe's" }),
        line({ id: "truck", supplier: "Home Depot", status: "on_truck" }),
        line({ id: "done", supplier: "Home Depot", status: "purchased" }),
      ],
      "home depot",
    );
    expect(selected.map(({ id }) => id)).toEqual(["hd", "none"]);
  });

  it("orders numeric aisles first, then department-only, then unknown", () => {
    const stops = buildStoreRunStops([
      line({ id: "a13", store_section: "Fasteners", aisle: "Aisle 13" }),
      line({ id: "a4", store_section: "Lumber", aisle: "4", bay: "7" }),
      line({ id: "paint", store_section: "Paint", aisle: null }),
      line({ id: "unknown", store_section: null, aisle: "Rear wall" }),
    ]);
    expect(stops.map(({ key }) => key)).toEqual([
      "Lumber::4",
      "Fasteners::13",
      "Paint::department",
      "Unknown Location::unknown",
    ]);
    expect(stops[0].lines.map(({ id }) => id)).toEqual(["a4"]);
  });

  it("returns a total only when every session purchase has a catalog cost", () => {
    const lines = [
      line({ id: "known", quantity: 2, unit_cost_cents: 399 }),
      line({ id: "unknown", quantity: 1.5, unit_cost_cents: null }),
    ];
    expect(summarizeStoreRun(lines, new Set(["known"]))).toMatchObject({
      purchasedCount: 1,
      stillNeededCount: 1,
      estimatedPurchasedTotalCents: 798,
    });
    expect(
      summarizeStoreRun(lines, new Set(["known", "unknown"]))
        .estimatedPurchasedTotalCents,
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm --filter @ai-fsm/web test:unit -- lib/jobs/__tests__/buy-list.unit.test.ts`

Expected: FAIL because the Store Run exports do not exist.

- [ ] **Step 3: Add the minimal types and pure implementations**

```ts
export interface StoreRunLine {
  id: string;
  name: string;
  quantity: number;
  unit_label: string | null;
  store_section: string | null;
  status: BuyListStatus;
  supplier: string | null;
  aisle: string | null;
  bay: string | null;
  catalog_material_id: string | null;
  unit_cost_cents: number | null;
}

export interface StoreRunStop {
  key: string;
  department: string;
  aisleNumber: number | null;
  aisleLabel: string | null;
  lines: StoreRunLine[];
}

const normalized = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? "";

const leadingAisleNumber = (aisle: string | null): number | null => {
  const match = aisle?.match(/\d+/);
  return match ? Number(match[0]) : null;
};

export function filterStoreRunLines<T extends StoreRunLine>(
  lines: T[],
  supplier: string,
): T[] {
  const wanted = normalized(supplier);
  return lines.filter(
    (item) =>
      item.status === "needed" &&
      (!normalized(item.supplier) || normalized(item.supplier) === wanted),
  );
}

export function buildStoreRunStops(lines: StoreRunLine[]): StoreRunStop[] {
  const groups = new Map<string, StoreRunStop>();
  for (const item of lines) {
    const aisleNumber = leadingAisleNumber(item.aisle);
    const hasDepartment = Boolean(item.store_section?.trim());
    const department = hasDepartment
      ? item.store_section!.trim()
      : "Unknown Location";
    const suffix = aisleNumber !== null
      ? String(aisleNumber)
      : hasDepartment && !item.aisle?.trim()
        ? "department"
        : "unknown";
    const key = `${department}::${suffix}`;
    const stop = groups.get(key) ?? {
      key,
      department,
      aisleNumber,
      aisleLabel: item.aisle?.trim() || null,
      lines: [],
    };
    stop.lines.push(item);
    groups.set(key, stop);
  }
  return [...groups.values()].sort((a, b) => {
    const rank = (stop: StoreRunStop) =>
      stop.aisleNumber !== null ? 0 : stop.key.endsWith("::department") ? 1 : 2;
    return rank(a) - rank(b) ||
      (a.aisleNumber ?? 0) - (b.aisleNumber ?? 0) ||
      a.department.localeCompare(b.department);
  });
}

export function summarizeStoreRun(
  lines: StoreRunLine[],
  purchasedIds: ReadonlySet<string>,
) {
  const purchased = lines.filter((line) => purchasedIds.has(line.id));
  const complete = purchased.every((line) => line.unit_cost_cents !== null);
  return {
    purchasedCount: purchased.length,
    stillNeededCount: lines.filter(
      (line) => line.status === "needed" && !purchasedIds.has(line.id),
    ).length,
    estimatedPurchasedTotalCents: complete
      ? purchased.reduce(
          (sum, line) => sum + Math.round(line.quantity * line.unit_cost_cents!),
          0,
        )
      : null,
  };
}
```

- [ ] **Step 4: Run the helper regression suite**

Run: `pnpm --filter @ai-fsm/web test:unit -- lib/jobs/__tests__/buy-list.unit.test.ts`

Expected: PASS, including existing estimate mapping, manual merge, and status grouping tests.

- [ ] **Step 5: Commit the route logic**

```bash
git add apps/web/lib/jobs/buy-list.ts apps/web/lib/jobs/__tests__/buy-list.unit.test.ts
git commit -m "feat: derive guided store run route"
```

### Task 3: Copy Catalog Locations into Job Snapshots

**Files:**
- Modify: `apps/web/lib/jobs/buy-list.ts`
- Modify: `apps/web/lib/jobs/buy-list-seed.ts`
- Modify: `apps/web/lib/jobs/__tests__/buy-list.unit.test.ts`

**Interfaces:**
- Produces: optional `supplier`, `aisle`, and `bay` on `BuyListLineInput`; `hydrateBuyListLocations(client, accountId, lines)` returning `Promise<BuyListLineInput[]>`.
- Consumes: `BuyListLineInput[]` from estimate/manual/AI mapping and `materials_price_book` fields from Task 1.

- [ ] **Step 1: Add a failing test that catalog data wins and free-text stays unknown**

```ts
import { hydrateBuyListLocations } from "../buy-list-seed";

it("copies saved catalog purchasing data without inventing free-text locations", async () => {
  const query = vi.fn().mockResolvedValue({
    rows: [{
      id: "catalog-1",
      supplier: "Home Depot",
      aisle: "12",
      bay: "4",
    }],
  });
  const lines: BuyListLineInput[] = [
    { ...baseLine, name: "Screws", catalog_material_id: "catalog-1" },
    { ...baseLine, name: "Custom trim", catalog_material_id: null },
  ];

  await expect(
    hydrateBuyListLocations({ query } as never, "account-1", lines),
  ).resolves.toMatchObject([
    { supplier: "Home Depot", aisle: "12", bay: "4" },
    { supplier: null, aisle: null, bay: null },
  ]);
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining("account_id = $1"),
    ["account-1", ["catalog-1"]],
  );
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm --filter @ai-fsm/web test:unit -- lib/jobs/__tests__/buy-list.unit.test.ts`

Expected: FAIL because `hydrateBuyListLocations` is not exported.

- [ ] **Step 3: Extend the input type and hydrate once per seed operation**

```ts
// buy-list.ts — append to BuyListLineInput
supplier?: string | null;
aisle?: string | null;
bay?: string | null;
```

```ts
// buy-list-seed.ts
export async function hydrateBuyListLocations(
  client: PoolClient,
  accountId: string,
  lines: BuyListLineInput[],
): Promise<BuyListLineInput[]> {
  const ids = [...new Set(
    lines.flatMap((line) => line.catalog_material_id ? [line.catalog_material_id] : []),
  )];
  if (ids.length === 0) {
    return lines.map((line) => ({ ...line, supplier: null, aisle: null, bay: null }));
  }
  const result = await client.query<{
    id: string;
    supplier: string | null;
    aisle: string | null;
    bay: string | null;
  }>(
    `SELECT id, supplier, aisle, bay
     FROM materials_price_book
     WHERE account_id = $1 AND id = ANY($2::uuid[])`,
    [accountId, ids],
  );
  const locations = new Map(result.rows.map((row) => [row.id, row]));
  return lines.map((line) => {
    const location = line.catalog_material_id
      ? locations.get(line.catalog_material_id)
      : undefined;
    return {
      ...line,
      supplier: location?.supplier ?? null,
      aisle: location?.aisle ?? null,
      bay: location?.bay ?? null,
    };
  });
}
```

Call `hydrateBuyListLocations` inside `seedJobBuyList` after `buildSeedLinesFromEstimate` and before either `mergeMissingLines` or `insertBuyListLines`. Extend the existing insert, without another query per line:

```sql
INSERT INTO job_material_lines
  (account_id, job_id, name, quantity, unit_label, store_section,
   status, source, catalog_material_id, sku, notes, sort_order,
   supplier, aisle, bay)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
```

Bind `line.supplier ?? null`, `line.aisle ?? null`, and `line.bay ?? null` as parameters 13–15. This is the only source of exact aisle/bay during automatic seeding.

- [ ] **Step 4: Run buy-list tests and typecheck**

Run: `pnpm --filter @ai-fsm/web test:unit -- lib/jobs/__tests__/buy-list.unit.test.ts`

Expected: PASS.

Run: `pnpm --filter @ai-fsm/web typecheck`

Expected: PASS.

- [ ] **Step 5: Commit catalog snapshot propagation**

```bash
git add apps/web/lib/jobs/buy-list.ts apps/web/lib/jobs/buy-list-seed.ts apps/web/lib/jobs/__tests__/buy-list.unit.test.ts
git commit -m "feat: copy catalog locations to job materials"
```

### Task 4: Secure Location Memory and Supplier Preferences

**Files:**
- Modify: `apps/web/app/api/v1/jobs/[id]/materials/[lineId]/route.ts`
- Create: `apps/web/app/api/v1/jobs/[id]/materials/[lineId]/__tests__/route.unit.test.ts`
- Create: `apps/web/app/api/v1/materials/supplier-preferences/route.ts`
- Create: `apps/web/app/api/v1/materials/supplier-preferences/__tests__/route.unit.test.ts`

**Interfaces:**
- Produces: existing line `PATCH` accepts `{ supplier?, aisle?, bay?, remember_for_future? }`; preference `PUT` accepts `{ supplier, branch_label, address? }` and returns the saved row.
- Consumes: `withAuth`, `withDbSession`, existing job access rules, and schema from Task 1.

- [ ] **Step 1: Add failing line PATCH tests for owner memory and technician denial**

Mock `withAuth` and `withDbSession` using the existing API-test convention, then add these cases:

```ts
it("updates the job snapshot and opted-in catalog memory in one transaction", async () => {
  mockSession.role = "owner";
  mockClientQuery
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "job-1" }] })
    .mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: "line-1",
        catalog_material_id: "catalog-1",
        supplier: "Home Depot",
        aisle: "13",
        bay: "8",
      }],
    })
    .mockResolvedValueOnce({ rowCount: 1, rows: [] });

  const response = await PATCH(makePatch({
    supplier: "Home Depot",
    aisle: "13",
    bay: "8",
    remember_for_future: true,
  }));

  expect(response.status).toBe(200);
  expect(mockClientQuery).toHaveBeenLastCalledWith(
    expect.stringContaining("UPDATE materials_price_book"),
    ["Home Depot", "13", "8", "catalog-1", mockSession.accountId],
  );
});

it("keeps assigned technicians status-only", async () => {
  mockSession.role = "tech";
  const response = await PATCH(makePatch({ aisle: "13" }));
  expect(response.status).toBe(403);
  expect(mockClientQuery).not.toHaveBeenCalled();
});

it("does not update catalog memory without explicit opt-in", async () => {
  mockSession.role = "owner";
  mockClientQuery
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "job-1" }] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "line-1" }] });
  const response = await PATCH(makePatch({ aisle: "13", bay: null }));
  expect(response.status).toBe(200);
  expect(mockClientQuery).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Add failing preference tests for normalized upsert and roles**

```ts
it("upserts one preferred branch per normalized supplier and account", async () => {
  mockSession.role = "admin";
  mockClientQuery.mockResolvedValueOnce({
    rowCount: 1,
    rows: [{
      supplier: "Home Depot",
      supplier_normalized: "home depot",
      branch_label: "Somerville",
      address: "75 Mystic Ave",
    }],
  });
  const response = await PUT(makePut({
    supplier: " Home Depot ",
    branch_label: "Somerville",
    address: "75 Mystic Ave",
  }));
  expect(response.status).toBe(200);
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining("ON CONFLICT (account_id, supplier_normalized)"),
    [mockSession.accountId, "Home Depot", "home depot", "Somerville", "75 Mystic Ave"],
  );
});

it("rejects technician preference writes before touching the database", async () => {
  mockSession.role = "tech";
  const response = await PUT(makePut({
    supplier: "Home Depot",
    branch_label: "Somerville",
  }));
  expect(response.status).toBe(403);
  expect(mockClientQuery).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run both focused test files and confirm they fail**

Run: `pnpm --filter @ai-fsm/web test:unit -- 'app/api/v1/jobs/[id]/materials/[lineId]/__tests__/route.unit.test.ts' app/api/v1/materials/supplier-preferences/__tests__/route.unit.test.ts`

Expected: FAIL because location fields, catalog opt-in, and the preference route do not exist.

- [ ] **Step 4: Extend the existing line PATCH without weakening its scope**

Add fields to `patchBody`:

```ts
supplier: z.string().trim().min(1).max(100).nullable().optional(),
aisle: z.string().trim().max(50).nullable().optional(),
bay: z.string().trim().max(50).nullable().optional(),
remember_for_future: z.boolean().optional(),
```

Remove `remember_for_future` before building dynamic SQL so it can never become a column name. Keep the existing technician check unchanged in meaning: a technician request must contain exactly `status`. Return `catalog_material_id` from the job-line update, then run catalog memory only when all conditions are true:

```ts
const { remember_for_future, ...linePatch } = parsed.data;
// Build SET clauses from linePatch only.

if (remember_for_future && updated.catalog_material_id) {
  await client.query(
    `UPDATE materials_price_book
     SET supplier = $1, aisle = $2, bay = $3
     WHERE id = $4 AND account_id = $5`,
    [updated.supplier, updated.aisle, updated.bay,
     updated.catalog_material_id, session.accountId],
  );
}
```

Reject `{ remember_for_future: true }` with no location fields as a 422 no-fields update. The existing `WHERE id/job_id/account_id` and assigned-tech checks remain mandatory.

- [ ] **Step 5: Implement the single preference PUT route**

```ts
const bodySchema = z.object({
  supplier: z.string().trim().min(1).max(100),
  branch_label: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).nullable().optional(),
});

export const PUT = withAuth(async (request: NextRequest, session: AuthSession) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Only owners and admins can change supplier preferences", traceId: session.traceId } },
      { status: 403 },
    );
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid body", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 422 },
    );
  }
  const supplier = parsed.data.supplier.trim();
  return withDbSession(session, async (client) => {
    const saved = await client.query(
      `INSERT INTO account_supplier_preferences
         (account_id, supplier, supplier_normalized, branch_label, address)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (account_id, supplier_normalized) DO UPDATE
       SET supplier = EXCLUDED.supplier,
           branch_label = EXCLUDED.branch_label,
           address = EXCLUDED.address
       RETURNING supplier, supplier_normalized, branch_label, address`,
      [session.accountId, supplier, supplier.toLowerCase(),
       parsed.data.branch_label, parsed.data.address ?? null],
    );
    return NextResponse.json({ data: saved.rows[0] });
  });
});
```

Wrap database failures with the project logger and a 500 response, matching the existing route style.

- [ ] **Step 6: Run route tests and typecheck**

Run: `pnpm --filter @ai-fsm/web test:unit -- 'app/api/v1/jobs/[id]/materials/[lineId]/__tests__/route.unit.test.ts' app/api/v1/materials/supplier-preferences/__tests__/route.unit.test.ts`

Expected: PASS for owner/admin writes, tech restrictions, opt-in behavior, and account-scoped SQL.

Run: `pnpm --filter @ai-fsm/web typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the secured APIs**

```bash
git add 'apps/web/app/api/v1/jobs/[id]/materials/[lineId]/route.ts' \
  'apps/web/app/api/v1/jobs/[id]/materials/[lineId]/__tests__/route.unit.test.ts' \
  apps/web/app/api/v1/materials/supplier-preferences/route.ts \
  apps/web/app/api/v1/materials/supplier-preferences/__tests__/route.unit.test.ts
git commit -m "feat: remember job store locations"
```

### Task 5: Add the Guided Mobile Store Run

**Files:**
- Modify: `apps/web/app/app/jobs/[id]/materials/page.tsx`
- Modify: `apps/web/app/app/jobs/[id]/materials/BuyListClient.tsx`
- Create: `apps/web/app/app/jobs/[id]/materials/StoreRunLauncher.tsx`
- Create: `apps/web/app/app/jobs/[id]/materials/StoreRunRoute.tsx`
- Create: `apps/web/app/app/jobs/[id]/materials/StoreRunDepartment.tsx`
- Create: `apps/web/app/app/jobs/[id]/materials/StoreRunSummary.tsx`

**Interfaces:**
- Produces: `StoreRunLauncher`, `StoreRunRoute`, `StoreRunDepartment`, and `StoreRunSummary`; stable test IDs `start-store-run`, `store-run-supplier`, `store-run-begin`, `store-run-item-<id>`, `store-run-next`, `store-run-finish`, and `store-run-upload-receipt`.
- Consumes: `StoreRunLine`, `StoreRunStop`, `filterStoreRunLines`, `buildStoreRunStops`, `summarizeStoreRun`; line PATCH and preference PUT from Task 4.

- [ ] **Step 1: Extend the server query and client types before rendering the mode**

Extend `BuyListLine` with the Task 2 `StoreRunLine` fields plus its existing `source` and `notes`. Query the cost only through the catalog link and load account preferences in the already-authenticated page:

```sql
SELECT jml.id, jml.name, jml.quantity, jml.unit_label,
       jml.store_section, jml.status, jml.source, jml.notes,
       jml.supplier, jml.aisle, jml.bay, jml.catalog_material_id,
       mpb.unit_cost_cents
FROM job_material_lines jml
LEFT JOIN materials_price_book mpb
  ON mpb.id = jml.catalog_material_id
 AND mpb.account_id = jml.account_id
WHERE jml.job_id = $1 AND jml.account_id = $2
ORDER BY jml.sort_order ASC, jml.created_at ASC
```

```ts
export interface SupplierPreference {
  supplier: string;
  branch_label: string;
  address: string | null;
}

const supplierPreferences = await queryForSession<SupplierPreference>(
  session,
  `SELECT supplier, branch_label, address
   FROM account_supplier_preferences
   WHERE account_id = $1
   ORDER BY supplier`,
  [session.accountId],
);
```

Pass `supplierPreferences`, `canEdit`, and the enriched lines into `BuyListClient`.

- [ ] **Step 2: Implement the two-tap launcher**

`StoreRunLauncher` receives lines, preferences, `canEdit`, `onStart(supplier)`, and `onCancel()`. Build supplier options from needed-line suppliers plus these fixed fallbacks, deduplicated case-insensitively:

```ts
const DEFAULT_SUPPLIERS = ["Home Depot", "Lowe's", "Supply House"];

const suppliers = [...new Map(
  [...lines.flatMap((line) => line.supplier ? [line.supplier] : []), ...DEFAULT_SUPPLIERS]
    .map((supplier) => [supplier.trim().toLowerCase(), supplier.trim()]),
).values()];
```

Render a native `<select data-testid="store-run-supplier">`, the saved branch label/address when present, and one `<button data-testid="store-run-begin">Begin run</button>`. If `canEdit`, render branch/address inputs and save changed values with one preference `PUT` before calling `onStart`; if not, show saved preference read-only. The first tap is `start-store-run` in `BuyListClient`; the second is `store-run-begin`.

- [ ] **Step 3: Implement route orchestration with session-only React state**

In `BuyListClient`, add only the top-level mode switch:

```ts
type StoreRunMode = "list" | "launch" | "route" | "summary";
const [storeRunMode, setStoreRunMode] = useState<StoreRunMode>("list");
const [storeRunSupplier, setStoreRunSupplier] = useState<string | null>(null);
```

Render `Start Store Run` only when at least one line is `needed`. Delegate the run to `StoreRunRoute` and keep the existing buy-list behavior unchanged when mode is `list`.

`StoreRunRoute` owns only temporary state:

```ts
const [currentStop, setCurrentStop] = useState(0);
const [purchasedIds, setPurchasedIds] = useState<Set<string>>(() => new Set());
const included = filterStoreRunLines(linesAtStart, supplier);
const stops = buildStoreRunStops(included);
```

Show the overview first, then the current `StoreRunDepartment`. Add `refreshLines()` to `BuyListClient`: GET `/api/v1/jobs/${jobId}/materials` with `cache: "no-store"`, throw on a non-OK response, assign `payload.data.lines` to `setLines`, and return those fresh lines. Pass it as `onRefresh`. After a stop is complete, display an explicit `store-run-next` button labelled with the next department and aisle. On click, await `onRefresh()` before advancing. If refresh fails, keep the current stop and show a Retry button. After the last stop, use `store-run-finish`, await one final refresh, and call `onComplete(purchasedIds, freshLines)`.

- [ ] **Step 4: Implement independent purchase, retry, Undo, and location edit**

`StoreRunDepartment` tracks `pendingId` and `failedId`, never a page-wide pending flag. Use the existing line endpoint:

```ts
async function patchLine(id: string, patch: Record<string, unknown>) {
  const response = await fetch(`/api/v1/jobs/${jobId}/materials/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error("Could not update item");
  return (await response.json()).data as BuyListLine;
}

async function purchase(line: BuyListLine) {
  setPendingId(line.id);
  setFailedId(null);
  try {
    const updated = await patchLine(line.id, { status: "purchased" });
    onLineUpdated(updated);
    onPurchased(line.id);
  } catch {
    setFailedId(line.id);
  } finally {
    setPendingId(null);
  }
}
```

The item button uses `data-testid={\`store-run-item-${line.id}\}` and is disabled only when `pendingId === line.id`. On failure, keep it visible and render a Retry button calling `purchase(line)`. After success, show a short-lived Undo action that PATCHes `{ status: "needed" }`, calls `onUndo(line.id)`, and reinserts the line in the active stop.

For owner/admin only, `Edit location` opens inline native inputs for supplier, aisle, and bay. Show `Remember for future jobs` only when `catalog_material_id` exists, and PATCH:

```ts
await patchLine(line.id, {
  supplier: supplier.trim() || null,
  aisle: aisle.trim() || null,
  bay: bay.trim() || null,
  remember_for_future: Boolean(line.catalog_material_id && remember),
});
```

Technicians receive no location editing control.

- [ ] **Step 5: Implement completion using existing expense preselection**

`StoreRunSummary` receives the run-start lines, final lines, and `purchasedIds`. Use `summarizeStoreRun`; render the total only when it is non-null. Do not calculate from job lines that were purchased before this browser session.

```tsx
{summary.estimatedPurchasedTotalCents !== null && (
  <p>Estimated purchased: {formatCurrency(summary.estimatedPurchasedTotalCents)}</p>
)}
<Link
  href={`/app/expenses/new?mode=run&job=${jobId}` as Route}
  data-testid="store-run-upload-receipt"
>
  Upload Receipt
</Link>
<Link href={`/app/jobs/${jobId}` as Route}>Back to Job</Link>
```

The existing expense page already accepts `mode=run` and `job`; do not modify expense files.

- [ ] **Step 6: Run focused regressions, lint, and typecheck**

Run: `pnpm --filter @ai-fsm/web test:unit -- lib/jobs/__tests__/buy-list.unit.test.ts`

Expected: PASS.

Run: `pnpm --filter @ai-fsm/web lint`

Expected: PASS.

Run: `pnpm --filter @ai-fsm/web typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the Store Run UI**

```bash
git add 'apps/web/app/app/jobs/[id]/materials/page.tsx' \
  'apps/web/app/app/jobs/[id]/materials/BuyListClient.tsx' \
  'apps/web/app/app/jobs/[id]/materials/StoreRunLauncher.tsx' \
  'apps/web/app/app/jobs/[id]/materials/StoreRunRoute.tsx' \
  'apps/web/app/app/jobs/[id]/materials/StoreRunDepartment.tsx' \
  'apps/web/app/app/jobs/[id]/materials/StoreRunSummary.tsx'
git commit -m "feat: add guided job store run"
```

### Task 6: Prove the Mobile Flow and Run the Release Gate

**Files:**
- Create: `tests/e2e/store-run-mobile.spec.ts`

**Interfaces:**
- Consumes: stable test IDs from Task 5, seeded owner credentials, an existing job with needed material lines, and existing expense form selectors.
- Produces: one mobile acceptance smoke covering launch, supplier selection, purchase, explicit advance, completion, and receipt job preselection.

- [ ] **Step 1: Add the mobile smoke test**

Use the same login setup as `tests/e2e/my-day-mobile.spec.ts`. The test precondition is a seeded job named `Test Store Run Job` with two needed Home Depot lines: Lumber in aisle 4 and Fasteners in aisle 13.

```ts
import { test, expect } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";

test.describe("Guided Store Run mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', "owner@test.com");
    await page.fill('[id="password"]', "password");
    await page.click('[type="submit"]');
    await page.waitForURL(/\/app\/my-(?:day|work)/);
  });

  test("purchases by department and opens receipt with the job selected", async ({ page }) => {
    await page.goto(`${BASE}/app/jobs`);
    await page.getByRole("link", { name: /test store run job/i }).click();
    const jobUrl = page.url();
    const jobId = jobUrl.match(/\/app\/jobs\/([^/]+)/)?.[1];
    expect(jobId).toBeTruthy();
    await page.goto(`${BASE}/app/jobs/${jobId}/materials`);

    await page.getByTestId("start-store-run").click();
    await page.getByTestId("store-run-supplier").selectOption({ label: "Home Depot" });
    await page.getByTestId("store-run-begin").click();

    await page.locator('[data-testid^="store-run-item-"]').first().click();
    await expect(page.getByTestId("store-run-next")).toBeVisible();
    await page.getByTestId("store-run-next").click();
    await page.locator('[data-testid^="store-run-item-"]').first().click();
    await page.getByTestId("store-run-finish").click();

    await page.getByTestId("store-run-upload-receipt").click();
    await expect(page).toHaveURL(new RegExp(`/app/expenses/new\\?mode=run&job=${jobId}`));
    await expect(page.locator('select[name="job_id"]')).toHaveValue(jobId!);
  });
});
```


- [ ] **Step 2: Run the smoke test and verify the complete interaction**

Run: `pnpm test:e2e -- tests/e2e/store-run-mobile.spec.ts`

Expected: PASS at a 390x844 viewport, with no automatic department transition and the receipt form job preselected.

- [ ] **Step 3: Run the complete fast release gate**

Run: `pnpm gate:fast`

Expected: PASS with unit tests, lint, typecheck, migration validation, and build checks green.

- [ ] **Step 4: Review the diff for forbidden scope expansion**

Run: `git diff --check && git diff --stat`

Expected: no whitespace errors; no new dependencies, store-run persistence, receipt reconciliation, or unrelated file changes.

- [ ] **Step 5: Commit acceptance coverage**

```bash
git add tests/e2e/store-run-mobile.spec.ts
git commit -m "test: cover guided store run on mobile"
```

## Final Verification

- [ ] Run `pnpm --filter @ai-fsm/web test:unit -- lib/jobs/__tests__/buy-list.unit.test.ts 'app/api/v1/jobs/[id]/materials/[lineId]/__tests__/route.unit.test.ts' app/api/v1/materials/supplier-preferences/__tests__/route.unit.test.ts` and confirm PASS.
- [ ] Run `pnpm test:e2e -- tests/e2e/store-run-mobile.spec.ts` and confirm PASS.
- [ ] Run `pnpm gate:fast` and confirm PASS.
- [ ] Confirm a technician can purchase/undo only on an assigned job and cannot see location/preference edit controls.
- [ ] Confirm a reload retains persisted statuses but resets supplier, route position, and session summary.
- [ ] Confirm an unknown catalog cost hides the estimated total.
- [ ] Confirm no code path supplies AI-generated aisle or bay values.
- [ ] Confirm `/app/expenses/new?mode=run&job=<id>` selects both material-run mode and the current job.

