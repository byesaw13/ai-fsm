import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAllowed } from "./exec.js";
import { parseAddedLines, parseNameStatus } from "./diff.js";
import type { ChangedFile } from "./types.js";

/** Resolve the top level of the git repo containing `dir`. */
export async function resolveRepoRoot(dir: string): Promise<string> {
  const res = await runAllowed("git", ["rev-parse", "--show-toplevel"], { cwd: dir });
  if (!res.ok) throw new Error(`not a git repository: ${dir}`);
  return res.stdout.trim();
}

/** Fetch the latest origin/main. Always called before any analysis. */
export async function fetchMain(repoRoot: string): Promise<void> {
  const res = await runAllowed("git", ["fetch", "origin", "main"], { cwd: repoRoot, timeoutMs: 60_000 });
  if (!res.ok) throw new Error(`git fetch origin main failed: ${res.stderr.trim()}`);
}

/** Fetch an arbitrary refspec (e.g. a PR head). Best-effort; returns success. */
export async function fetchRefspec(repoRoot: string, refspec: string): Promise<boolean> {
  const res = await runAllowed("git", ["fetch", "origin", refspec], { cwd: repoRoot, timeoutMs: 60_000 });
  return res.ok;
}

export async function revParse(repoRoot: string, ref: string): Promise<string> {
  const res = await runAllowed("git", ["rev-parse", ref], { cwd: repoRoot });
  if (!res.ok) throw new Error(`git rev-parse ${ref} failed: ${res.stderr.trim()}`);
  return res.stdout.trim();
}

export async function mergeBase(repoRoot: string, a: string, b: string): Promise<string> {
  const res = await runAllowed("git", ["merge-base", a, b], { cwd: repoRoot });
  if (!res.ok) throw new Error(`git merge-base failed: ${res.stderr.trim()}`);
  return res.stdout.trim();
}

export async function nameStatus(repoRoot: string, range: string) {
  const res = await runAllowed("git", ["diff", "--name-status", range], { cwd: repoRoot });
  if (!res.ok) throw new Error(`git diff --name-status failed: ${res.stderr.trim()}`);
  return parseNameStatus(res.stdout);
}

export async function unifiedDiff(repoRoot: string, range: string, path: string): Promise<string> {
  const res = await runAllowed("git", ["diff", range, "--", path], { cwd: repoRoot });
  return res.ok ? res.stdout : "";
}

/** Content of a file at a ref, or null if it does not exist there. */
export async function fileAtRef(repoRoot: string, ref: string, path: string): Promise<string | null> {
  const res = await runAllowed("git", ["show", `${ref}:${path}`], { cwd: repoRoot });
  return res.ok ? res.stdout : null;
}

/** All file paths under `dir` at `ref`. */
export async function listFilesUnder(repoRoot: string, ref: string, dir: string): Promise<string[]> {
  const res = await runAllowed("git", ["ls-tree", "-r", "--name-only", ref, "--", dir], { cwd: repoRoot });
  if (!res.ok) return [];
  return res.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
}

/**
 * Build the structured per-file change set between two commits (added lines +
 * post-merge content), used by the rule checks. Pure git reads — no worktree.
 */
export async function collectChangedFiles(
  repoRoot: string,
  baseSha: string,
  headSha: string,
): Promise<ChangedFile[]> {
  const range = `${baseSha}..${headSha}`;
  const entries = await nameStatus(repoRoot, range);
  const files: ChangedFile[] = [];
  for (const entry of entries) {
    const addedLines =
      entry.status === "D" ? [] : parseAddedLines(await unifiedDiff(repoRoot, range, entry.path));
    const content = entry.status === "D" ? "" : (await fileAtRef(repoRoot, headSha, entry.path)) ?? "";
    files.push({ path: entry.path, status: entry.status, addedLines, content });
  }
  return files;
}

export interface MergedWorktree {
  dir: string;
  clean: boolean;
  conflictedFiles: string[];
  /** Removes the temp worktree and its directory. Safe to call multiple times. */
  cleanup: () => Promise<void>;
}

/**
 * Create a temporary git worktree checked out at `baseRef` and attempt to merge
 * `headRef` into it WITHOUT committing. The user's active working tree is never
 * touched — all changes live under a fresh temp directory.
 *
 * Callers MUST call `cleanup()` (typically in a finally block).
 */
export async function createMergedWorktree(
  repoRoot: string,
  baseRef: string,
  headRef: string,
): Promise<MergedWorktree> {
  const base = await mkdtemp(join(tmpdir(), "dovetails-gatekeeper-"));
  const dir = join(base, "wt");

  let removed = false;
  const cleanup = async () => {
    if (removed) return;
    removed = true;
    // Abort an in-progress merge, drop the worktree, then delete the temp dir.
    await runAllowed("git", ["merge", "--abort"], { cwd: dir }).catch(() => undefined);
    await runAllowed("git", ["worktree", "remove", "--force", dir], { cwd: repoRoot }).catch(
      () => undefined,
    );
    await rm(base, { recursive: true, force: true }).catch(() => undefined);
  };

  try {
    const add = await runAllowed("git", ["worktree", "add", "--detach", dir, baseRef], {
      cwd: repoRoot,
    });
    if (!add.ok) {
      await cleanup();
      throw new Error(`git worktree add failed: ${add.stderr.trim()}`);
    }

    const merge = await runAllowed("git", ["merge", "--no-ff", "--no-commit", headRef], { cwd: dir });
    if (merge.ok) {
      return { dir, clean: true, conflictedFiles: [], cleanup };
    }

    const conflicts = await runAllowed("git", ["diff", "--name-only", "--diff-filter=U"], {
      cwd: dir,
    });
    const conflictedFiles = conflicts.ok
      ? conflicts.stdout.split("\n").map((s) => s.trim()).filter(Boolean)
      : [];
    return { dir, clean: false, conflictedFiles, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/** Convenience: simulate a merge and clean up immediately. */
export async function simulateMergeRefs(
  repoRoot: string,
  baseRef: string,
  headRef: string,
): Promise<{ clean: boolean; conflictedFiles: string[] }> {
  const wt = await createMergedWorktree(repoRoot, baseRef, headRef);
  try {
    return { clean: wt.clean, conflictedFiles: wt.conflictedFiles };
  } finally {
    await wt.cleanup();
  }
}
