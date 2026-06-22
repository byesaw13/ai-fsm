import { z } from "zod";
import { getRepoRoot } from "../config.js";
import { simulateMergeRefs } from "../git.js";
import { preparePr } from "../pr.js";
import type { ToolModule } from "./types.js";

const inputShape = {
  pr_number: z.number().int().positive().describe("GitHub PR number"),
};
const schema = z.object(inputShape);

export async function run(input: unknown): Promise<unknown> {
  const { pr_number } = schema.parse(input);
  const repoRoot = await getRepoRoot();
  const prep = await preparePr(repoRoot, pr_number);

  // Merge happens in a throwaway worktree; the active working tree is untouched.
  const sim = await simulateMergeRefs(repoRoot, "origin/main", prep.headSha);

  return {
    pr: { number: prep.meta.number, title: prep.meta.title },
    simulated_against: "origin/main",
    head_sha: prep.headSha,
    clean: sim.clean,
    conflicted_files: sim.conflictedFiles,
    note: sim.clean
      ? "Merges cleanly into latest origin/main."
      : "Merge conflicts detected; resolve before merging.",
  };
}

export const tool: ToolModule = {
  name: "simulate_merge_to_main",
  title: "Simulate merge to main",
  description:
    "Fetch latest origin/main and attempt to merge the PR head into it inside a temporary git worktree (never the active tree). Reports whether the merge is clean and lists any conflicted files.",
  inputShape,
  run,
};

export default tool;
