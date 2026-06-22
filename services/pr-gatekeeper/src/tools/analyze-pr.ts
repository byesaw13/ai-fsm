import { z } from "zod";
import { loadChangeset } from "./shared.js";
import type { ToolModule } from "./types.js";

const inputShape = {
  pr_number: z.number().int().positive().describe("GitHub PR number"),
};
const schema = z.object(inputShape);

export async function run(input: unknown): Promise<unknown> {
  const { pr_number } = schema.parse(input);
  const { prep, changed, allMigrationFiles } = await loadChangeset(pr_number);
  const { meta } = prep;

  return {
    pr: {
      number: meta.number,
      title: meta.title,
      state: meta.state,
      base_ref: meta.baseRef,
      head_ref: meta.headRef,
      head_sha: meta.headSha,
      cross_repository: meta.isCrossRepository,
    },
    base_sha: prep.baseSha,
    counts: {
      files_changed: changed.length,
      additions: meta.additions,
      deletions: meta.deletions,
      migrations_changed: allMigrationFiles.length === 0 ? 0 : changed.filter((f) =>
        f.path.startsWith("db/migrations/"),
      ).length,
    },
    files_changed: changed.map((f) => ({ path: f.path, status: f.status })),
  };
}

export const tool: ToolModule = {
  name: "analyze_pr",
  title: "Analyze PR",
  description:
    "Fetch latest origin/main and summarize a PR: title, base/head refs, head SHA, and the list of changed files (read-only).",
  inputShape,
  run,
};

export default tool;
