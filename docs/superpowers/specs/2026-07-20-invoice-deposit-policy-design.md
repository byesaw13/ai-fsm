# Set a Deposit on Any Invoice — Design

**Date:** 2026-07-20
**Status:** Design — pending owner approval, then a backlog task + ROADMAP phase
**Origin:** Owner wants Square-style invoicing: one invoice for the full project
total, collect a deposit (fixed $ or %) as a first payment, then the balance —
without creating a second invoice per job, and editable later for change orders.

---

## Problem

Today a deposit can only reach an invoice through the estimate → deposit-invoice
→ final-invoice flow. **Manually created invoices hardcode `deposit_cents = 0`**
(`apps/web/app/api/v1/invoices/route.ts:166`) and the invoice `PATCH` only allows
`deposit_paid_at` — not a deposit amount. So the owner can't make one invoice for
the full total and say "collect 30% now."

The Square payment-link machinery already exists (`kind: "deposit" | "balance" |
"custom"`), so the only missing piece is **letting the owner set a deposit on a
standard invoice**, defaulting from the Settings → Standard deposit % added in #514.

## Non-goals (explicitly out of scope)

- **Not** changing the estimate → deposit-invoice → final-invoice flow. That
  two-invoice path stays as-is; consolidating it is separate, larger work.
- **Not** creating a Square *Invoice* object. Square stays a card processor
  (`quickPay` links); Dovetails owns the invoice. Unchanged.
- No change to how `paid_cents` is synced from payments (existing trigger).

---

## The core decision: deposit is a *first payment*, not a *credit*

There are two possible meanings, and they behave very differently. **We choose
the first-payment model (Option A).**

### Option A — deposit is a first payment (CHOSEN)

- Invoice total = the full project. The deposit is "how much to collect up front."
- It does **not** reduce the total owed. Money math stays on `total_cents` and
  `paid_cents`; remaining = `total_cents − paid_cents`.
- Paying the deposit (Square link *or* a recorded cash/check payment) increments
  `paid_cents` like any other payment. There is no separate deposit ledger.
- This is exactly how Square behaves, and how the app **already** computes
  amounts: the payment-link route uses `remaining = total_cents − paid_cents`
  (`square-link/route.ts:86`) and the invoice page uses
  `amountDue = total_cents − paid_cents` (`invoices/[id]/page.tsx:183`, with a
  standing TODO about the generated column).

### Option B — deposit is a credit (REJECTED)

- The existing `invoices.deposit_cents` is a credit: `balance_cents` is a **stored
  generated column** = `total_cents − deposit_cents` (migration 013).
- Setting it on a standard invoice would drop the displayed balance by the deposit
  **before it is paid**, showing "balance due = total − deposit" while nothing has
  been collected. This is the exact conflict the invoice-page TODO documents and a
  prior review flagged.
- Changing a stored generated column is a migration with wide blast radius across
  `deriveInvoiceStatus`, `validatePaymentAmount`, and `trg_payment_sync_invoice`.

**Consequence of choosing A:** the new deposit is a **policy** (type + value) that
*computes a requested amount*; it never writes `deposit_cents`/`balance_cents`.
For standard invoices `deposit_cents` stays `0`, so `balance_cents == total_cents`
(the full amount owed), and `paid_cents` tracks collection. No generated-column
change, no migration to the money math.

---

## Design

### Data model (mirror the estimate deposit policy, migration 107)

New migration adds to `invoices` (additive, nullable/defaulted):

```sql
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS deposit_type text NOT NULL DEFAULT 'none'
    CHECK (deposit_type IN ('none', 'percentage', 'fixed')),
  ADD COLUMN IF NOT EXISTS deposit_percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS deposit_fixed_cents integer;
```

- Reuses the estimate vocabulary (`percentage` / `fixed`); drops `materials`
  (not meaningful on a bare invoice) — keep the set small.
- Leaves `deposit_cents` / `deposit_paid_at` / `balance_cents` untouched, so the
  legacy deposit/final invoices keep working unchanged.

### Computing the requested deposit (reuse existing pure code)

`apps/web/lib/estimates/deposit-policy.ts` already has `calculateDepositPolicy()`
which turns `{ deposit_type, deposit_percentage, deposit_fixed_cents, total_cents }`
into a cents amount (percentage → `round(total * pct/100)`, fixed → clamped to
total). Reuse it (rename import path if it should move to a neutral module).

```
requestedDepositCents(invoice) =
  invoice.deposit_type === 'none' ? 0
  : calculateDepositPolicy({ deposit_required: true, deposit_type,
      deposit_percentage, deposit_fixed_cents, total_cents }).deposit_cents
```

**Always computed live from the current `total_cents`** — so when a change order
edits the total, a percentage deposit recomputes automatically (Square behavior).
Nothing stale is stored.

### Immutability carveout (so the deposit is editable after send)

`enforce_invoice_immutability()` (migration 150) is allow-list based: a non-void
invoice can only be UPDATEd via a matching carveout, otherwise it raises. The new
`deposit_*` columns are financial policy, not money already billed, and Square lets
you change the deposit after sending — so add a carveout permitting **only** the
three `deposit_*` columns to change on `draft / sent / partial / overdue`
invoices, with everything else `IS NOT DISTINCT FROM` old. (Editing is still
blocked once `paid`/`void`.) A new migration `REPLACE`s the function adding this
block; existing carveouts preserved verbatim.

### API

- **Create** (`POST /api/v1/invoices`): accept optional `deposit_type` /
  `deposit_percentage` / `deposit_fixed_cents`. **Default `deposit_type='none'`**
  (per decision 1 — no deposit unless the owner adds one). The account's Standard
  deposit % is used only as the *pre-filled value in the editor* when the owner
  switches the type to Percentage, not as a forced default.
- **PATCH** (`PATCH /api/v1/invoices/[id]`): allow setting/clearing the deposit
  policy on non-terminal invoices (relies on the carveout above). Validate:
  percentage 0–100; fixed ≥ 0.
- **Payment link** (`square-link/route.ts`): change the `kind === "deposit"`
  branch to charge `requestedDepositCents(invoice)` instead of `invoice.deposit_cents`,
  falling back to `deposit_cents` when a legacy deposit invoice has no policy (back-compat).
  The existing `amount > remaining` guard already prevents overcharging.

### UI

- **Invoice detail** — a small Deposit editor (owner/admin): type (None /
  Percentage / Fixed), value, defaulted from settings. Show a derived line:
  "Deposit requested: $X (30% of total)" and keep the existing
  Total / Paid / Balance (`total − paid`) display. Receiving the deposit is just
  **Record Payment** (cash/check) or the Square **Deposit** link — both feed
  `paid_cents`. (The legacy `MarkDepositReceivedButton`/`deposit_paid_at` path is
  untouched but not used by policy deposits.)
- **Customer surfaces** (portal + PDF): when a deposit is requested and unpaid,
  show one line — "Deposit due now: $X — remaining $Y due on completion." Suppress
  when `deposit_type='none'` or the deposit is already covered by `paid_cents`.

---

## Isolation / testability

- `requestedDepositCents` is pure (extends the existing tested
  `calculateDepositPolicy`) — unit-tested for percentage rounding, fixed clamp,
  `none`, and recompute-on-total-change.
- The immutability carveout gets a DB/integration test: deposit fields editable on
  sent, all other fields still frozen, editing blocked on paid/void.
- The payment-link deposit amount gets a unit test (mock-pool) proving it charges
  the computed policy amount, not `deposit_cents`.

## Migration & back-compat

- Additive columns; `deposit_type` defaults `'none'`, so every existing invoice is
  unaffected (no deposit requested).
- Legacy deposit/final invoices keep `deposit_cents`/`balance_cents` semantics; the
  payment-link fallback preserves their behavior.
- Reversible: drop the three columns; revert the function to the 150 body.

## Rollout order (independently shippable)

1. Migration (columns) + `enforce_invoice_immutability` carveout + tests.
2. `requestedDepositCents` helper + payment-link deposit branch.
3. Create/PATCH API for the deposit policy (+ default from settings).
4. Invoice-detail Deposit editor.
5. Portal + PDF deposit-due line.

## Decisions (confirmed by owner 2026-07-20)

1. **Default off.** New invoices start with `deposit_type='none'`; the owner adds a
   deposit per invoice. The Settings Standard % only pre-fills the editor when they
   choose Percentage.
2. **Percentage basis = full invoice total incl. tax** — i.e. `total_cents`, which
   is what `calculateDepositPolicy` already uses. No change needed.
3. **Editable until paid in full.** The immutability carveout permits changing the
   deposit policy on `draft / sent / partial / overdue`; blocked once `paid` or
   `void`. (A partial payment does not freeze it.)
