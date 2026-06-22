import { z } from "zod";
import { createMergedWorktree } from "../git.js";
import { runAllRules } from "../rules/index.js";
import { runRepoChecks, CHECK_ORDER, type CheckName } from "../checks.js";
import { buildReport } from "../report.js";
import { loadChangeset } from "./shared.js";
import type { CheckResult, MergeSimulation } from "../types.js";
import type { ToolModule } from "./types.js";

const inputShape = {
  pr_number: z.number().int().positive().describe("GitHub PR number"),
  run_checks: z
    .boolean()
    .default(true)
    .describe("Run pnpm install/typecheck/lint/test/build in the merged worktree (default true)."),
  checks: z
    .array(z.enum(["install", "typecheck", "lint", "test", "build"]))
    .optional()
    .describe("Subset of checks to run when run_checks is true (default: all)."),
};
const schema = z.object(inputShape);

export async function run(input: unknown): Promise<unknown> {
  const { pr_number, run_checks, checks } = schema.parse(input);
  const { repoRoot, prep, changed, allMigrationFiles } = await loadChangeset(pr_number);

  const findings = runAllRules({ changed, allMigrationFiles });

  // One worktree serves both the merge simulation and (optionally) the checks.
  const wt = await createMergedWorktree(repoRoot, "origin/main", prep.headSha);
  let checkResults: CheckResult[] = [];
  let checksRun = false;
  let simulation: MergeSimulation;
  try {
    simulation = { attempted: true, clean: wt.clean, conflictedFiles: wt.conflictedFiles };
    if (run_checks && wt.clean) {
      const selected = (checks && checks.length > 0 ? checks : CHECK_ORDER) as CheckName[];
      checkResults = await runRepoChecks(wt.dir, selected);
      checksRun = true;
    }
  } finally {
    await wt.cleanup();
  }

  return buildReport({
    meta: prep.meta,
    simulation,
    findings,
    changed,
    checksRun,
    checkResults,
  });
}

export const tool: ToolModule = {
  name: "generate_merge_report",
  title: "Generate merge report",
  description:
    "End-to-end gatekeeper: fetch origin/main, simulate the merge in a temp worktree, run the rule checks, optionally run the repo gates, and return a single report — Mergeable yes/no, blocking issues, warnings, checks run, files changed, and a suggested next action.",
  inputShape,
  run,
};

export default tool;
