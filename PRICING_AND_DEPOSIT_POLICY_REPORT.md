# Pricing and Deposit Policy Audit

## Scope

This audit separates three concerns that were previously coupled in estimate creation and invoice conversion:

1. Job pricing: labor, materials, markup, guardrails, price book totals, manual line items, painting totals.
2. Deposit policy: whether money is due before work and how that amount is calculated.
3. Customer-facing terms: what the customer sees on estimates, PDFs, portals, emails, and invoices.

Canonical inputs reviewed:

- `docs/canonical/PRODUCT_VISION.md`
- `docs/canonical/WORKFLOW.md`
- historical estimate-system audit and stabilization notes retained in git history
- `DOVETAILS_PRICING_CONTRACT.md`

## Pricing Value Map

| Value | Source of truth after this change | Used by | Notes |
| --- | --- | --- | --- |
| `subtotal_cents` | Estimate create/update APIs, estimate engine, painting calculators, manual line item math, option totals | Estimate detail, print, PDF, invoice conversion, reports | Job pricing only. No deposit policy is applied while producing subtotal. |
| `tax_cents` | Estimate create/update APIs and invoice create APIs from selected tax rate | Estimate/invoice totals and conversion | Tax remains part of project total; deposit policy consumes the final total only after pricing. |
| `total_cents` | Pricing calculators plus adjustments/tax | Estimate storage, customer copy, invoices, reports | Canonical project price. Deposit does not change project price. |
| labor | Price book line items, AI draft service selection, painting labor formulas, estimate engine labor items | Internal margin, estimate totals, guardrails | Labor contributes to job cost and margin only. |
| materials | Manual material line items, painting material cost, price book material defaults, AI draft line items | Estimate totals, margin, materials-only deposit basis | Materials can be used as a deposit basis only when deposit type is explicitly `materials`. |
| markup / handling | `packages/domain/src/dovetails.ts`, estimate engine rules, painting/material handling logic | Job pricing and margin review | Markup stays in pricing. It is not a deposit rule. |
| guardrail pricing | `apps/web/lib/estimates/guardrails.ts` and estimate create/update guardrail fields | Minimum service review, pricing review status, adjustments | Guardrails protect job pricing but do not create deposit requirements. |
| painting pricing | `packages/domain/src/painting.ts`, `apps/web/lib/estimates/pricing.ts`, painting UI | Painting estimates and previews | Painting calculators now return `deposit_cents = 0` by default. |
| price book pricing | Price book migrations, ScopeBuilder, AI draft route, `apps/web/lib/estimates/ai-draft.ts` | Estimate creation, AI draft pricing | Count/add-on pricing is separate from deposit policy. Two fans price as base fan install plus additional fan add-on. |
| manual line item pricing | `apps/web/lib/estimates/math.ts`, estimate create/update APIs | Estimate totals and invoice line copying | Manual line items price the job only. |
| `pricing_mode` | Price book/service metadata and estimate creation flow | AI draft and ScopeBuilder behavior | Pricing mode decides how a service is priced, not payment timing. |
| `deposit_cents` | `apps/web/lib/estimates/deposit-policy.ts` only for new/updated writes | Estimate display, approval, email/PDF, invoice conversion | Derived from explicit policy fields. Defaults to zero. |
| `balance_cents` | `deposit-policy.ts` for estimates; database generated column for invoices | Estimate display, invoice display | Project total minus explicit deposit/credit. Defaults to full total. |

## Deposit Behavior Map

| Behavior | Current implementation | Result |
| --- | --- | --- |
| Default deposit | Estimate form state, create API, update API, compute path | `deposit_required = false`, `deposit_type = 'none'`, `deposit_cents = 0`. |
| Percentage deposit | `calculateDepositPolicy({ deposit_type: 'percentage' })` | Only applies when `deposit_required = true` and an explicit percentage is supplied. |
| Fixed deposit | `calculateDepositPolicy({ deposit_type: 'fixed' })` | Uses explicit cents amount and clamps to project total. |
| Materials deposit | `calculateDepositPolicy({ deposit_type: 'materials' })` | Uses visible material line items plus explicit material basis. |
| Deposit storage | Migration `107_explicit_estimate_deposit_policy.sql` | Adds explicit policy columns to `estimates`; historical rows with existing deposits are marked explicit for compatibility. |
| Approval deposit invoice | `apps/web/lib/estimates/approve.ts` | Creates a draft deposit invoice only when `deposit_required = true` and `deposit_cents > 0`. |
| Final invoice credit | `apps/web/lib/invoices/billing.ts`, estimate convert route, job completion route | Final invoice carries full total and credits non-void deposit invoices through `deposit_cents`. |
| Customer estimate copy | Estimate email, PDF, portal, print/detail views | Deposit/balance language appears only when deposit amount is greater than zero. |
| Manual invoice creation | `apps/web/app/api/v1/invoices/route.ts` | No default deposit is added to manual invoices. |

## Hidden Assumptions Removed

- Removed active `DEPOSIT_RATE` usage from estimate pricing, painting pricing, invoice creation, estimate engine rules, and UI live totals.
- Removed automatic 30% deposit calculation from estimate creation and update paths.
- Removed default 30% deposit behavior from painting project outputs.
- Removed automatic deposit invoice creation based only on `deposit_cents`.
- Removed draft-form customer rows that showed `Deposit due: $0.00` when no deposit was selected.
- Removed customer-facing `Balance Due (70%)` copy from the estimate review flow.
- Changed job completion invoice creation from a sent balance invoice to a draft final invoice that credits non-void deposit invoices.

The legacy exported constants `DEPOSIT_RATE` and `BALANCE_RATE` remain in `packages/domain/src/dovetails.ts` for backwards compatibility only. The pricing contract now states they must not be used for new estimate deposit calculation.

## Canonical Deposit Policy

Deposits are explicit payment policy, not pricing logic.

Supported modes:

- No deposit: `deposit_required = false`, `deposit_type = 'none'`, `deposit_cents = 0`.
- Materials-only deposit: `deposit_required = true`, `deposit_type = 'materials'`.
- Percentage deposit: `deposit_required = true`, `deposit_type = 'percentage'`, explicit `deposit_percentage`.
- Fixed deposit: `deposit_required = true`, `deposit_type = 'fixed'`, explicit `deposit_fixed_cents`.

Due trigger values:

- `on_acceptance`
- `before_scheduling`
- `before_material_order`
- `custom`

Terms flags added to estimates:

- `terms_scope_accepted`
- `terms_payment_accepted`
- `terms_change_order_accepted`

## Files Changed

Pricing and policy core:

- `apps/web/lib/estimates/deposit-policy.ts`
- `apps/web/lib/estimates/pricing.ts`
- `apps/web/lib/estimates/compute.ts`
- `apps/web/lib/estimates/repository.ts`
- `packages/domain/src/estimate-engine/rules.ts`
- `packages/domain/src/painting.ts`
- `packages/domain/src/dovetails.ts`
- `DOVETAILS_PRICING_CONTRACT.md`

Estimate APIs and invoice behavior:

- `apps/web/app/api/v1/estimates/route.ts`
- `apps/web/app/api/v1/estimates/[id]/route.ts`
- `apps/web/lib/estimates/approve.ts`
- `apps/web/app/api/v1/invoices/route.ts`
- `apps/web/app/api/v1/jobs/[id]/transition/route.ts`

Estimate UI and customer output:

- `apps/web/app/app/estimates/new/hooks/useEstimateForm.ts`
- `apps/web/app/app/estimates/new/hooks/useEstimatePricing.ts`
- `apps/web/app/app/estimates/new/hooks/useEstimateLiveIntel.ts`
- `apps/web/app/app/estimates/new/components/Step3Adjustments.tsx`
- `apps/web/app/app/estimates/new/components/Step2Pricing.tsx`
- `apps/web/app/app/estimates/new/components/Step4ReviewAndSend.tsx`
- `apps/web/app/app/estimates/new/components/EstimateIntelSidebar.tsx`
- `apps/web/app/app/estimates/new/components/RoomByRoomEditor.tsx`
- `apps/web/app/app/estimates/components/PaintingEstimatorSection.tsx`
- `apps/web/app/app/estimates/[id]/page.tsx`
- `apps/web/app/app/estimates/[id]/print/page.tsx`
- `apps/web/app/portal/estimates/[token]/EstimatePortalClient.tsx`
- `apps/web/lib/email/templates.ts`
- `apps/web/lib/pdf/document-pdf.ts`

Related pricing fix included in this audit pass:

- `apps/web/lib/estimates/ai-draft.ts`
- `apps/web/app/api/v1/estimates/ai-draft/route.ts`
- `apps/web/components/ScopeBuilder.tsx`
- `apps/web/app/app/estimates/new/hooks/useEstimateAI.ts`
- `apps/web/app/app/estimates/new/components/Step2Pricing.tsx`
- `db/migrations/106_price_book_add_on_defaults.sql`

## Database Changes

- `db/migrations/107_explicit_estimate_deposit_policy.sql`
  - Adds `deposit_required`.
  - Adds `deposit_type` with allowed values `none`, `materials`, `percentage`, `fixed`.
  - Adds `deposit_percentage`.
  - Adds `deposit_fixed_cents`.
  - Adds `deposit_due_trigger`.
  - Adds estimate terms checkboxes.
  - Backfills historical estimates with existing positive `deposit_cents` as explicit legacy percentage deposits.

- `db/migrations/106_price_book_add_on_defaults.sql`
  - Adds add-on pricing defaults for selected price book services so multi-count fixture work can price base plus additional units.

## Tests Added or Updated

- `apps/web/lib/estimates/__tests__/deposit-policy.unit.test.ts`
  - No-deposit estimate keeps full balance.
  - Explicit 30% deposit calculates only when selected.
  - Fixed deposit clamps to total.
  - Materials deposit uses material basis.
  - Disabled deposit overrides stale selected type.
  - Approval with no deposit creates no deposit invoice.
  - Approval with deposit creates a draft deposit invoice.
  - Customer estimate email copy suppresses deposit language when disabled.
  - Customer estimate email copy shows deposit and balance when selected.

- `packages/domain/src/estimate-engine/__tests__/engine.test.ts`
  - Estimate engine default deposit expectation changed to zero deposit/full balance.

Existing coverage retained:

- `apps/web/lib/invoices/__tests__/billing.unit.test.ts`
  - Final invoice credits non-void deposit invoices.
  - Voided deposits are excluded.
  - Credit clamps to project total.

## Validation

Commands run:

- `pnpm --filter @ai-fsm/web typecheck`
- `pnpm --filter @ai-fsm/web test:unit -- lib/estimates/__tests__/deposit-policy.unit.test.ts lib/invoices/__tests__/billing.unit.test.ts`
- `pnpm --filter @ai-fsm/domain test:unit`
- `pnpm gate:fast`

Full `pnpm gate:fast` passed after implementation.

## Remaining Pricing Debt

- Legacy constants `DEPOSIT_RATE` and `BALANCE_RATE` are still exported for compatibility. They should be removed in a future breaking cleanup once no tests or downstream imports rely on them.
- Existing generated audit docs still describe prior deposit behavior. They should remain historical evidence, but new canonical behavior is captured in this report and `DOVETAILS_PRICING_CONTRACT.md`.
- Materials-only deposit basis is strongest for visible material line items and painting material costs. Multi-option estimates may need option-specific material deposit previews if option-level deposit policy becomes customer-facing.
- The estimate edit API supports explicit deposit policy fields; if there is a separate rich edit screen beyond creation, it should expose the same controls there.
- Customer-facing due trigger text is available in code but not yet fully surfaced in every document template. Current output correctly suppresses deposit language unless a deposit exists.
