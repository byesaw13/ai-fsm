# Ponytail leftover cuts — design

**Date:** 2026-07-09  
**Branch context:** `feat/client-square-import-fields` (invoice materials / documents work)  
**Status:** Approved for implementation planning  

## Problem

A `/ponytail-review` of the invoice materials + document branding work left three deliberate skips:

1. Twin `LinkForgottenExpensesPanel` implementations (invoice page vs job page).
2. Near-duplicate `INVOICE_*` / `ESTIMATE_*` SQL fragments in `service-location.ts`.
3. Unused `@ai-fsm/log` subpath exports (`./web`, `./worker`, `./mcp`) plus Dockerfile path rewrites.

These are pure cleanup: no product behavior change, shorter and clearer code.

## Goals

- One shared forgotten-receipts panel with mode-driven differences.
- One parameterized document join/select builder; call sites stay readable.
- Delete dead log package subpaths; keep app-local logger wrappers.
- Ship as a **single cleanup PR** (or same branch commit set) after/with the materials work.

## Non-goals

- Merging invoice vs job **API routes** (`linkable-expenses` / `link-expenses`).
- Changing when receipts appear, handling %, or bill-on-link rules.
- Migrating apps to import `@ai-fsm/log/web` (or deleting `apps/web/lib/logger.ts`).
- UI redesign beyond consolidating the two existing panel variants.
- Introducing a SQL query-builder library.

## Approach

**Single “leftover cuts” PR** covering all three items.

---

## 1. Shared LinkForgottenExpensesPanel

### Location

- **New:** `apps/web/components/invoices/LinkForgottenExpensesPanel.tsx`
- **Delete after swap:**
  - `apps/web/app/app/invoices/[id]/LinkForgottenExpensesPanel.tsx`
  - `apps/web/app/app/jobs/[id]/LinkForgottenExpensesPanel.tsx`

### Props

```ts
type Mode = "invoice" | "job";

interface LinkForgottenExpensesPanelProps {
  mode: Mode;
  jobId: string;
  /** Required when mode === "invoice" */
  invoiceId?: string;
  /** Invoice mode only; default 15 */
  handlingPct?: number;
}
```

Call sites validate: invoice page always passes `invoiceId`.

### Endpoints (unchanged contract)

| Mode | GET | POST |
|------|-----|------|
| `invoice` | `/api/v1/invoices/{invoiceId}/linkable-expenses` | `/api/v1/invoices/{invoiceId}/link-expenses` |
| `job` | `/api/v1/jobs/{jobId}/linkable-expenses` | `/api/v1/jobs/{jobId}/link-expenses` |

### Behavior matrix

| Concern | Invoice mode | Job mode |
|---------|--------------|----------|
| Collapsible header | Yes (auto-expand when rows exist) | No — always open |
| Row detail | Vendor, date, materials + handling total, optional SKU sub-lines | Vendor, date, amount, description line |
| CTA | “Link & add to invoice (n)” | “Link to job (n)” |
| Success banner | No (refresh is enough) | Yes (“n receipt(s) linked…”) |
| Refresh control | Explicit Refresh button | Reload after link only |
| Hidden when empty | Yes (unless error) | Yes |
| Test id | `link-forgotten-expenses-panel` | `job-link-forgotten-expenses` |
| Primary action test id | `link-forgotten-expenses-btn` | (none today; keep none unless tests need it) |

### Implementation notes

- Single component; differences are conditionals on `mode`, not two class hierarchies.
- Shared state: `expenses`, `selected`, `loading`, `pending`, `error` (+ `expanded` / `success` only where used).
- `router.refresh()` after successful link in both modes; invoice and job both re-`load()`.
- Do **not** merge API handlers; invoice POST appends billable lines, job POST only attaches expenses.

### Call sites

```tsx
// invoice detail (draft + job_id)
<LinkForgottenExpensesPanel
  mode="invoice"
  invoiceId={invoice.id}
  jobId={invoice.job_id}
  handlingPct={handlingPct}
/>

// job detail
<LinkForgottenExpensesPanel mode="job" jobId={job.id} />
```

---

## 2. Document SQL fragment merge

### File

`apps/web/lib/documents/service-location.ts`

### Keep unchanged

- `LocationFields`
- `formatAddressLine`
- `resolveServiceLocation`

### Replace

Today: four exports — `INVOICE_DOCUMENT_JOINS`, `INVOICE_LOCATION_SELECT`, `ESTIMATE_DOCUMENT_JOINS`, `ESTIMATE_LOCATION_SELECT`.

**After:**

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
 * Join chain from document root → client → optional job/estimate → property.
 * root "i" = invoices alias; root "e" = estimates alias.
 */
export function documentJoins(opts: {
  root: "i" | "e";
  /** When true (invoices), also COALESCE property via linked estimate. */
  includeEstimateProperty?: boolean;
}): string
```

`documentJoins` internals:

- `JOIN clients c ON c.id = {root}.client_id`
- `LEFT JOIN jobs j ON j.id = {root}.job_id`
- If `includeEstimateProperty` and root is `i`: `LEFT JOIN estimates e ON e.id = i.estimate_id` and property COALESCE includes `e.property_id`
- Property: `LEFT JOIN properties p ON p.id = COALESCE({root}.property_id, j.property_id, [e.property_id?], client_first_property)`
- Client-first property subquery uses `{root}.account_id` for tenant safety

### Call sites (all in same PR)

Known importers of the join/select constants today:

| Consumer | Joins | Select |
|----------|-------|--------|
| `lib/pdf/load.ts` (invoice) | `documentJoins({ root: "i", includeEstimateProperty: true })` | `DOCUMENT_LOCATION_SELECT` |
| `lib/pdf/load.ts` (estimate) | `documentJoins({ root: "e" })` | `DOCUMENT_LOCATION_SELECT` |
| `app/invoices/[id]/page.tsx` | invoice form | same |
| `app/invoices/[id]/print/page.tsx` | invoice form | same |

`app/estimates/[id]/print/page.tsx` uses `resolveServiceLocation` only (no join fragments) — no change required there.

No re-export of old `INVOICE_*` / `ESTIMATE_*` names after call sites updated.

### Constraint

String templates only — no query DSL, no runtime SQL builder dependency.

---

## 3. packages/log subpath deletion

### Reality check

- `packages/log/src/{web,worker,mcp}.ts` each call `createLogger({ service })`.
- Apps already do that in local wrappers and import **only** `@ai-fsm/log` (root).
- Zero imports of `@ai-fsm/log/web|worker|mcp` in the repo.

### Delete

1. `packages/log/src/web.ts`
2. `packages/log/src/worker.ts`
3. `packages/log/src/mcp.ts`
4. `exports["./web"]`, `exports["./worker"]`, `exports["./mcp"]` from `packages/log/package.json`
5. Dockerfile `sed` block in `services/worker/Dockerfile` that rewrites those subpath `src` → `dist` entries (and any web Dockerfile equivalent if present)

### Keep

- `packages/log/src/index.ts` and root `exports["."]`
- `apps/web/lib/logger.ts`
- `services/worker/src/logger.ts`
- `services/mcp/src/logger.ts`

### Verify

```bash
rg '@ai-fsm/log/(web|worker|mcp)'   # must be empty
```

Worker/web image build still resolves `@ai-fsm/log` main entry.

---

## Testing

| Area | Check |
|------|--------|
| Panels | Existing test ids preserved; manual smoke: job link-only, invoice link+bill + handling display |
| SQL | PDF load + invoice detail still show client name and service location; estimate print location still resolves |
| Log | Package typecheck/build; worker Dockerfile build if CI covers it; no import errors |
| Regression | `vitest` unit tests for material-handling / quantity / job-expenses still green |

No new large test suites required for pure moves; keep existing smoke coverage.

## Risks

| Risk | Mitigation |
|------|------------|
| Panel mode conditionals become messy | Cap at invoice vs job matrix above; extract row subcomponent only if file > ~200 lines |
| SQL alias bug (wrong account_id in subquery) | Mirror current invoice/estimate fragments exactly in the builder; one manual PDF check each |
| Dockerfile still references deleted paths | Grep Dockerfiles after delete |

## Implementation order

1. Log package delete (isolated, deploy-adjacent, no UI).
2. SQL fragment merge + call site updates.
3. Shared panel extract + delete twins.

Order minimizes UI churn risk while clearing dead code first.

## Success criteria

- [ ] Single panel source of truth; page-local twins gone
- [ ] No `INVOICE_DOCUMENT_JOINS` / `ESTIMATE_*` duplicates
- [ ] No `@ai-fsm/log` subpath exports or unused entry files
- [ ] Behavior matrix above unchanged
- [ ] Unit tests related to invoices materials still pass
