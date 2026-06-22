import { describe, it, expect } from "vitest";
import { assertAllowed, DisallowedCommandError } from "../exec.js";

describe("assertAllowed — command whitelist", () => {
  it("allows whitelisted commands", () => {
    expect(() => assertAllowed("git", ["fetch", "origin", "main"])).not.toThrow();
    expect(() => assertAllowed("git", ["worktree", "add", "--detach", "/tmp/x", "origin/main"])).not.toThrow();
    expect(() => assertAllowed("pnpm", ["install", "--frozen-lockfile"])).not.toThrow();
    expect(() => assertAllowed("gh", ["pr", "view", "359", "--json", "number,title"])).not.toThrow();
  });

  it("rejects unknown executables", () => {
    expect(() => assertAllowed("rm", ["-rf", "/"])).toThrow(DisallowedCommandError);
    expect(() => assertAllowed("bash", ["-c", "echo hi"])).toThrow(DisallowedCommandError);
    expect(() => assertAllowed("curl", ["http://x"])).toThrow(DisallowedCommandError);
  });

  it("rejects disallowed subcommands", () => {
    expect(() => assertAllowed("git", ["push", "origin", "main"])).toThrow(DisallowedCommandError);
    expect(() => assertAllowed("git", ["commit", "-m", "x"])).toThrow(DisallowedCommandError);
    expect(() => assertAllowed("pnpm", ["publish"])).toThrow(DisallowedCommandError);
    expect(() => assertAllowed("gh", ["pr", "merge", "1"])).toThrow(DisallowedCommandError);
    expect(() => assertAllowed("gh", ["api", "/repos"])).toThrow(DisallowedCommandError);
  });

  it("rejects arguments containing control characters", () => {
    expect(() => assertAllowed("git", ["show", "abc:path\nwith-newline"])).toThrow(DisallowedCommandError);
    expect(() => assertAllowed("git", ["show", "abc:path\u0000nul"])).toThrow(DisallowedCommandError);
  });

  it("allows real-world paths with parentheses and brackets (no shell is used)", () => {
    // Next.js route groups and dynamic segments are legitimate file paths.
    expect(() =>
      assertAllowed("git", ["diff", "a..b", "--", "apps/web/app/(auth)/login/route.ts"]),
    ).not.toThrow();
    expect(() =>
      assertAllowed("git", ["show", "abc123:apps/web/app/api/v1/estimates/[id]/route.ts"]),
    ).not.toThrow();
  });
});
