# PR Gatekeeper MCP Server (local, read-only)

A local [Model Context Protocol](https://modelcontextprotocol.io) server that
answers one question before you merge: **"is this PR safe to merge into the
latest `main`?"** It fetches `origin/main`, simulates the merge in a throwaway
git worktree, runs the repo's gates, applies Dovetails-specific rule checks, and
returns a single structured verdict.

- **Package:** `services/pr-gatekeeper` (`@ai-fsm/pr-gatekeeper`)
- **Transport:** stdio (the client launches the process)
- **Scope:** read-only — it advises a human; it never edits, commits, pushes, or
  merges, and it never writes to GitHub.

## Safety model

- **Read-only against GitHub.** Only `gh pr view` / `gh pr diff` run — no writes
  to labels, reviews, statuses, or the PR itself.
- **Never mutates your working tree.** All merge/checkout work happens in a
  temporary `git worktree` under the OS temp dir. `git fetch` only updates remote
  refs. The integration test asserts the active checkout is byte-for-byte
  unchanged after a simulation.
- **No commits, pushes, or merges.** The simulated merge uses
  `git merge --no-ff --no-commit` inside the temp worktree and is always aborted
  and removed afterward.
- **Whitelisted commands only.** A hard allowlist permits specific subcommands of
  `git`, `gh`, and `pnpm` and nothing else. Commands run via `execFile` with an
  argv array (no shell), so shell metacharacters are inert. Nothing derived from
  PR text is ever used as a command; the PR number is validated as an integer and
  the head SHA as hex.
- **Secrets redacted.** Any captured command output is passed through a redactor
  (GitHub tokens, `postgres://user:pass@…`, `*_TOKEN`/`*_SECRET`/`*_KEY=…`) before
  being returned. The server logs to stderr only.

## Tools

| Tool | What it does |
| --- | --- |
| `analyze_pr` | Fetch latest `origin/main`; summarize the PR (refs, head SHA, changed files). |
| `simulate_merge_to_main` | Merge the PR head into `origin/main` in a temp worktree; report clean / conflicted files. |
| `run_repo_checks` | In the merged worktree, run the whitelisted gates and report pass/fail. |
| `check_migrations` | Duplicate migration numbers (blocking); destructive statements like DROP/TRUNCATE/DELETE (warning; SQL comments ignored). |
| `check_changed_api_contracts` | API route changed without an accompanying test or client change (warning). |
| `check_dovetails_business_rules` | Payment/invoice/Square change without tests (blocking); new SQL on account-scoped tables without `account_id`/RLS scoping (warning); mutating route missing `withRole`/`withAuth` (blocking). |
| `generate_merge_report` | Orchestrates all of the above into one report. |

### Repo checks (`run_repo_checks` / `generate_merge_report`)

Run in order inside the merged worktree; `install` first (the rest are skipped if
it fails):

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Pass a `checks` subset to skip the slow ones (e.g. `["typecheck","lint","test"]`).

### Merge report shape

`generate_merge_report` returns:

```jsonc
{
  "pr": { "number": 359, "title": "...", "baseRef": "main", "headRef": "...", "headSha": "..." },
  "mergeable": true,
  "verdict": "yes",
  "merge_simulation": { "attempted": true, "clean": true, "conflictedFiles": [] },
  "blocking_issues": [],
  "warnings": [ { "rule": "...", "severity": "warning", "message": "...", "file": "..." } ],
  "checks": { "run": true, "results": [ { "command": "pnpm typecheck", "ok": true, "summary": "..." } ] },
  "files_changed": [ { "path": "...", "status": "M" } ],
  "suggested_next_action": "Mergeable — no blocking issues or failing checks."
}
```

`mergeable` is `true` only when the merge is clean, there are no blocking issues,
**and** the repo checks were run and all passed. With `run_checks: false` the
report stays conservative (`verdict: "no"`, next action: run the checks).

## Configuration

| Env var | Required | Notes |
| --- | --- | --- |
| (none) | — | Operates on the current working directory's git repo by default. |
| `GATEKEEPER_REPO_DIR` | no | Absolute path to the repo to inspect, if not the cwd. |
| `LOG_LEVEL` | no | `debug`/`info`/`warn`/`error` (default `info`). Logs to **stderr**. |

The GitHub CLI (`gh`) must be installed and authenticated (`gh auth status`) for
the PR-metadata tools. `git` and `pnpm` must be on `PATH`.

## Run locally

```bash
pnpm --filter @ai-fsm/pr-gatekeeper build

# point it at this repo (default) and start the stdio server
node services/pr-gatekeeper/dist/index.js
```

## Claude Desktop / CLI setup

Build first, then add a server entry with an absolute path. Claude Desktop config
(`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "dovetails-pr-gatekeeper": {
      "command": "node",
      "args": ["/absolute/path/to/ai-fsm-deploy-clean/services/pr-gatekeeper/dist/index.js"],
      "env": { "GATEKEEPER_REPO_DIR": "/absolute/path/to/ai-fsm-deploy-clean" }
    }
  }
}
```

Claude CLI:

```bash
claude mcp add dovetails-pr-gatekeeper \
  --env GATEKEEPER_REPO_DIR=/absolute/path/to/ai-fsm-deploy-clean \
  -- node /absolute/path/to/services/pr-gatekeeper/dist/index.js
```

Then ask: *"Run the gatekeeper on PR 359 and tell me if it's safe to merge."*

## Tests

```bash
pnpm --filter @ai-fsm/pr-gatekeeper test            # unit (rule checks, diff, exec, redact, report)
pnpm --filter @ai-fsm/pr-gatekeeper test:integration # builds a temp git repo, verifies merge simulation
pnpm --filter @ai-fsm/pr-gatekeeper typecheck
pnpm --filter @ai-fsm/pr-gatekeeper lint
```

The rule checks are pure functions over a parsed change set, unit tested in
`src/rules/__tests__`. The integration test (`src/__tests__/merge-sim.integration.test.ts`)
needs only `git` (no `gh`/`pnpm`/DB): it builds a repo with clean and conflicting
branches and asserts the simulation reports correctly and leaves the active tree
untouched.

## Limitations

- Rule checks are heuristic and conservative. The SQL-scoping and API-contract
  checks are warnings by design; treat blocking findings (duplicate migrations,
  missing route guards, money changes without tests) as the hard gates.
- `run_repo_checks` performs a real `pnpm install` + `build` in a temp worktree —
  it is slow and uses disk. Use the `checks` subset for a fast pass.

## Not in this phase (intentionally deferred)

- Writing to GitHub (PR comments, labels, review statuses).
- Auto-fixing findings or gating CI.
