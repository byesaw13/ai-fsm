# TASK-255: Shared helpers used once, not copied

Status:
In Progress

Epic:
EPIC-005 Platform & Delivery

Phase:
cross-cutting

Severity:
Low. Copies drift (a money format here, a phone format there) and every copy is code to maintain.

Problem:
Audit 2026-11-24 (owner approved removal in session):
- 16 local `formatDollars`/`formatCents` copies in pages and components (e.g. `invoices/[id]/page.tsx`, `EstimateEditForm.tsx`, `ScopeBuilder.tsx`) where `formatCents` from `@ai-fsm/money` does the job.
- Re-export shims: `apps/web/lib/money.ts`, `formatCents` re-export in `lib/estimates/pricing.ts`, and the `formatCentsToDollars` alias.
- `toE164` in `lib/company/public-card.ts` duplicates `normalizePhone` in `lib/phone.ts`.
- `packages/money` (19 lines) and `packages/log` (112 lines) are separate workspaces with their own lint, tsconfig and test setup; `packages/domain` is already shared by web and worker.
- Two indexes on `clients(account_id)`: `idx_clients_account` (001) and `idx_clients_account_id` (075).
- `app/app/my-day/` holds My Work's components behind a 4-line redirect page.

Scope:
- Replace the local formatters with `formatCents` (whole dollars → `formatCentsShort`). The `$` + `toFixed(2)` copies gain thousands commas and `-$` negatives, matching the rest of the app; company-story's "$12" style stays.
- Remove the shims and alias; import from the package. (`apps/web/lib/money.ts` stays for now: only its own test imports it. Listing it on the map first, per system-map.md, would make knip fail CI on an unused file; the owner decides how to retire it.)
- ~~Use `normalizePhone` for the public card.~~ Kept: `toE164` rejects non-US numbers, which the card's US formatter needs; `normalizePhone` keeps international ones.
- Move `money` and `log` into `packages/domain` (`@ai-fsm/domain/money`, `@ai-fsm/domain/log`) and delete the two workspaces.
- Migration dropping `idx_clients_account_id`.
- Move the My Day components that My Work uses into `app/app/my-work/`; the redirect page stays. Remove the rest only after `node scripts/map-unlinked.mjs` lists them (system-map unused-code rule).

Out of scope:
- Any visible change.

Acceptance Criteria:
- [ ] No local `function formatDollars|formatCents` in `apps/web/app` or `components`.
- [ ] `packages/money` and `packages/log` are gone; build, lint, knip and tests pass.

Test Plan:
- `pnpm gate:fast`; the money and log unit tests move with their code.

Related:
None.
