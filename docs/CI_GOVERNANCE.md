# CI Governance

## Required Checks

Branch protection for `main` should require these stable CI check names:

- `lint`
- `typecheck`
- `build`
- `test`
- `e2e-smoke`

The `e2e-smoke` job is the release-manifest browser smoke. It runs `tests/e2e/core-flow.spec.ts` against a migrated, seeded PostgreSQL database and a production Next.js server.

## Branch Protection Command

After `e2e-smoke` has run at least once on `main`, update required status checks with:

```bash
gh api repos/byesaw13/ai-fsm/branches/main/protection/required_status_checks \
  --method PATCH \
  --field strict=true \
  --field contexts='["lint","typecheck","build","test","e2e-smoke"]'
```

Do not remove a required check to merge a feature PR. If a required check itself is broken, use a short-lived documented bypass and restore the full list immediately after the fix lands.

## CI Jobs

| Check | Depends on | Purpose |
|---|---|---|
| `lint` | none | ESLint across workspaces. |
| `typecheck` | none | TypeScript `--noEmit` across workspaces. |
| `build` | `lint`, `typecheck` | Production build with build-time env placeholders only. |
| `test` | `lint`, `typecheck` | Unit and DB integration tests against PostgreSQL. |
| `e2e-smoke` | `build`, `test` | Required release spine: login, client, job, visit, estimate, invoice, payment. |

## Release Manifest

The browser smoke is scoped by `tests/e2e/core-flow.spec.ts` and the release expectations in this document. If the launch spine changes, update both in the same PR.
