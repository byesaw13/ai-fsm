/**
 * Integration test for the merge simulation.
 *
 * Builds a throwaway git repo with a `main` branch and two feature branches —
 * one that merges cleanly, one that conflicts — and verifies:
 *   - clean merges are reported clean;
 *   - conflicts are detected with the conflicted file listed;
 *   - the simulation runs in a temp worktree and NEVER mutates the active
 *     working tree (the repo's checked-out file is unchanged afterward).
 *
 * Uses only git (no gh / pnpm), so it is safe to run anywhere git exists.
 * Not gated on TEST_DATABASE_URL; it provisions its own repo.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAllowed } from "../exec.js";
import { createMergedWorktree, simulateMergeRefs } from "../git.js";

// Local helper: run git in the test repo (test setup only — not the whitelist).
async function git(cwd: string, args: string[]): Promise<void> {
  const res = await runAllowed("git", args, { cwd }).catch(() => null);
  // Some setup commands (commit/checkout/branch) are not on the gatekeeper
  // whitelist by design; fall back to a direct spawn for those.
  if (res && res.ok) return;
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  await promisify(execFile)("git", args, { cwd });
}

describe("merge simulation (real temp git repo)", () => {
  let repo: string;

  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), "gatekeeper-itest-"));
    await git(repo, ["init", "-b", "main"]);
    await git(repo, ["config", "user.email", "t@t.com"]);
    await git(repo, ["config", "user.name", "Test"]);

    await writeFile(join(repo, "file.txt"), "line1\nline2\nline3\n");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "base"]);

    // Clean branch: adds a new file, no overlap with main.
    await git(repo, ["checkout", "-b", "feature-clean"]);
    await writeFile(join(repo, "new.txt"), "brand new\n");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "add new file"]);

    // Conflict branch: edits line2 of file.txt.
    await git(repo, ["checkout", "main"]);
    await git(repo, ["checkout", "-b", "feature-conflict"]);
    await writeFile(join(repo, "file.txt"), "line1\nCONFLICT-BRANCH\nline3\n");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "edit line2 on branch"]);

    // main also edits line2 differently → guarantees a conflict.
    await git(repo, ["checkout", "main"]);
    await writeFile(join(repo, "file.txt"), "line1\nMAIN-EDIT\nline3\n");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "edit line2 on main"]);
  });

  afterAll(async () => {
    if (repo) await rm(repo, { recursive: true, force: true });
  });

  it("reports a clean merge", async () => {
    const result = await simulateMergeRefs(repo, "main", "feature-clean");
    expect(result.clean).toBe(true);
    expect(result.conflictedFiles).toEqual([]);
  });

  it("detects a conflict and names the conflicted file", async () => {
    const result = await simulateMergeRefs(repo, "main", "feature-conflict");
    expect(result.clean).toBe(false);
    expect(result.conflictedFiles).toContain("file.txt");
  });

  it("never mutates the active working tree and cleans up the worktree", async () => {
    const before = await readFile(join(repo, "file.txt"), "utf8");
    const beforeEntries = (await readdir(repo)).sort();

    const wt = await createMergedWorktree(repo, "main", "feature-conflict");
    expect(wt.clean).toBe(false);
    // The temp worktree exists and is separate from the repo dir.
    expect(wt.dir.startsWith(repo)).toBe(false);
    await wt.cleanup();

    const after = await readFile(join(repo, "file.txt"), "utf8");
    const afterEntries = (await readdir(repo)).sort();

    // Active checkout is byte-for-byte unchanged (still main's version).
    expect(after).toBe(before);
    expect(after).toContain("MAIN-EDIT");
    expect(afterEntries).toEqual(beforeEntries);

    // No leftover worktrees registered.
    const list = await runAllowed("git", ["worktree", "list"], { cwd: repo });
    expect(list.stdout.split("\n").filter((l) => l.trim()).length).toBe(1);
  });
});
