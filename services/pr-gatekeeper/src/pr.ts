import { runAllowed } from "./exec.js";
import { collectChangedFiles, fetchMain, fetchRefspec, mergeBase, revParse } from "./git.js";
import type { ChangedFile, PrMeta } from "./types.js";

const SHA_RE = /^[0-9a-f]{7,40}$/;

/** Validate a PR number (positive integer) and return it, or throw. */
export function parsePrNumber(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`invalid PR number: ${value}`);
  }
  return value;
}

interface GhPrJson {
  number: number;
  title: string;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  state: string;
  isCrossRepository: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
}

/** Fetch PR metadata via the GitHub CLI (read-only). */
export async function getPrMeta(repoRoot: string, prNumber: number): Promise<PrMeta> {
  const n = parsePrNumber(prNumber);
  const fields =
    "number,title,baseRefName,headRefName,headRefOid,state,isCrossRepository,additions,deletions,changedFiles";
  const res = await runAllowed("gh", ["pr", "view", String(n), "--json", fields], { cwd: repoRoot });
  if (!res.ok) {
    throw new Error(`gh pr view ${n} failed: ${res.stderr.trim() || "is the GitHub CLI authenticated?"}`);
  }
  let json: GhPrJson;
  try {
    json = JSON.parse(res.stdout) as GhPrJson;
  } catch {
    throw new Error(`could not parse gh pr view output for #${n}`);
  }
  if (!SHA_RE.test(json.headRefOid)) {
    throw new Error(`unexpected head sha for PR #${n}`);
  }
  return {
    number: json.number,
    title: json.title,
    baseRef: json.baseRefName,
    headRef: json.headRefName,
    headSha: json.headRefOid,
    state: json.state,
    isCrossRepository: json.isCrossRepository,
    additions: json.additions,
    deletions: json.deletions,
    changedFiles: json.changedFiles,
  };
}

export interface PreparedPr {
  meta: PrMeta;
  baseSha: string;
  headSha: string;
}

/**
 * Fetch latest origin/main and the PR head, then resolve the merge base. Works
 * for fork PRs because the PR head is fetched via `pull/<n>/head`.
 */
export async function preparePr(repoRoot: string, prNumber: number): Promise<PreparedPr> {
  await fetchMain(repoRoot);
  const meta = await getPrMeta(repoRoot, prNumber);
  // Make the head commit available locally even for cross-repo PRs.
  await fetchRefspec(repoRoot, `pull/${meta.number}/head`);
  const headSha = meta.headSha;
  // Ensure the object exists locally; rev-parse throws otherwise.
  await revParse(repoRoot, headSha);
  const baseSha = await mergeBase(repoRoot, "origin/main", headSha);
  return { meta, baseSha, headSha };
}

export async function changedFilesForPr(prep: PreparedPr, repoRoot: string): Promise<ChangedFile[]> {
  return collectChangedFiles(repoRoot, prep.baseSha, prep.headSha);
}
