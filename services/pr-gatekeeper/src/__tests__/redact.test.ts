import { describe, it, expect } from "vitest";
import { redact, redactTail } from "../redact.js";

describe("redact", () => {
  it("masks GitHub tokens", () => {
    expect(redact("token ghp_" + "a".repeat(36))).toContain("[REDACTED_GH_TOKEN]");
    expect(redact("github_pat_" + "b".repeat(30))).toContain("[REDACTED_GH_PAT]");
  });

  it("masks the password in a postgres URL but keeps the user", () => {
    const out = redact("postgres://ai_fsm:supersecret@db:5432/app");
    expect(out).toContain("postgres://ai_fsm:[REDACTED]@");
    expect(out).not.toContain("supersecret");
  });

  it("masks KEY=value for sensitive key names", () => {
    expect(redact("AUTH_SECRET=hunter2")).toBe("AUTH_SECRET=[REDACTED]");
    expect(redact("APP_ENCRYPTION_KEY: abcd1234")).toContain("[REDACTED]");
    expect(redact("SQUARE_ACCESS_TOKEN=xyz")).toContain("[REDACTED]");
  });

  it("leaves non-secret text alone", () => {
    expect(redact("typecheck passed in 4s")).toBe("typecheck passed in 4s");
  });

  it("redactTail keeps the last N lines", () => {
    const text = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
    const out = redactTail(text, 5);
    expect(out.startsWith("…(truncated)…")).toBe(true);
    expect(out).toContain("line 29");
    expect(out).not.toContain("line 10");
  });
});
