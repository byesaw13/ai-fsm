# Ponytail Leftover Cuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish three pure-cleanup leftovers from the invoice materials / documents work: delete dead `@ai-fsm/log` subpaths, parameterize document location SQL fragments, and unify twin `LinkForgottenExpensesPanel` UIs.

**Architecture:** Three independent cuts in one PR, in risk order: (1) log package delete, (2) `documentJoins` + `DOCUMENT_LOCATION_SELECT` replace four constants, (3) one shared client panel with `mode: "invoice" | "job"`. No API merges, no behavior changes.

**Tech Stack:** TypeScript, Next.js App Router (apps/web), pnpm workspace package `@ai-fsm/log`, vitest, Docker (worker image).

**Spec:** `docs/superpowers/specs/2026-07-09-ponytail-leftover-cuts-design.md`

---

## File map

| Path | Action | Responsibility |
|------|--------|----------------|
| `packages/log/src/web.ts` | Delete | Dead pre-bound logger |
| `packages/log/src/worker.ts` | Delete | Dead pre-bound logger |
| `packages/log/src/mcp.ts` | Delete | Dead pre-bound logger |
| `packages/log/package.json` | Modify | Drop `./web`, `./worker`, `./mcp` exports |
| `services/worker/Dockerfile` | Modify | Drop sed rewrites for those subpaths |
| `apps/web/lib/documents/service-location.ts` | Modify | `DOCUMENT_LOCATION_SELECT` + `documentJoins` |
| `apps/web/lib/documents/__tests__/service-location.unit.test.ts` | Create | Unit tests for join builder + location resolve |
| `apps/web/lib/pdf/load.ts` | Modify | Import new symbols |
| `apps/web/app/app/invoices/[id]/page.tsx` | Modify | SQL imports + panel import |
| `apps/web/app/app/invoices/[id]/print/page.tsx` | Modify | SQL imports |
| `apps/web/components/invoices/LinkForgottenExpensesPanel.tsx` | Create | Shared panel |
| `apps/web/app/app/invoices/[id]/LinkForgottenExpensesPanel.tsx` | Delete | Twin |
| `apps/web/app/app/jobs/[id]/LinkForgottenExpensesPanel.tsx` | Delete | Twin |
| `apps/web/app/app/jobs/[id]/page.tsx` | Modify | Shared panel import + props |

**Unchanged (do not touch):** API routes under `linkable-expenses` / `link-expenses`; `apps/web/lib/logger.ts`; worker/mcp logger wrappers; business rules for linking.

---

### Task 1: Delete dead `@ai-fsm/log` subpaths

**Files:**
- Delete: `packages/log/src/web.ts`
- Delete: `packages/log/src/worker.ts`
- Delete: `packages/log/src/mcp.ts`
- Modify: `packages/log/package.json`
- Modify: `services/worker/Dockerfile`
- Keep: `packages/log/src/index.ts`, app logger wrappers

- [ ] **Step 1: Confirm nothing imports subpaths**

```bash
cd /home/nick/ai-fsm-deploy-clean
grep -R --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' -n '@ai-fsm/log/web\|@ai-fsm/log/worker\|@ai-fsm/log/mcp' . || true
```

Expected: no matches (or only this plan/spec).

- [ ] **Step 2: Rewrite `packages/log/package.json` exports to root only**

Replace the entire `exports` block with:

```json
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
```

Keep `main` and `types` pointing at `src/index.ts`.

- [ ] **Step 3: Delete the three entry files**

```bash
rm packages/log/src/web.ts packages/log/src/worker.ts packages/log/src/mcp.ts
```

- [ ] **Step 4: Simplify worker Dockerfile sed**

In `services/worker/Dockerfile`, replace the dual sed block that rewrites subpaths with the original-style main/types only rewrite:

```dockerfile
# Workspace packages point main at src/ for dev; production runs compiled dist/.
RUN sed -i 's|"main": "src/index.ts"|"main": "dist/index.js"|' \
      packages/log/package.json \
      packages/money/package.json \
      packages/email-templates/package.json \
 && sed -i 's|"types": "src/index.ts"|"types": "dist/index.d.ts"|' \
      packages/log/package.json \
      packages/money/package.json \
      packages/email-templates/package.json \
 && sed -i 's|"./src/index.ts"|"./dist/index.js"|g' \
      packages/log/package.json \
 && mkdir -p node_modules/@ai-fsm \
 && ln -s ../../packages/log node_modules/@ai-fsm/log \
 && ln -s ../../packages/money node_modules/@ai-fsm/money \
 && ln -s ../../packages/email-templates node_modules/@ai-fsm/email-templates
```

Remove the multi `-e` sed that rewrote `./src/web.ts`, `./src/worker.ts`, `./src/mcp.ts`.

If root `exports["."]` uses `./src/index.ts`, the single `s|"./src/index.ts"|"./dist/index.js"|g` line keeps production correct.

- [ ] **Step 5: Verify log package tests still pass**

```bash
cd /home/nick/ai-fsm-deploy-clean
pnpm --filter @ai-fsm/log test
```

Expected: all tests PASS (they only use `createLogger` from `./index.js`).

- [ ] **Step 6: Commit**

```bash
git add packages/log/package.json packages/log/src services/worker/Dockerfile
git status   # confirm web.ts worker.ts mcp.ts deleted
git commit -m "$(cat <<'EOF'
chore(log): drop unused @ai-fsm/log subpath exports

Apps already wrap createLogger locally; web/worker/mcp entry points
were never imported. Simplify worker Dockerfile path rewrite.
EOF
)"
```

---

### Task 2: Parameterize document SQL fragments

**Files:**
- Modify: `apps/web/lib/documents/service-location.ts`
- Create: `apps/web/lib/documents/__tests__/service-location.unit.test.ts`
- Modify: `apps/web/lib/pdf/load.ts`
- Modify: `apps/web/app/app/invoices/[id]/page.tsx`
- Modify: `apps/web/app/app/invoices/[id]/print/page.tsx`

- [ ] **Step 1: Write failing unit tests for join builder + location helpers**

Create `apps/web/lib/documents/__tests__/service-location.unit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  formatAddressLine,
  resolveServiceLocation,
  documentJoins,
  DOCUMENT_LOCATION_SELECT,
} from "../service-location";

describe("formatAddressLine / resolveServiceLocation", () => {
  it("formats street, city/state, zip", () => {
    expect(formatAddressLine("1 Main St", "Nashua", "NH", "03060")).toBe(
      "1 Main St, Nashua, NH, 03060",
    );
  });

  it("prefers property over client address", () => {
    expect(
      resolveServiceLocation({
        property_address: "9 Oak",
        property_city: "Salem",
        property_state: "NH",
        property_zip: "03079",
        client_address_line1: "billing only",
        client_city: "X",
        client_state: "MA",
        client_zip: "02108",
      }),
    ).toBe("9 Oak, Salem, NH, 03079");
  });

  it("falls back to client then placeholder", () => {
    expect(
      resolveServiceLocation({
        client_address_line1: "2 Elm",
        client_city: "Boston",
        client_state: "MA",
        client_zip: "02108",
      }),
    ).toBe("2 Elm, Boston, MA, 02108");
    expect(resolveServiceLocation({})).toBe("Address not on file");
  });
});

describe("documentJoins", () => {
  it("invoice joins include estimate property coalesce", () => {
    const sql = documentJoins({ root: "i", includeEstimateProperty: true });
    expect(sql).toContain("JOIN clients c ON c.id = i.client_id");
    expect(sql).toContain("LEFT JOIN jobs j ON j.id = i.job_id");
    expect(sql).toContain("LEFT JOIN estimates e ON e.id = i.estimate_id");
    expect(sql).toContain("i.property_id");
    expect(sql).toContain("e.property_id");
    expect(sql).toContain("i.account_id");
    expect(sql).not.toContain("e.account_id");
  });

  it("estimate joins omit estimate self-join and use e.account_id", () => {
    const sql = documentJoins({ root: "e" });
    expect(sql).toContain("JOIN clients c ON c.id = e.client_id");
    expect(sql).toContain("LEFT JOIN jobs j ON j.id = e.job_id");
    expect(sql).not.toMatch(/LEFT JOIN estimates e ON/);
    expect(sql).toContain("e.property_id");
    expect(sql).toContain("e.account_id");
    expect(sql).not.toContain("i.account_id");
  });

  it("location select lists client and property columns once", () => {
    expect(DOCUMENT_LOCATION_SELECT).toContain("c.name AS client_name");
    expect(DOCUMENT_LOCATION_SELECT).toContain("p.address AS property_address");
    expect(DOCUMENT_LOCATION_SELECT).toContain("c.address_line1 AS client_address_line1");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (exports missing)**

```bash
cd /home/nick/ai-fsm-deploy-clean/apps/web
pnpm exec vitest run lib/documents/__tests__/service-location.unit.test.ts
```

Expected: FAIL — `documentJoins` / `DOCUMENT_LOCATION_SELECT` not exported.

- [ ] **Step 3: Implement `service-location.ts`**

Replace the four constants and private subqueries (lines 46–103 today) with:

```ts
/** Client + property columns for document letterhead / PDF loaders. */
export const DOCUMENT_LOCATION_SELECT = `
  c.name AS client_name,
  c.email AS client_email,
  c.phone AS client_phone,
  c.address_line1 AS client_address_line1,
  c.city AS client_city,
  c.state AS client_state,
  c.zip AS client_zip,
  p.address AS property_address,
  p.city AS property_city,
  p.state AS property_state,
  p.zip AS property_zip
`;

/**
 * Join chain from document root → client → job → optional estimate → property.
 * root "i" = invoices alias; root "e" = estimates alias.
 */
export function documentJoins(opts: {
  root: "i" | "e";
  /** When true (invoices), also COALESCE property via linked estimate. */
  includeEstimateProperty?: boolean;
}): string {
  const { root, includeEstimateProperty = false } = opts;
  const clientFirstProperty = `(
  SELECT p2.id
  FROM properties p2
  WHERE p2.client_id = c.id AND p2.account_id = ${root}.account_id
  ORDER BY p2.created_at ASC
  LIMIT 1
)`;

  const estimateJoin =
    includeEstimateProperty && root === "i"
      ? `\n  LEFT JOIN estimates e ON e.id = i.estimate_id`
      : "";

  const coalesceParts = includeEstimateProperty && root === "i"
    ? `${root}.property_id, j.property_id, e.property_id, ${clientFirstProperty}`
    : `${root}.property_id, j.property_id, ${clientFirstProperty}`;

  return `
  JOIN clients c ON c.id = ${root}.client_id
  LEFT JOIN jobs j ON j.id = ${root}.job_id${estimateJoin}
  LEFT JOIN properties p ON p.id = COALESCE(${coalesceParts})
`;
}
```

Keep `LocationFields`, `formatAddressLine`, and `resolveServiceLocation` unchanged above this block.

**Do not** re-export `INVOICE_DOCUMENT_JOINS` etc.

- [ ] **Step 4: Run unit tests — expect PASS**

```bash
cd /home/nick/ai-fsm-deploy-clean/apps/web
pnpm exec vitest run lib/documents/__tests__/service-location.unit.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Update `apps/web/lib/pdf/load.ts` imports and usages**

Replace import:

```ts
import {
  DOCUMENT_LOCATION_SELECT,
  documentJoins,
  resolveServiceLocation,
} from "@/lib/documents/service-location";
```

Invoice query:

```ts
            ${DOCUMENT_LOCATION_SELECT}
     FROM invoices i
     JOIN accounts a ON a.id = i.account_id
     ${documentJoins({ root: "i", includeEstimateProperty: true })}
```

Estimate query:

```ts
            ${DOCUMENT_LOCATION_SELECT}
     FROM estimates e
     JOIN accounts a ON a.id = e.account_id
     ${documentJoins({ root: "e" })}
```

(Keep existing `accounts` join / select columns as they are today.)

- [ ] **Step 6: Update invoice detail + print pages**

In `apps/web/app/app/invoices/[id]/page.tsx`:

```ts
import {
  DOCUMENT_LOCATION_SELECT,
  documentJoins,
  resolveServiceLocation,
} from "@/lib/documents/service-location";
```

In the SELECT string:

```ts
              ${DOCUMENT_LOCATION_SELECT}
       FROM invoices i
       ${documentJoins({ root: "i", includeEstimateProperty: true })}
```

Same pattern in `apps/web/app/app/invoices/[id]/print/page.tsx`.

- [ ] **Step 7: Grep for old constant names — must be empty**

```bash
cd /home/nick/ai-fsm-deploy-clean
grep -R --include='*.ts' --include='*.tsx' -n 'INVOICE_DOCUMENT_JOINS\|ESTIMATE_DOCUMENT_JOINS\|INVOICE_LOCATION_SELECT\|ESTIMATE_LOCATION_SELECT' apps/web || true
```

Expected: no matches outside docs if any.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/documents/service-location.ts \
  apps/web/lib/documents/__tests__/service-location.unit.test.ts \
  apps/web/lib/pdf/load.ts \
  apps/web/app/app/invoices/\[id\]/page.tsx \
  apps/web/app/app/invoices/\[id\]/print/page.tsx
git commit -m "$(cat <<'EOF'
refactor(documents): parameterize invoice/estimate location SQL joins

Replace four near-duplicate constants with DOCUMENT_LOCATION_SELECT
and documentJoins({ root, includeEstimateProperty }).
EOF
)"
```

---

### Task 3: Shared LinkForgottenExpensesPanel

**Files:**
- Create: `apps/web/components/invoices/LinkForgottenExpensesPanel.tsx`
- Modify: `apps/web/app/app/invoices/[id]/page.tsx` (import + props)
- Modify: `apps/web/app/app/jobs/[id]/page.tsx` (import + props)
- Delete: `apps/web/app/app/invoices/[id]/LinkForgottenExpensesPanel.tsx`
- Delete: `apps/web/app/app/jobs/[id]/LinkForgottenExpensesPanel.tsx`

- [ ] **Step 1: Create shared component**

Create `apps/web/components/invoices/LinkForgottenExpensesPanel.tsx` with the full implementation below (preserves behavior matrix from the spec).

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@ai-fsm/money";
import {
  materialExpenseDescription,
  materialHandlingCents,
  materialInvoiceTotalCents,
  type LinkableMaterialExpense,
} from "@/lib/invoices/job-expenses-format";
import { formatLineQuantityDisplay } from "@/lib/invoices/quantity";

export type LinkForgottenExpensesMode = "invoice" | "job";

export interface LinkForgottenExpensesPanelProps {
  mode: LinkForgottenExpensesMode;
  jobId: string;
  /** Required when mode === "invoice" */
  invoiceId?: string;
  /** Invoice mode only */
  handlingPct?: number;
}

export function LinkForgottenExpensesPanel({
  mode,
  jobId,
  invoiceId,
  handlingPct = 15,
}: LinkForgottenExpensesPanelProps) {
  if (mode === "invoice" && !invoiceId) {
    throw new Error("LinkForgottenExpensesPanel: invoiceId required when mode=invoice");
  }

  const isInvoice = mode === "invoice";
  const handlingRate = handlingPct / 100;
  const router = useRouter();
  const [expenses, setExpenses] = useState<LinkableMaterialExpense[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(!isInvoice);
  const [success, setSuccess] = useState("");

  const listUrl = isInvoice
    ? `/api/v1/invoices/${invoiceId}/linkable-expenses`
    : `/api/v1/jobs/${jobId}/linkable-expenses`;
  const linkUrl = isInvoice
    ? `/api/v1/invoices/${invoiceId}/link-expenses`
    : `/api/v1/jobs/${jobId}/link-expenses`;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(listUrl);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExpenses([]);
        if (isInvoice) {
          setError(json.error?.message ?? "Could not load forgotten receipts");
        }
        return;
      }
      const rows = (json.data?.expenses ?? []) as LinkableMaterialExpense[];
      setExpenses(rows);
      if (isInvoice && rows.length > 0) setExpanded(true);
    } catch {
      setError(isInvoice ? "Network error loading receipts" : "Could not load unlinked receipts");
    } finally {
      setLoading(false);
    }
  }, [listUrl, isInvoice]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function linkSelected() {
    if (selected.size === 0) return;
    setPending(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(linkUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expense_ids: [...selected] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to link receipts");
        return;
      }
      if (!isInvoice) {
        const count = (json.data?.linked ?? []).length;
        setSuccess(`${count} receipt${count === 1 ? "" : "s"} linked to this job.`);
      }
      setSelected(new Set());
      router.refresh();
      await load();
    } catch {
      setError("Network error while linking receipts");
    } finally {
      setPending(false);
    }
  }

  if (loading) return null;
  if (expenses.length === 0 && !error) return null;
  if (!isInvoice && expenses.length === 0) return null;

  const testId = isInvoice ? "link-forgotten-expenses-panel" : "job-link-forgotten-expenses";
  const ctaLabel = pending
    ? "Linking…"
    : isInvoice
      ? `Link & add to invoice (${selected.size})`
      : `Link to job (${selected.size})`;

  const body = (
    <>
      <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
        {isInvoice ? (
          <>
            Material runs logged without a project appear here. Select receipts to attach to{" "}
            <code style={{ fontSize: "11px" }}>{jobId.slice(0, 8)}…</code> and add billable lines.
          </>
        ) : (
          <>Unlinked material expenses for this client — attach before invoicing.</>
        )}
      </p>

      {error && (
        <div
          role="alert"
          style={{
            padding: "var(--space-2)",
            marginBottom: "var(--space-2)",
            fontSize: "var(--text-sm)",
            color: "var(--color-danger)",
            background: "var(--color-red-50)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          {error}
        </div>
      )}
      {!isInvoice && success && (
        <div
          role="status"
          style={{
            padding: "var(--space-2)",
            marginBottom: "var(--space-2)",
            fontSize: "var(--text-sm)",
            color: "var(--color-green-700)",
            background: "var(--bg-subtle)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          {success}
        </div>
      )}

      {expenses.length === 0 ? (
        isInvoice ? (
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            No unlinked material receipts match this client.
          </p>
        ) : null
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-2)" }}>
          {expenses.map((expense) => {
            if (isInvoice) {
              const skuLines = expense.line_items ?? [];
              const materialCost =
                skuLines.length > 0
                  ? skuLines.reduce((s, li) => s + li.line_total_cents, 0)
                  : expense.amount_cents;
              const billCents = materialInvoiceTotalCents(materialCost, handlingRate);
              const label = materialExpenseDescription(expense);
              return (
                <li key={expense.id}>
                  <label
                    style={{
                      display: "flex",
                      gap: "var(--space-2)",
                      alignItems: "flex-start",
                      fontSize: "var(--text-sm)",
                      cursor: pending ? "not-allowed" : "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(expense.id)}
                      onChange={() => toggle(expense.id)}
                      disabled={pending}
                      style={{ marginTop: 3 }}
                    />
                    <span style={{ flex: 1 }}>
                      <strong>{expense.vendor_name}</strong>
                      <span style={{ color: "var(--fg-muted)" }}>
                        {" "}
                        · {expense.expense_date.slice(0, 10)} · materials {formatCents(materialCost)}
                        {materialHandlingCents(materialCost, handlingRate) > 0 &&
                          ` + handling ${formatCents(materialHandlingCents(materialCost, handlingRate))}`}{" "}
                        = {formatCents(billCents)}
                      </span>
                      {skuLines.length > 0 ? (
                        <ul
                          style={{
                            margin: "4px 0 0",
                            paddingLeft: "1rem",
                            color: "var(--fg-muted)",
                            fontSize: "var(--text-xs)",
                          }}
                        >
                          {skuLines.map((li) => (
                            <li key={li.id}>
                              {li.name} · {formatLineQuantityDisplay(li.quantity)} ×{" "}
                              {formatCents(li.unit_cost_cents)} = {formatCents(li.line_total_cents)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        label !== `Materials — ${expense.vendor_name}` && (
                          <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>{label}</div>
                        )
                      )}
                    </span>
                  </label>
                </li>
              );
            }

            return (
              <li key={expense.id}>
                <label
                  style={{
                    display: "flex",
                    gap: "var(--space-2)",
                    fontSize: "var(--text-sm)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(expense.id)}
                    onChange={() => toggle(expense.id)}
                    disabled={pending}
                  />
                  <span>
                    <strong>{expense.vendor_name}</strong>
                    <span style={{ color: "var(--fg-muted)" }}>
                      {" "}
                      · {expense.expense_date.slice(0, 10)} · {formatCents(expense.amount_cents)}
                    </span>
                    <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                      {materialExpenseDescription(expense)}
                    </div>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {expenses.length > 0 && (
        <div
          style={{
            marginTop: "var(--space-3)",
            display: "flex",
            gap: "var(--space-2)",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => void linkSelected()}
            disabled={pending || selected.size === 0}
            className={isInvoice ? "p7-btn p7-btn-primary p7-btn-sm" : "p7-btn p7-btn-secondary p7-btn-sm"}
            data-testid={isInvoice ? "link-forgotten-expenses-btn" : undefined}
          >
            {ctaLabel}
          </button>
          {isInvoice && (
            <button
              type="button"
              onClick={() => void load()}
              disabled={pending}
              className="p7-btn p7-btn-ghost p7-btn-sm"
            >
              Refresh
            </button>
          )}
        </div>
      )}
    </>
  );

  if (!isInvoice) {
    return (
      <div
        data-testid={testId}
        style={{
          marginTop: "var(--space-3)",
          padding: "var(--space-3)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          background: "var(--bg-card)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
          Forgotten receipts
        </div>
        {body}
      </div>
    );
  }

  return (
    <div
      style={{
        marginBottom: "var(--space-3)",
        padding: "var(--space-3)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-subtle, var(--bg-card))",
      }}
      data-testid={testId}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          width: "100%",
          justifyContent: "space-between",
          alignItems: "center",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "var(--text-sm)",
          color: "var(--fg)",
        }}
      >
        <span>
          Forgotten receipts
          {expenses.length > 0 && (
            <span style={{ marginLeft: 8, color: "var(--fg-muted)", fontWeight: 400 }}>
              ({expenses.length} unlinked for this client)
            </span>
          )}
        </span>
        <span aria-hidden>{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && <div style={{ marginTop: "var(--space-3)" }}>{body}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Wire invoice page**

In `apps/web/app/app/invoices/[id]/page.tsx`:

```ts
import { LinkForgottenExpensesPanel } from "@/components/invoices/LinkForgottenExpensesPanel";
```

Replace usage:

```tsx
{invoice.job_id && (
  <LinkForgottenExpensesPanel
    mode="invoice"
    invoiceId={invoice.id}
    jobId={invoice.job_id}
    handlingPct={handlingPct}
  />
)}
```

- [ ] **Step 3: Wire job page**

In `apps/web/app/app/jobs/[id]/page.tsx`:

```ts
import { LinkForgottenExpensesPanel } from "@/components/invoices/LinkForgottenExpensesPanel";
```

Replace usage:

```tsx
{canLinkExpenses && <LinkForgottenExpensesPanel mode="job" jobId={job.id} />}
```

- [ ] **Step 4: Delete page-local twins**

```bash
rm apps/web/app/app/invoices/\[id\]/LinkForgottenExpensesPanel.tsx \
   apps/web/app/app/jobs/\[id\]/LinkForgottenExpensesPanel.tsx
```

- [ ] **Step 5: Grep for old imports**

```bash
grep -R --include='*.tsx' -n 'from \"./LinkForgottenExpensesPanel\"\|from \"./LinkForgottenExpensesPanel\"' apps/web || true
grep -R --include='*.tsx' -n 'LinkForgottenExpensesPanel' apps/web
```

Expected: only shared component path + two call sites.

- [ ] **Step 6: Run related unit tests**

```bash
cd /home/nick/ai-fsm-deploy-clean/apps/web
pnpm exec vitest run lib/documents/__tests__/service-location.unit.test.ts \
  lib/invoices/__tests__/quantity.unit.test.ts \
  lib/invoices/__tests__/material-handling.unit.test.ts \
  lib/invoices/__tests__/job-expenses.unit.test.ts
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/invoices/LinkForgottenExpensesPanel.tsx \
  apps/web/app/app/invoices/\[id\]/page.tsx \
  apps/web/app/app/jobs/\[id\]/page.tsx
git add -u apps/web/app/app/invoices/\[id\]/LinkForgottenExpensesPanel.tsx \
  apps/web/app/app/jobs/\[id\]/LinkForgottenExpensesPanel.tsx
git commit -m "$(cat <<'EOF'
refactor(web): unify LinkForgottenExpensesPanel for invoice and job

Single mode-driven component; preserve invoice link+bill vs job link-only
behavior and existing test ids.
EOF
)"
```

---

### Task 4: Final verification

- [ ] **Step 1: Full leftover greps**

```bash
cd /home/nick/ai-fsm-deploy-clean
grep -R --include='*.ts' --include='*.tsx' -n '@ai-fsm/log/web\|@ai-fsm/log/worker\|@ai-fsm/log/mcp' . || true
grep -R --include='*.ts' --include='*.tsx' -n 'INVOICE_DOCUMENT_JOINS\|ESTIMATE_DOCUMENT_JOINS\|INVOICE_LOCATION_SELECT\|ESTIMATE_LOCATION_SELECT' apps/web || true
test ! -f packages/log/src/web.ts && test ! -f packages/log/src/worker.ts && test ! -f packages/log/src/mcp.ts && echo 'log entries gone'
test ! -f apps/web/app/app/invoices/\[id\]/LinkForgottenExpensesPanel.tsx && echo 'invoice twin gone'
test ! -f apps/web/app/app/jobs/\[id\]/LinkForgottenExpensesPanel.tsx && echo 'job twin gone'
```

- [ ] **Step 2: Package + web unit smoke**

```bash
pnpm --filter @ai-fsm/log test
cd apps/web && pnpm exec vitest run lib/documents/__tests__/service-location.unit.test.ts
```

- [ ] **Step 3: Manual smoke (when app is up)**

1. Job detail with unlinked material expense → panel `job-link-forgotten-expenses` → link → expense gets `job_id`.
2. Draft invoice with `job_id` → panel `link-forgotten-expenses-panel` → link & add → line items appear with materials + handling if enabled.
3. Invoice detail / PDF still show client name + service location (no SQL regression).

- [ ] **Step 4: Optional docs commit only if plan was edited during execution**

If the plan file itself needed fixes during execution, commit them; otherwise skip.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Delete log subpath files + exports | Task 1 |
| Dockerfile sed cleanup | Task 1 |
| Keep app logger wrappers | Task 1 (explicit non-touch) |
| `DOCUMENT_LOCATION_SELECT` + `documentJoins` | Task 2 |
| Call sites: load.ts, invoice page, invoice print | Task 2 |
| No old INVOICE_/ESTIMATE_ constants | Task 2 Step 7 |
| Shared panel + mode props | Task 3 |
| Behavior matrix (CTA, expand, SKU, success) | Task 3 Step 1 |
| Delete twins; wire pages | Task 3 Steps 2–4 |
| Success criteria greps + tests | Task 4 |

## Self-review notes

- No TBD/TODO placeholders in steps.
- Types: `LinkForgottenExpensesMode`, `documentJoins({ root, includeEstimateProperty })` consistent across tasks.
- API routes intentionally not merged (spec non-goal).
- TDD only where new pure logic is introduced (service-location); panel is a move+merge of existing UI with preserved test ids.
