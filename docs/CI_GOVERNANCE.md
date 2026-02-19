# CI Governance & Branch Protection

## Branch Protection Policy (`main`)

The `main` branch is protected with the following settings.
These are applied via GitHub API and maintained by the DevOps/SRE agent.

| Setting | Value | Rationale |
|---------|-------|-----------|
| `required_approving_review_count` | 1 | Require at least one peer review before merge |
| `dismiss_stale_reviews` | true | Re-review required after new commits |
| `require_conversation_resolution` | true | All PR comments resolved before merge |
| `required_status_checks.strict` | true | Branch must be up-to-date with `main` before merge |
| `required_status_checks` | `lint`, `typecheck`, `build`, `test` | All four CI gates must be green |
| `allow_force_pushes` | false | No history rewriting on protected branch |
| `allow_deletions` | false | Branch cannot be deleted |
| `enforce_admins` | true | Protection applies to admins too |
| `required_linear_history` | true | Squash or rebase merges only |

## Required CI Status Checks

All four jobs in `.github/workflows/ci.yml` must pass:

| Check name | Depends on | What it validates |
|------------|------------|-------------------|
| `lint` | — | ESLint across all workspaces (no warnings/errors) |
| `typecheck` | — | TypeScript `--noEmit` across all workspaces |
| `build` | lint, typecheck | `next build` succeeds with `NEXT_PHASE` env bypass |
| `test` | lint, typecheck | All unit + DB-integration tests pass (see TEST_MATRIX.md) |

`lint` and `typecheck` run in parallel. `build` and `test` run in parallel after both pass.

## Applying / Updating Branch Protection

Use the GitHub CLI to apply or update protection settings:

```bash
gh api repos/byesaw13/ai-fsm/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["lint","typecheck","build","test"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true,"require_code_owner_reviews":false,"require_last_push_approval":false}' \
  --field restrictions=null \
  --field required_linear_history=true \
  --field allow_force_pushes=false \
  --field allow_deletions=false \
  --field required_conversation_resolution=true
```

To verify current settings:
```bash
gh api repos/byesaw13/ai-fsm/branches/main/protection
```

## Recovery: Temporarily Bypassing Protection

**Scenario**: CI is broken and a fix must land immediately (e.g., a build outage).

1. Temporarily reduce required approvals to 0:
   ```bash
   gh api repos/byesaw13/ai-fsm/branches/main/protection/required_pull_request_reviews \
     --method PATCH \
     --field required_approving_review_count=0
   ```
2. Or disable a failing required check:
   ```bash
   gh api repos/byesaw13/ai-fsm/branches/main/protection/required_status_checks \
     --method PATCH \
     --field contexts='["lint","typecheck","test"]'  # temporarily remove 'build'
   ```
3. Land the fix PR.
4. **Immediately re-apply** full protection (paste the `PUT` command above).
5. Log the bypass in `docs/DECISION_LOG.md` with timestamp and justification.

**Rule**: No bypass window should remain open for more than 2 hours.

## CI Environment Variables

The `test` job requires these environment variables. They are set in `ci.yml`:

| Variable | Source | Purpose |
|----------|--------|---------|
| `DATABASE_URL` | CI job env | Pool connection for app code under test |
| `TEST_DATABASE_URL` | CI job env | Direct connection for DB integration test fixtures |
| `AUTH_SECRET` | CI job env | Required by `env.ts` validation (≥32 chars) |
| `REDIS_URL` | CI job env | Required by `env.ts` schema; no Redis service needed in CI |

The `build` job sets:

| Variable | Value | Purpose |
|----------|-------|---------|
| `NEXT_PHASE` | `phase-production-build` | Activates build-time env bypass in `env.ts` |

## Intentional Skip Inventory

Tests that skip in CI are **not failures**. They are guarded by environment flags.
See `docs/TEST_MATRIX.md` for the full skip matrix and how to run each tier locally.

| Suite | Skip condition in CI | Reason |
|-------|---------------------|--------|
| `estimates.integration.test.ts` | `TEST_BASE_URL` absent | Requires running Next.js server |
| `invoices.integration.test.ts` | `TEST_BASE_URL` absent | Requires running Next.js server |
| Playwright E2E (`tests/e2e/`) | Not run in `test` job | Requires running server; separate job (future) |

DB integration tests (`payments`, `visit-reminder`, `invoice-followup`) **do** run in CI
because `TEST_DATABASE_URL` is provided.

## Flaky Test Policy

- Any test that fails intermittently (not every run) must be quarantined immediately.
- Add `.skip` with a tracking comment: `// FLAKY: <issue-url>`.
- Open an issue with label `flaky-test` and assign to QA agent.
- No flaky test may block the `test` check without a skip applied.

## Adding New Required Checks

To add a new required status check (e.g. a `rls-abuse` job):

1. Add the job to `ci.yml` and ensure it has a stable `name:` field.
2. Open a PR and merge it so the check runs at least once on `main`.
3. Add the check name to the protection via:
   ```bash
   gh api repos/byesaw13/ai-fsm/branches/main/protection/required_status_checks \
     --method PATCH \
     --field contexts='["lint","typecheck","build","test","rls-abuse"]'
   ```
4. Update this document's Required CI Status Checks table.
