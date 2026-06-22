import { getRepoRoot } from "../config.js";
import { listFilesUnder } from "../git.js";
import { changedFilesForPr, preparePr, type PreparedPr } from "../pr.js";
import type { ChangedFile } from "../types.js";

export interface Changeset {
  repoRoot: string;
  prep: PreparedPr;
  changed: ChangedFile[];
  allMigrationFiles: string[];
}

/**
 * Common preamble for tools that inspect a PR: resolve the repo, fetch latest
 * origin/main + the PR head, and build the structured change set. Read-only.
 */
export async function loadChangeset(prNumber: number): Promise<Changeset> {
  const repoRoot = await getRepoRoot();
  const prep = await preparePr(repoRoot, prNumber);
  const changed = await changedFilesForPr(prep, repoRoot);
  const allMigrationFiles = await listFilesUnder(repoRoot, prep.headSha, "db/migrations");
  return { repoRoot, prep, changed, allMigrationFiles };
}
