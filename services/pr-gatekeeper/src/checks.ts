import { runAllowed } from "./exec.js";
import { redactTail } from "./redact.js";
import type { CheckResult } from "./types.js";

export type CheckName = "install" | "typecheck" | "lint" | "test" | "build";

export const CHECK_ORDER: CheckName[] = ["install", "typecheck", "lint", "test", "build"];

const CHECK_ARGS: Record<CheckName, string[]> = {
  install: ["install", "--frozen-lockfile"],
  typecheck: ["typecheck"],
  lint: ["lint"],
  test: ["test"],
  build: ["build"],
};

/**
 * Run the requested repo checks (a whitelisted subset of pnpm scripts) inside a
 * prepared worktree. `install` runs first; if it fails the rest are skipped
 * because nothing else can run without node_modules.
 */
export async function runRepoChecks(
  worktreeDir: string,
  selected: CheckName[] = CHECK_ORDER,
  timeoutMs = 600_000,
): Promise<CheckResult[]> {
  const ordered = CHECK_ORDER.filter((c) => selected.includes(c));
  const results: CheckResult[] = [];
  for (const check of ordered) {
    const args = CHECK_ARGS[check];
    const res = await runAllowed("pnpm", args, { cwd: worktreeDir, timeoutMs });
    results.push({
      command: `pnpm ${args.join(" ")}`,
      ok: res.ok,
      summary: redactTail(`${res.stdout}\n${res.stderr}`, 15),
    });
    if (!res.ok && check === "install") break;
  }
  return results;
}
