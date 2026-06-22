import { z } from "zod";
import { getRepoRoot } from "../config.js";
import { createMergedWorktree } from "../git.js";
import { preparePr } from "../pr.js";
import { CHECK_ORDER, runRepoChecks, type CheckName } from "../checks.js";
import type { ToolModule } from "./types.js";

const inputShape = {
  pr_number: z.number().int().positive().describe("GitHub PR number"),
  checks: z
    .array(z.enum(["install", "typecheck", "lint", "test", "build"]))
    .optional()
    .describe("Subset of checks to run (default: all, in order)."),
};
const schema = z.object(inputShape);

export async function run(input: unknown): Promise<unknown> {
  const { pr_number, checks } = schema.parse(input);
  const selected = (checks && checks.length > 0 ? checks : CHECK_ORDER) as CheckName[];

  const repoRoot = await getRepoRoot();
  const prep = await preparePr(repoRoot, pr_number);
  const wt = await createMergedWorktree(repoRoot, "origin/main", prep.headSha);
  try {
    if (!wt.clean) {
      return {
        pr: { number: prep.meta.number },
        ran: false,
        reason: "Merge into origin/main is not clean; resolve conflicts first.",
        conflicted_files: wt.conflictedFiles,
      };
    }
    const results = await runRepoChecks(wt.dir, selected);
    return {
      pr: { number: prep.meta.number },
      ran: true,
      all_passed: results.length > 0 && results.every((r) => r.ok),
      results,
    };
  } finally {
    await wt.cleanup();
  }
}

export const tool: ToolModule = {
  name: "run_repo_checks",
  title: "Run repo checks",
  description:
    "Merge the PR into origin/main in a temp worktree and run the whitelisted gates (pnpm install --frozen-lockfile, typecheck, lint, test, build). Returns pass/fail with redacted output tails. Heavy — runs a real install/build.",
  inputShape,
  run,
};

export default tool;
