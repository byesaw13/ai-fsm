import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pExecFile = promisify(execFile);

export interface RunResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Command whitelist. Only these executables may run, and only with an allowed
 * first subcommand. This is the gatekeeper's hard boundary: nothing derived
 * from PR text is ever used as a command, and no shell is involved (execFile,
 * argv array — no interpolation, no globbing).
 */
const ALLOWED: Record<string, Set<string>> = {
  git: new Set([
    "version",
    "rev-parse",
    "merge-base",
    "fetch",
    "diff",
    "show",
    "log",
    "status",
    "ls-tree",
    "ls-files",
    "cat-file",
    "symbolic-ref",
    "worktree",
    "merge",
  ]),
  gh: new Set(["pr"]),
  pnpm: new Set(["install", "typecheck", "lint", "test", "build"]),
};

// `gh pr` is read-only; restrict to inspection subcommands.
const GH_PR_ALLOWED = new Set(["view", "diff"]);

// Arguments are constructed by the gatekeeper from trusted sources (git's own
// output, a validated integer PR number, a validated hex SHA, and the literal
// "origin/main") — never raw PR text — and run via execFile with NO shell, so
// shell metacharacters are inert. Real-world paths legitimately contain
// parentheses and brackets (Next.js route groups like `(auth)` and dynamic
// segments like `[id]`). The only thing we reject here is ASCII control
// characters, which have no business in a path or ref.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export class DisallowedCommandError extends Error {}

export function assertAllowed(file: string, args: string[]): void {
  const subcommands = ALLOWED[file];
  if (!subcommands) {
    throw new DisallowedCommandError(`command not allowed: ${file}`);
  }
  const sub = args[0];
  if (!sub || !subcommands.has(sub)) {
    throw new DisallowedCommandError(`subcommand not allowed: ${file} ${sub ?? ""}`.trim());
  }
  if (file === "gh" && sub === "pr") {
    const ghSub = args[1];
    if (!ghSub || !GH_PR_ALLOWED.has(ghSub)) {
      throw new DisallowedCommandError(`gh pr subcommand not allowed: ${ghSub ?? ""}`.trim());
    }
  }
  for (const arg of args) {
    if (CONTROL_CHARS.test(arg)) {
      throw new DisallowedCommandError("control characters in argument rejected");
    }
  }
}

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

/**
 * Run a whitelisted command. Throws {@link DisallowedCommandError} before
 * spawning anything if the command is not allowed; otherwise resolves with the
 * result (a non-zero exit is reported via `ok: false`, not thrown).
 */
export async function runAllowed(
  file: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  assertAllowed(file, args);
  try {
    const { stdout, stderr } = await pExecFile(file, args, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? 120_000,
      maxBuffer: 32 * 1024 * 1024,
      env: opts.env ?? process.env,
    });
    return { ok: true, code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code?: number | string; stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      code: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "",
    };
  }
}
