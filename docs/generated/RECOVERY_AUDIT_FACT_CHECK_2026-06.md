# Recovery Audit Fact-Check & Corrected Feature-Status Matrix

**Date:** 2026-06-23
**Scope:** Verifies the claims in the June 2026 "Dovetails FSM Recovery Audit" against the actual repository (code, migrations, routes, navigation). No code changes were made.
**Method:** Phase 1 "Truth Audit" — every page, service, backlog epic, and feature claim was checked against `apps/web/app`, `apps/web/components/AppShell.tsx`, `db/migrations`, and the workspace layout.

> This is an evidence document. It does not define product scope (see `docs/canonical/*`).

---

## 1. Headline inventory — mostly accurate

| Audit claim | Repository reality | Verdict |
|---|---|---|
| 66 application pages/routes | 66 `page.tsx` files, **but 302 API `route.ts` files** | ⚠️ Undercounts the real surface ~5× |
| 6 active backlog epics | `docs/backlog/EPIC-001…006` present | ✅ Correct |
| Services: worker, mcp, pr-gatekeeper | All three present, plus `apps/web` and `packages/domain` | ✅ Correct |
| PWA manifest exists | `apps/web/app/manifest.ts` (Next.js metadata route) | ✅ Correct |
| Service worker exists | `apps/web/public/sw.js` | ✅ Correct |
| 120 SQL migrations | confirmed (`db/migrations`) | ✅ (not stated by audit; noted for record) |

**Conclusion:** the structural inventory is trustworthy. The page count understates the API surface and should be read as "66 UI pages, 302 API routes."

---

## 2. Major errors — "Missing Deliverables" that are already built

The audit's **"Highest Priority Missing Deliverables"** list is wrong on its two most consequential items. Acting on it as written would have directed recovery effort at already-solved problems.

### 2.1 Square payment integration — **BUILT, not missing**
Evidence:
- `app/api/webhooks/square/route.ts` (incl. refund webhooks — ref commit `f9c382a`)
- `app/api/v1/integrations/square/route.ts`, `.../square/test/route.ts`
- `app/api/v1/invoices/[id]/square-link/route.ts`
- Unit tests for webhook, settings, and square-link

### 2.2 Role separation (Owner vs Tech) — **BUILT, not missing**
Evidence in `apps/web/components/AppShell.tsx`:
- `getNavSections(role)` branching on `owner` / `admin` / `tech` (EPIC-006 Phase 5)
- `WorkspaceSwitcher` component
- `getBottomNavItems(role)` role-filtered mobile nav

The audit contradicts itself here: it lists "Role workspaces" as *partial* under Partially Built, then lists "Role separation" as a *missing* deliverable.

---

## 3. Numbering strategy — half right

| Identifier | Status | Evidence |
|---|---|---|
| `invoice_number` | ✅ Built | 15 references across migrations; unique index per `account_id` |
| `job_number` | ❌ Missing | No migration column found |
| `estimate_number` | ❌ Missing | No migration column found |

The audit's "Invoice numbering strategy" deliverable is already satisfied. "Job numbering" and "Estimate numbering" are genuine gaps.

---

## 4. The Built/Hidden distinction the audit flattened

The audit treats "has a route" as "Built." Phase 1's own matrix asks for a **Hidden** category, which the audit then ignored. All 17 "Built" features have real routes, but several are **not surfaced in the primary navigation** (`AppShell`).

**Primary nav surfaces:** Today, My Day, Requests, Properties, Jobs, Invoices, Reports, Settings, Clients, Estimates, Schedule, Visits.

**Route segments that exist but are NOT in primary nav:**
`action-queue`, `automations`, `expenses`, `intake`, `maintenance-plans`, `mileage`, `price-book`, `timeline`

So Automations, Maintenance Plans, Price Book, and Mileage are **Hidden**, not plainly "Built."

---

## 5. Corrected Feature-Status Matrix

| Feature | Audit said | Corrected status | Notes |
|---|---|---|---|
| Clients | Built | **Built (nav)** | |
| Properties | Built | **Built (nav)** | |
| Estimates | Built | **Built (nav)** | |
| Invoices | Built | **Built (nav)** | |
| Jobs | Built | **Built (nav)** | |
| Visits | Built | **Built (nav)** | |
| Requests | Built | **Built (nav)** | |
| Schedule | Built | **Built (nav)** | |
| Reports | Built | **Built (nav)** | |
| My Day | Built | **Built (nav)** | |
| Client Portal | Built | **Built (nav)** | `app/portal` |
| Square payments | Missing (deliverable) | **Built** | Webhooks, refunds, settings, square-link, tests |
| Role workspaces | Partial / Missing | **Built** | EPIC-006 Phase 5; role-filtered nav + switcher |
| Invoice numbering | Missing | **Built** | unique index per account |
| PWA (manifest + SW) | Built | **Built** | |
| Automations | Built | **Hidden** | route exists, not in primary nav |
| Maintenance Plans | Built | **Hidden** | route exists, not in primary nav |
| Price Book | Built | **Hidden** | route exists, not in primary nav |
| Mileage | Built | **Hidden** | route exists, not in primary nav |
| Expenses / Intake / Timeline / Action Queue | (not separately listed) | **Hidden** | routes exist, not in primary nav |
| Referral ROI / profitability | Partial / Missing | **Partial** | only `app/api/v1/reports/referrals` API route; UI unverified |
| Job numbering | Missing | **Missing** | confirmed gap |
| Estimate numbering | Missing | **Missing** | confirmed gap |
| Location automation | Partial | **Partial (unverified)** | needs validation |
| Payment intelligence | Partial | **Partial (unverified)** | needs validation |

---

## 6. Verdict on the audit

- **Inventory section:** trustworthy.
- **"Missing Deliverables" section:** not trustworthy — its top two priorities (Square, role separation) are already shipped.
- **Genuinely actionable gaps:** job & estimate numbering; the Hidden-feature navigation cleanup; validating the referral / location-automation / payment-intelligence partials.

This corrected read aligns better with the standing guidance (production usage and validation over new features) than the audit's original framing, which pointed at solved problems.
