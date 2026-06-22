# @ai-fsm/pr-gatekeeper

Local, **read-only** Model Context Protocol server that answers "is this PR safe
to merge into the latest `main`?" It fetches `origin/main`, simulates the merge
in a **temporary git worktree** (never your active tree), runs the repo gates,
applies Dovetails-specific rule checks, and returns one structured verdict.

It never edits, commits, pushes, or merges, and never writes to GitHub. Only
whitelisted `git` / `gh` / `pnpm` subcommands run, via `execFile` with no shell;
captured output is secret-redacted.

## Tools

`analyze_pr` · `simulate_merge_to_main` · `run_repo_checks` · `check_migrations` ·
`check_changed_api_contracts` · `check_dovetails_business_rules` ·
`generate_merge_report`

## Quick start

```bash
pnpm --filter @ai-fsm/pr-gatekeeper build
node services/pr-gatekeeper/dist/index.js   # operates on the cwd's git repo
```

Full setup (security model, tool reference, Claude Desktop/CLI config):
[`docs/working/pr-gatekeeper.md`](../../docs/working/pr-gatekeeper.md).

## Scripts

| Script | What |
| --- | --- |
| `dev` | Run from TS via tsx |
| `build` | Compile to `dist/` |
| `start` | Run the built server |
| `test` / `test:unit` | Vitest unit tests (rule checks, diff, exec allowlist, redact, report) |
| `test:integration` | Builds a temp git repo and verifies merge simulation |
| `typecheck` / `lint` | `tsc --noEmit` / ESLint |

## Layout

```
src/
  index.ts        entrypoint: start stdio server
  server.ts       register tools (redacted errors)
  config.ts       resolve target repo (GATEKEEPER_REPO_DIR or cwd)
  exec.ts         command whitelist + execFile runner (no shell)
  redact.ts       secret redaction for surfaced output
  git.ts          fetch / worktree / merge simulation / change-set collection
  pr.ts           gh PR metadata (read-only) + merge-base resolution
  diff.ts         name-status + added-line parsers (pure)
  checks.ts       whitelisted pnpm gates runner
  report.ts       verdict + report assembly (pure)
  rules/          migrations, api-contracts, business-rules (pure) + __tests__
  tools/          one file per MCP tool
  __tests__/      diff/exec/redact/report/registry + merge-sim integration test
```
