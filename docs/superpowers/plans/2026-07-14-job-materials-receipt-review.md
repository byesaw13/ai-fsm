# Job Materials — Receipt Review & Margin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make receipts linked to a job visible and itemized on the job page, itemize receipts automatically on scan, let itemized lines be corrected inline, and fold linked-receipt material cost into the job's existing margin calculation.

**Architecture:** Extend existing tables/functions (`expense_line_items`, `fetchExpenseLineItems`/`replaceExpenseLineItems`, the job page's existing cost calc) rather than building new infrastructure. Two new small API routes, two new presentational/editor components, targeted edits to three existing files.

**Tech Stack:** Next.js App Router (server components + route handlers), PostgreSQL via `pg` (`PoolClient`), Zod validation, Vitest for unit tests, `@anthropic-ai/sdk` for receipt OCR.

## Global Constraints

- Non-negotiable project rule: business logic changes require tests or a documented test gap (`/home/nick/ai-fsm-deploy-clean/CLAUDE.md`). This codebase has **no** `.test.tsx` component tests anywhere — UI/presentational tasks (4, 5, 6, 7) are verified by typecheck + lint + manual browser QA (Task 8), not automated tests. This is a documented gap, not an oversight. Query and route-handler logic (Tasks 1, 2, 3) get real Vitest unit tests.
- Migrations are additive/reversible — this plan needs **no migrations**; `expense_line_items` already exists (migration 143).
- `materials`-category scope only — matches every existing piece of this system (forgotten-receipts panel, auto-invoicing, job cost rollup). Do not widen to other expense categories.
- Never skip quality gates — Task 8 runs the fast gate before this is considered done.
- Spec: `docs/superpowers/specs/2026-07-14-job-materials-receipt-review-design.md`

---

### Task 1: `fetchJobMaterialExpenses` query function

**Files:**
- Modify: `apps/web/lib/invoices/job-expenses.ts`
- Test: `apps/web/lib/invoices/__tests__/job-expenses.unit.test.ts`

**Interfaces:**
- Consumes: `fetchExpenseLineItems` (already imported in this file from `@/lib/expenses/line-items`), `toLineItemPreview` (private function already defined in this file at line 254), `ExpenseLineItemPreview` type (already imported from `./material-handling`).
- Produces: `export type JobMaterialExpenseWithLines = { id: string; vendor_name: string; amount_cents: number; notes: string | null; expense_date: string; billed: boolean; line_items: ExpenseLineItemPreview[] }` and `export async function fetchJobMaterialExpenses(client: PoolClient, accountId: string, jobId: string): Promise<JobMaterialExpenseWithLines[]>`. Task 6 and Task 7 import both.

- [ ] **Step 1: Write the failing test**

Add to the bottom of `apps/web/lib/invoices/__tests__/job-expenses.unit.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import {
  materialHandlingCents,
  materialInvoiceTotalCents,
  materialExpenseDescription,
  fetchJobMaterialExpenses,
} from "../job-expenses";

function makeClient(results: unknown[]): PoolClient {
  let index = 0;
  return {
    query: vi.fn().mockImplementation(() => Promise.resolve(results[index++] ?? { rows: [], rowCount: 0 })),
  } as unknown as PoolClient;
}

describe("fetchJobMaterialExpenses", () => {
  it("returns linked materials expenses with itemized lines and billed status", async () => {
    const client = makeClient([
      {
        rows: [
          {
            id: "exp-1",
            vendor_name: "Home Depot",
            amount_cents: 5000,
            notes: null,
            expense_date: "2026-07-10",
            billed: false,
          },
          {
            id: "exp-2",
            vendor_name: "Lowes",
            amount_cents: 3000,
            notes: "Trim",
            expense_date: "2026-07-08",
            billed: true,
          },
        ],
        rowCount: 2,
      },
      // fetchExpenseLineItems for exp-1
      {
        rows: [
          { id: "li-1", expense_id: "exp-1", name: "2x4", quantity: 10, unit_cost_cents: 400, sku: null, sort_order: 0 },
        ],
        rowCount: 1,
      },
      // fetchExpenseLineItems for exp-2
      { rows: [], rowCount: 0 },
    ]);

    const rows = await fetchJobMaterialExpenses(client, "acct-1", "job-1");

    expect(rows).toHaveLength(2);
    expect(rows[0].billed).toBe(false);
    expect(rows[0].line_items).toEqual([
      { id: "li-1", name: "2x4", quantity: 10, unit_cost_cents: 400, line_total_cents: 4000 },
    ]);
    expect(rows[1].billed).toBe(true);
    expect(rows[1].line_items).toEqual([]);

    const firstCallSql = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(firstCallSql).toContain("e.job_id = $2");
    expect(firstCallSql).toContain("e.category = 'materials'");
  });
});
```

Note: keep the existing top-level `describe("job-expenses", ...)` block in that file untouched; this is a new, second `describe` block appended after it. Remove the now-duplicate `import { describe, expect, it } from "vitest";` at the top of the file (merge into the new import shown above, which adds `vi`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ai-fsm/web exec vitest run lib/invoices/__tests__/job-expenses.unit.test.ts`
Expected: FAIL with `fetchJobMaterialExpenses is not a function` (or similar — the export doesn't exist yet).

- [ ] **Step 3: Implement `fetchJobMaterialExpenses`**

In `apps/web/lib/invoices/job-expenses.ts`, add this type and function after `fetchLinkableMaterialExpenses` (after line 311, before `export type JobLinkContext`):

```ts
export type JobMaterialExpenseWithLines = {
  id: string;
  vendor_name: string;
  amount_cents: number;
  notes: string | null;
  expense_date: string;
  billed: boolean;
  line_items: ExpenseLineItemPreview[];
};

/** All materials-category expenses linked to a job, itemized, with billed status. */
export async function fetchJobMaterialExpenses(
  client: PoolClient,
  accountId: string,
  jobId: string,
): Promise<JobMaterialExpenseWithLines[]> {
  const result = await client.query<{
    id: string;
    vendor_name: string;
    amount_cents: number;
    notes: string | null;
    expense_date: string;
    billed: boolean;
  }>(
    `SELECT e.id, e.vendor_name, e.amount_cents, e.notes,
            e.expense_date::text AS expense_date,
            EXISTS(
              SELECT 1 FROM invoice_line_items ili WHERE ili.source_expense_id = e.id
            ) AS billed
     FROM expenses e
     WHERE e.account_id = $1
       AND e.job_id = $2
       AND e.category = 'materials'
     ORDER BY e.expense_date DESC, e.created_at DESC`,
    [accountId, jobId],
  );

  const enriched: JobMaterialExpenseWithLines[] = [];
  for (const expense of result.rows) {
    const skuLines = await fetchExpenseLineItems(client, accountId, expense.id);
    enriched.push({
      ...expense,
      line_items: skuLines.map(toLineItemPreview),
    });
  }
  return enriched;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ai-fsm/web exec vitest run lib/invoices/__tests__/job-expenses.unit.test.ts`
Expected: PASS, both the pre-existing test and the new `fetchJobMaterialExpenses` test.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/invoices/job-expenses.ts apps/web/lib/invoices/__tests__/job-expenses.unit.test.ts
git commit -m "feat(invoices): add fetchJobMaterialExpenses for job-linked receipts"
```

---

### Task 2: `PUT /api/v1/expenses/[id]/line-items` endpoint

**Files:**
- Create: `apps/web/app/api/v1/expenses/[id]/line-items/route.ts`
- Test: `apps/web/app/api/v1/expenses/__tests__/line-items.unit.test.ts`

**Interfaces:**
- Consumes: `replaceExpenseLineItems(client, accountId, expenseId, items)` and `ExpenseLineItemInput` type (both already exported from `@/lib/expenses/line-items`), `appendAuditLog` (from `@/lib/db/audit`), `withRole` (from `@/lib/auth/middleware`), `withExpenseContext` (from `@/lib/expenses/db`).
- Produces: `PUT` handler at `/api/v1/expenses/[id]/line-items`. Request body: `{ line_items: { name: string; quantity?: number; unit_cost_cents: number; sku?: string | null }[] }`. Success response: `{ data: { line_items: ExpenseLineItemRow[] } }` (200). Errors: 400 (validation), 404 (`NOT_FOUND`), 409 (`ALREADY_BILLED`), 500. Task 4 and Task 5 call this endpoint.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/v1/expenses/__tests__/line-items.unit.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withRole: (_roles: string[], handler: Function) => (req: NextRequest) => handler(req, mockSession),
}));

const mockWithExpenseContext = vi.fn();
vi.mock("@/lib/expenses/db", () => ({
  withExpenseContext: (...args: unknown[]) => mockWithExpenseContext(...args),
}));

vi.mock("@ai-fsm/log/web", () => ({
  logger: { error: vi.fn() },
}));

import { PUT } from "../[id]/line-items/route";

function requestWithBody(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/expenses/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/line-items",
    { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
  );
}

describe("PUT /api/v1/expenses/[id]/line-items", () => {
  it("rejects an empty line item name before touching the database", async () => {
    const res = await PUT(requestWithBody({ line_items: [{ name: "", unit_cost_cents: 100 }] }));
    expect(res.status).toBe(400);
    expect(mockWithExpenseContext).not.toHaveBeenCalled();
  });

  it("rejects a negative unit cost before touching the database", async () => {
    const res = await PUT(requestWithBody({ line_items: [{ name: "2x4", unit_cost_cents: -100 }] }));
    expect(res.status).toBe(400);
    expect(mockWithExpenseContext).not.toHaveBeenCalled();
  });

  it("returns 409 when the expense is already billed on an invoice", async () => {
    mockWithExpenseContext.mockImplementation(async (_session, fn) => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ id: "exp-1" }], rowCount: 1 }) // expense exists
          .mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 }), // billed check
      };
      return fn(client);
    });

    const res = await PUT(requestWithBody({ line_items: [{ name: "2x4", unit_cost_cents: 400 }] }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("ALREADY_BILLED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ai-fsm/web exec vitest run app/api/v1/expenses/__tests__/line-items.unit.test.ts`
Expected: FAIL — `Cannot find module '../[id]/line-items/route'`.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/v1/expenses/[id]/line-items/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import { replaceExpenseLineItems } from "@/lib/expenses/line-items";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@ai-fsm/log/web";

export const dynamic = "force-dynamic";

const lineItemSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().positive().default(1),
  unit_cost_cents: z.number().int().nonnegative(),
  sku: z.string().max(100).nullable().optional(),
});

const putBodySchema = z.object({
  line_items: z.array(lineItemSchema).max(100),
});

export const PUT = withRole(["owner", "admin"], async (request, session) => {
  const expenseId = request.nextUrl.pathname.split("/").at(-2)!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body", traceId: session.traceId } },
      { status: 400 },
    );
  }

  const parseResult = putBodySchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid line items",
          details: { issues: parseResult.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 },
    );
  }

  try {
    const data = await withExpenseContext(session, async (client) => {
      const expense = await client.query<{ id: string }>(
        `SELECT id FROM expenses WHERE id = $1 AND account_id = $2`,
        [expenseId, session.accountId],
      );
      if ((expense.rowCount ?? 0) === 0) {
        throw Object.assign(new Error("Expense not found"), { code: "NOT_FOUND" });
      }

      const billed = await client.query(
        `SELECT 1 AS exists FROM invoice_line_items WHERE source_expense_id = $1 LIMIT 1`,
        [expenseId],
      );
      if ((billed.rowCount ?? 0) > 0) {
        throw Object.assign(
          new Error("This receipt is already on an invoice — edit the invoice instead"),
          { code: "ALREADY_BILLED" },
        );
      }

      const saved = await replaceExpenseLineItems(
        client,
        session.accountId,
        expenseId,
        parseResult.data.line_items.map((li, idx) => ({
          name: li.name,
          quantity: li.quantity,
          unit_cost_cents: li.unit_cost_cents,
          sku: li.sku ?? null,
          sort_order: idx,
        })),
      );

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "expense",
        entity_id: expenseId,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { action: "edit_line_items", count: saved.length },
      });

      return { line_items: saved };
    });

    return NextResponse.json({ data });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Expense not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    if (err.code === "ALREADY_BILLED") {
      return NextResponse.json(
        { error: { code: "ALREADY_BILLED", message: err.message, traceId: session.traceId } },
        { status: 409 },
      );
    }

    logger.error("PUT /api/v1/expenses/[id]/line-items error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to save line items", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ai-fsm/web exec vitest run app/api/v1/expenses/__tests__/line-items.unit.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/expenses/[id]/line-items/route.ts apps/web/app/api/v1/expenses/__tests__/line-items.unit.test.ts
git commit -m "feat(expenses): add PUT line-items endpoint with billed-lock"
```

---

### Task 3: Itemize on scan — swap the scan-receipt prompt

**Files:**
- Modify: `apps/web/app/api/v1/expenses/scan-receipt/route.ts`
- Test: `apps/web/app/api/v1/expenses/__tests__/scan-receipt.unit.test.ts` (new)

**Interfaces:**
- Consumes: `RECEIPT_LINE_ITEMS_PROMPT`, `normalizeParsedReceiptLineItems`, `type ParsedReceipt` (all already exported from `@/lib/expenses/receipt-line-items`, used today only by the parse-line-items route).
- Produces: `POST /api/v1/expenses/scan-receipt` response now includes `line_items: { name: string; quantity: number; unit_cost_cents: number; sku: string | null }[]` alongside the existing fields. Task 4 (`ExpenseForm.tsx`) consumes this new field.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/v1/expenses/__tests__/scan-receipt.unit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withAuth: (handler: Function) => (req: NextRequest) => handler(req, mockSession),
}));

vi.mock("@/lib/auth/permissions", () => ({
  canManageExpenses: () => true,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { POST } from "../scan-receipt/route";

function requestWithFile(file: File): NextRequest {
  const form = new FormData();
  form.append("receipt", file);
  return new NextRequest("http://localhost/api/v1/expenses/scan-receipt", {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  mockCreate.mockReset();
});

describe("POST /api/v1/expenses/scan-receipt", () => {
  it("returns itemized line items alongside totals", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            vendor_name: "Home Depot",
            amount_cents: 4400,
            expense_date: "2026-07-10",
            category: "materials",
            notes: "Deck repair run",
            line_items: [
              { name: "2x4 lumber", quantity: 10, unit_cost_cents: 400, sku: "12345" },
              { name: "Deck screws", quantity: 1, unit_cost_cents: 400, sku: null },
            ],
          }),
        },
      ],
    });

    const file = new File(["fake"], "receipt.jpg", { type: "image/jpeg" });
    const res = await POST(requestWithFile(file));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.vendor_name).toBe("Home Depot");
    expect(json.data.line_items).toEqual([
      { name: "2x4 lumber", quantity: 10, unit_cost_cents: 400, sku: "12345" },
      { name: "Deck screws", quantity: 1, unit_cost_cents: 400, sku: null },
    ]);
  });

  it("returns an empty line_items array when the AI omits them, without failing the scan", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            vendor_name: "Shell",
            amount_cents: 4000,
            expense_date: "2026-07-10",
            category: "fuel",
            notes: null,
          }),
        },
      ],
    });

    const file = new File(["fake"], "receipt.jpg", { type: "image/jpeg" });
    const res = await POST(requestWithFile(file));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.line_items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ai-fsm/web exec vitest run app/api/v1/expenses/__tests__/scan-receipt.unit.test.ts`
Expected: FAIL — `json.data.line_items` is `undefined` (route doesn't return line items yet).

- [ ] **Step 3: Swap the prompt and return line items**

In `apps/web/app/api/v1/expenses/scan-receipt/route.ts`:

Replace the import block (lines 1-6) with:

```ts
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { withAuth } from "../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../lib/auth/middleware";
import { canManageExpenses } from "../../../../../lib/auth/permissions";
import { logger } from "../../../../../lib/logger";
import {
  RECEIPT_LINE_ITEMS_PROMPT,
  normalizeParsedReceiptLineItems,
  type ParsedReceipt,
} from "@/lib/expenses/receipt-line-items";
```

Delete the local `RECEIPT_PROMPT` constant (lines 15-37 in the original file — the whole `const RECEIPT_PROMPT = \`...\`;` block). Keep `EXPENSE_CATEGORIES`.

In the Anthropic call, replace `{ type: "text", text: RECEIPT_PROMPT }` with `{ type: "text", text: RECEIPT_LINE_ITEMS_PROMPT }`, and bump `max_tokens: 512` to `max_tokens: 2048` (itemized JSON needs more room than totals-only).

Replace the `parsed` type declaration and its usage:

```ts
    let parsed: ParsedReceipt;
    try {
      parsed = JSON.parse(jsonText) as ParsedReceipt;
    } catch {
      logger.warn("[scan-receipt] Claude returned non-JSON", { raw: rawText, traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "PARSE_ERROR", message: "Could not extract receipt data — try a clearer photo", traceId: session.traceId } },
        { status: 422 }
      );
    }
```

Keep the existing `category`, `amount_cents`, `expense_date` validation/normalization block unchanged (it already reads from `parsed`). Add itemization and return it:

```ts
    const line_items = normalizeParsedReceiptLineItems(parsed.line_items);

    return NextResponse.json({
      data: {
        vendor_name: parsed.vendor_name?.trim() || null,
        amount_cents,
        expense_date,
        category,
        notes: parsed.notes?.trim() || null,
        line_items,
      },
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ai-fsm/web exec vitest run app/api/v1/expenses/__tests__/scan-receipt.unit.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/expenses/scan-receipt/route.ts apps/web/app/api/v1/expenses/__tests__/scan-receipt.unit.test.ts
git commit -m "feat(expenses): itemize on scan — one AI call for totals + line items"
```

---

### Task 4: Save scanned line items when creating an expense

**Files:**
- Modify: `apps/web/app/app/expenses/new/ExpenseForm.tsx`

**Interfaces:**
- Consumes: `PUT /api/v1/expenses/[id]/line-items` (Task 2), the `line_items` field now returned by `POST /api/v1/expenses/scan-receipt` (Task 3).
- Produces: no new exports — internal wiring only.

- [ ] **Step 1: Add a ref to hold scanned line items**

In `apps/web/app/app/expenses/new/ExpenseForm.tsx`, add near the other refs (after `formOpenedAtRef`, around line 47):

```tsx
  // Line items returned by the AI scan, saved after the expense is created.
  const scannedLineItemsRef = useRef<
    { name: string; quantity: number; unit_cost_cents: number; sku?: string | null }[]
  >([]);
```

- [ ] **Step 2: Capture line items from the scan response**

In `handleScanReceipt`, change:

```ts
      const { vendor_name, amount_cents, expense_date, category: cat, notes: n } = data.data;
```

to:

```ts
      const { vendor_name, amount_cents, expense_date, category: cat, notes: n, line_items } = data.data;
      scannedLineItemsRef.current = Array.isArray(line_items) ? line_items : [];
```

- [ ] **Step 3: Save line items after the expense is created**

In `handleSubmit`, after the existing receipt-photo upload block (after the `if (expenseId && selectedReceiptFile) { ... }` block, before the `if (isMaterialRun) { ... }` block), add:

```tsx
      if (expenseId && scannedLineItemsRef.current.length > 0) {
        await fetch(`/api/v1/expenses/${expenseId}/line-items`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ line_items: scannedLineItemsRef.current }),
        }).catch(() => null);
      }
```

This is best-effort by design, matching the file's existing pattern for the material-run activity log a few lines below — a save that fails here must not block the expense from being created.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @ai-fsm/web typecheck`
Expected: no new type errors.

Run: `pnpm --filter @ai-fsm/web lint`
Expected: no new lint errors.

This file has no existing test coverage convention (no `.test.tsx` files in this codebase — see Global Constraints); typecheck + lint is the verification for this task, and Task 8 covers manual browser QA of the full flow.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/app/expenses/new/ExpenseForm.tsx
git commit -m "feat(expenses): save AI-scanned line items on expense create"
```

---

### Task 5: Itemized line-item editor on the expense detail page

**Files:**
- Create: `apps/web/app/app/expenses/[id]/ExpenseLineItemsEditor.tsx`
- Modify: `apps/web/app/app/expenses/[id]/page.tsx`

**Interfaces:**
- Consumes: `fetchExpenseLineItems(client, accountId, expenseId)` (already exported from `@/lib/expenses/line-items`, already imported by `job-expenses.ts` — import fresh in `page.tsx`), `PUT /api/v1/expenses/[id]/line-items` (Task 2).
- Produces: `ExpenseLineItemsEditor` component, props `{ expenseId: string; initialLineItems: ExpenseLineItemDraft[]; billed: boolean; canEdit: boolean }`. No other task consumes this — it's the terminal UI for Task 2's endpoint.

- [ ] **Step 1: Create the editor component**

Create `apps/web/app/app/expenses/[id]/ExpenseLineItemsEditor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { formatCents } from "@ai-fsm/money";

export interface ExpenseLineItemDraft {
  id?: string;
  name: string;
  quantity: number;
  unit_cost_cents: number;
  sku: string | null;
}

interface Props {
  expenseId: string;
  initialLineItems: ExpenseLineItemDraft[];
  billed: boolean;
  canEdit: boolean;
}

export function ExpenseLineItemsEditor({ expenseId, initialLineItems, billed, canEdit }: Props) {
  const [items, setItems] = useState<ExpenseLineItemDraft[]>(initialLineItems);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function updateItem(index: number, patch: Partial<ExpenseLineItemDraft>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    setSaved(false);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setSaved(false);
  }

  function addItem() {
    setItems((prev) => [...prev, { name: "", quantity: 1, unit_cost_cents: 0, sku: null }]);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/expenses/${expenseId}/line-items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_items: items
            .filter((item) => item.name.trim().length > 0)
            .map((item) => ({
              name: item.name.trim(),
              quantity: item.quantity,
              unit_cost_cents: item.unit_cost_cents,
              sku: item.sku,
            })),
        }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to save line items.");
        return;
      }
      setSaved(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (items.length === 0 && (billed || !canEdit)) {
    return (
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)", fontStyle: "italic" }}>
        No itemized line items for this receipt.
      </p>
    );
  }

  if (billed) {
    return (
      <div>
        <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
          This receipt is on an invoice — line items are locked. Edit the invoice to change amounts.
        </p>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {items.map((item, i) => (
            <li
              key={item.id ?? i}
              style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-1) 0", fontSize: "var(--text-sm)" }}
            >
              <span>{item.name} × {item.quantity}</span>
              <span>{formatCents(item.quantity * item.unit_cost_cents)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "var(--space-2)" }}>
        {items.map((item, i) => (
          <li key={item.id ?? i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
            <div style={{ flex: 2 }}>
              <Input
                id={`line-item-name-${i}`}
                label={i === 0 ? "Item" : undefined}
                value={item.name}
                onChange={(e) => updateItem(i, { name: e.target.value })}
                disabled={!canEdit || saving}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Input
                id={`line-item-qty-${i}`}
                label={i === 0 ? "Qty" : undefined}
                type="number"
                min="0.01"
                step="0.01"
                value={String(item.quantity)}
                onChange={(e) => updateItem(i, { quantity: parseFloat(e.target.value) || 0 })}
                disabled={!canEdit || saving}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Input
                id={`line-item-cost-${i}`}
                label={i === 0 ? "Unit Cost ($)" : undefined}
                type="number"
                min="0"
                step="0.01"
                value={(item.unit_cost_cents / 100).toFixed(2)}
                onChange={(e) =>
                  updateItem(i, { unit_cost_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                }
                disabled={!canEdit || saving}
              />
            </div>
            {canEdit && (
              <Button variant="ghost" size="sm" onClick={() => removeItem(i)} disabled={saving}>
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", alignItems: "center" }}>
          <Button variant="ghost" size="sm" onClick={addItem} disabled={saving}>
            + Add line
          </Button>
          <Button variant="secondary" size="sm" onClick={save} loading={saving}>
            Save line items
          </Button>
          {saved && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-success, green)" }}>Saved</span>}
        </div>
      )}

      {error && (
        <p role="alert" style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-sm)", color: "var(--color-error, red)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Fetch line items + billed status and render the editor on the expense detail page**

In `apps/web/app/app/expenses/[id]/page.tsx`, add imports:

```tsx
import { fetchExpenseLineItems } from "@/lib/expenses/line-items";
import { ExpenseLineItemsEditor } from "./ExpenseLineItemsEditor";
```

After the existing `if (!expense) notFound();` line, add:

```tsx
  const { lineItems, lineItemsBilled } = await withExpenseContext(session, async (client) => {
    const items = await fetchExpenseLineItems(client, session.accountId, id);
    const billed = await client.query(
      `SELECT 1 AS exists FROM invoice_line_items WHERE source_expense_id = $1 LIMIT 1`,
      [id],
    );
    return { lineItems: items, lineItemsBilled: (billed.rowCount ?? 0) > 0 };
  });
```

(This requires importing `withExpenseContext` from `@/lib/expenses/db` — it's already imported at the top of this file for the `expense` fetch, so no new import needed there.)

In the JSX, inside `<div className="p7-detail-primary">`, after the existing "Expense Details" `<Card>` closes (right after `</Card>` that follows the `<dl className="p7-detail-list">` block, still inside `p7-detail-primary`), add:

```tsx
          <Card>
            <SectionHeader title="Line Items" />
            <ExpenseLineItemsEditor
              expenseId={expense.id}
              initialLineItems={lineItems}
              billed={lineItemsBilled}
              canEdit={canManage}
            />
          </Card>
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @ai-fsm/web typecheck`
Expected: no new type errors. (`ExpenseLineItemRow[]` from `fetchExpenseLineItems` structurally satisfies `ExpenseLineItemDraft[]` — it has all required fields plus extras, which TypeScript allows for non-literal assignment.)

Run: `pnpm --filter @ai-fsm/web lint`
Expected: no new lint errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/app/expenses/[id]/ExpenseLineItemsEditor.tsx apps/web/app/app/expenses/[id]/page.tsx
git commit -m "feat(expenses): itemized line-item editor on expense detail page"
```

---

### Task 6: `JobMaterialsPanel` component

**Files:**
- Create: `apps/web/app/app/jobs/[id]/JobMaterialsPanel.tsx`

**Interfaces:**
- Consumes: `JobMaterialExpenseWithLines` type (Task 1, from `@/lib/invoices/job-expenses`), `formatCents` (from `@ai-fsm/money`), `formatLineQuantityDisplay` (from `@/lib/invoices/quantity`).
- Produces: `export function JobMaterialsPanel({ expenses }: { expenses: JobMaterialExpenseWithLines[] })`. Task 7 renders this inside the job page.

- [ ] **Step 1: Create the component**

Create `apps/web/app/app/jobs/[id]/JobMaterialsPanel.tsx`:

```tsx
import Link from "next/link";
import type { Route } from "next";
import { formatCents } from "@ai-fsm/money";
import { formatLineQuantityDisplay } from "@/lib/invoices/quantity";
import type { JobMaterialExpenseWithLines } from "@/lib/invoices/job-expenses";

interface Props {
  expenses: JobMaterialExpenseWithLines[];
}

export function JobMaterialsPanel({ expenses }: Props) {
  if (expenses.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)", fontStyle: "italic" }}>
        No receipts linked to this job yet.
      </p>
    );
  }

  const unbilledTotalCents = expenses
    .filter((e) => !e.billed)
    .reduce((sum, e) => sum + e.amount_cents, 0);

  return (
    <div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "var(--space-3)" }}>
        {expenses.map((expense) => (
          <li
            key={expense.id}
            style={{ paddingBottom: "var(--space-2)", borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-2)" }}>
              <Link
                href={`/app/expenses/${expense.id}` as Route}
                style={{ fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}
              >
                {expense.vendor_name}
              </Link>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                {formatCents(expense.amount_cents)}
              </span>
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: "2px" }}>
              {expense.expense_date.slice(0, 10)}
              {" · "}
              <span style={{ color: expense.billed ? "var(--color-success, #16a34a)" : "var(--fg-muted)" }}>
                {expense.billed ? "Billed" : "Not yet billed"}
              </span>
            </div>
            {expense.line_items.length > 0 ? (
              <ul style={{ margin: "6px 0 0", paddingLeft: "1rem", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                {expense.line_items.map((li) => (
                  <li key={li.id}>
                    {li.name} · {formatLineQuantityDisplay(li.quantity)} × {formatCents(li.unit_cost_cents)} ={" "}
                    {formatCents(li.line_total_cents)}
                  </li>
                ))}
              </ul>
            ) : (
              expense.notes && (
                <p style={{ margin: "4px 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                  {expense.notes}
                </p>
              )
            )}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)", fontWeight: 600, textAlign: "right" }}>
        Unbilled total: {formatCents(unbilledTotalCents)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @ai-fsm/web typecheck`
Expected: no new type errors. (This task alone will show an "unused export" only if Task 7 hasn't run yet — that's expected at this point in sequence; typecheck itself will still pass since the file is self-contained.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/app/jobs/[id]/JobMaterialsPanel.tsx
git commit -m "feat(jobs): add JobMaterialsPanel component"
```

---

### Task 7: Wire the Materials panel and margin fix into the job page

**Files:**
- Modify: `apps/web/app/app/jobs/[id]/page.tsx`

**Interfaces:**
- Consumes: `fetchJobMaterialExpenses`, `type JobMaterialExpenseWithLines` (Task 1), `JobMaterialsPanel` (Task 6), `withExpenseContext` (from `@/lib/expenses/db`).
- Produces: none — this is the final integration point for this feature.

- [ ] **Step 1: Add imports**

In `apps/web/app/app/jobs/[id]/page.tsx`, add:

```tsx
import { fetchJobMaterialExpenses, type JobMaterialExpenseWithLines } from "@/lib/invoices/job-expenses";
import { withExpenseContext } from "@/lib/expenses/db";
import { JobMaterialsPanel } from "./JobMaterialsPanel";
```

- [ ] **Step 2: Fetch job material expenses alongside the existing Promise.all**

Change the destructure on line 178 from:

```ts
  const [visits, workOrders, commercialCounts, assetLinks] = await Promise.all([
```

to:

```ts
  const [visits, workOrders, commercialCounts, assetLinks, jobMaterialExpenses] = await Promise.all([
```

Add a 5th entry to the array, after the existing `assetLinks` entry (`withAssetContext(session, (client) => listAssetLinks(session.accountId, "job", id)).catch(() => [])`) and before the closing `]);` of the `Promise.all` call:

```ts
    session.role !== "tech"
      ? withExpenseContext(session, (client) => fetchJobMaterialExpenses(client, session.accountId, id))
          .catch(() => [] as JobMaterialExpenseWithLines[])
      : Promise.resolve([] as JobMaterialExpenseWithLines[]),
```

- [ ] **Step 3: Add the materials-receipt cost line to the profitability calc**

Change:

```ts
  // Profitability (owner/admin only)
  // actual_cost_cents on jobs is maintained as the parts rollup by visit-parts write paths.
  const revenueCents = commercialCounts?.invoice_total_cents ?? commercialCounts?.estimated_total_cents ?? null;
  const partsCostCents = commercialCounts?.parts_cost_cents ?? 0;
  const estimatedLaborCents = commercialCounts?.estimated_labor_cost_cents ?? null;
  const costCents =
    estimatedLaborCents !== null || partsCostCents > 0
      ? (estimatedLaborCents ?? 0) + partsCostCents
      : null;
```

to:

```ts
  // Profitability (owner/admin only)
  // actual_cost_cents on jobs is maintained as the parts rollup by visit-parts write paths.
  // materialsReceiptCostCents is a second, additive cost source from linked receipts.
  const revenueCents = commercialCounts?.invoice_total_cents ?? commercialCounts?.estimated_total_cents ?? null;
  const partsCostCents = commercialCounts?.parts_cost_cents ?? 0;
  const materialsReceiptCostCents = jobMaterialExpenses.reduce((sum, e) => sum + e.amount_cents, 0);
  const estimatedLaborCents = commercialCounts?.estimated_labor_cost_cents ?? null;
  const costCents =
    estimatedLaborCents !== null || partsCostCents > 0 || materialsReceiptCostCents > 0
      ? (estimatedLaborCents ?? 0) + partsCostCents + materialsReceiptCostCents
      : null;
```

(`grossMarginCents` and `grossMarginPct` below this block are unchanged — they already derive from `costCents`.)

- [ ] **Step 4: Render the Materials panel next to the Forgotten Receipts panel**

Change:

```tsx
          {canLinkExpenses && (
            <LinkForgottenExpensesPanel mode="job" jobId={job.id} />
          )}
```

to:

```tsx
          {canLinkExpenses && (
            <LinkForgottenExpensesPanel mode="job" jobId={job.id} />
          )}
          {!isTech && jobMaterialExpenses.length > 0 && (
            <Card data-testid="job-materials-panel">
              <SectionHeader title="Materials" count={jobMaterialExpenses.length} />
              <JobMaterialsPanel expenses={jobMaterialExpenses} />
            </Card>
          )}
```

- [ ] **Step 5: Add the "Materials (receipts)" row to the Profitability card**

Change:

```tsx
                  {partsCostCents > 0 && (
                    <div className="p7-detail-row">
                      <dt>Parts Cost</dt>
                      <dd>${(partsCostCents / 100).toFixed(2)}</dd>
                    </div>
                  )}
                  {costCents !== null && estimatedLaborCents !== null && partsCostCents > 0 && (
                    <div className="p7-detail-row" style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-1)" }}>
                      <dt>Total Cost</dt>
                      <dd>${(costCents / 100).toFixed(2)}</dd>
                    </div>
                  )}
```

to:

```tsx
                  {partsCostCents > 0 && (
                    <div className="p7-detail-row">
                      <dt>Parts Cost</dt>
                      <dd>${(partsCostCents / 100).toFixed(2)}</dd>
                    </div>
                  )}
                  {materialsReceiptCostCents > 0 && (
                    <div className="p7-detail-row">
                      <dt>Materials (receipts)</dt>
                      <dd>${(materialsReceiptCostCents / 100).toFixed(2)}</dd>
                    </div>
                  )}
                  {costCents !== null &&
                    estimatedLaborCents !== null &&
                    (partsCostCents > 0 || materialsReceiptCostCents > 0) && (
                      <div className="p7-detail-row" style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-1)" }}>
                        <dt>Total Cost</dt>
                        <dd>${(costCents / 100).toFixed(2)}</dd>
                      </div>
                    )}
```

And change the "no data" fallback a few lines below:

```tsx
                  {estimatedLaborCents === null && !partsCostCents && (
```

to:

```tsx
                  {estimatedLaborCents === null && !partsCostCents && !materialsReceiptCostCents && (
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter @ai-fsm/web typecheck`
Expected: no new type errors.

Run: `pnpm --filter @ai-fsm/web lint`
Expected: no new lint errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/app/jobs/[id]/page.tsx
git commit -m "feat(jobs): show linked receipts on job page, fold into margin"
```

---

### Task 8: Full gate + manual verification

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Run the fast gate**

Run: `pnpm gate:fast`
Expected: lint, typecheck, build, and unit tests all pass, including the three new test files from Tasks 1-3.

- [ ] **Step 2: Manual browser QA**

Per project convention (`CLAUDE.md`: "For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete"), start the dev server and walk through:

1. Create a job and a client with an existing relationship (or use seeded dev data).
2. Go to "New Expense" (or the material-run form), category `materials`, scan a real or test receipt photo, pick the job and client, save. Confirm the created expense shows itemized line items on `/app/expenses/[id]`.
3. Open the job page (`/app/jobs/[id]`). Confirm a "Materials" card appears showing the linked receipt, itemized, marked "Not yet billed", and the Profitability card shows a new "Materials (receipts)" row with correct total and margin.
4. On `/app/expenses/[id]`, edit a line item (fix a quantity), save, and confirm it persists on reload and that the job page's material cost total updates to match.
5. Create an invoice from the job that pulls in materials (existing flow) and confirm: the expense's line-item editor now shows read-only "billed" state, and the job page's badge for that receipt flips to "Billed".

Run: `pnpm test:unit`
Expected: PASS (already covered by `gate:fast`, listed separately here as the concrete pass/fail check for this task).

- [ ] **Step 3: Commit (if manual QA surfaced fixes)**

If Step 2 required any fixes, commit them with a descriptive message. If no fixes were needed, this step is a no-op — nothing to commit.
