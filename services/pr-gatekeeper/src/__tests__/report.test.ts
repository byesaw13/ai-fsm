import { describe, it, expect } from "vitest";
import { buildReport, decideMergeable, splitFindings, suggestNextAction } from "../report.js";
import type { Finding, MergeSimulation, PrMeta } from "../types.js";

const META: PrMeta = {
  number: 1,
  title: "Test",
  baseRef: "main",
  headRef: "feature",
  headSha: "abc1234",
  state: "OPEN",
  isCrossRepository: false,
  additions: 1,
  deletions: 0,
  changedFiles: 1,
};

const cleanSim: MergeSimulation = { attempted: true, clean: true, conflictedFiles: [] };

describe("splitFindings", () => {
  it("separates blocking from warnings", () => {
    const findings: Finding[] = [
      { rule: "a", severity: "blocking", message: "x" },
      { rule: "b", severity: "warning", message: "y" },
    ];
    const { blocking, warnings } = splitFindings(findings);
    expect(blocking).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });
});

describe("decideMergeable", () => {
  it("is yes only when sim clean, no blocking, and checks ran + passed", () => {
    expect(decideMergeable({ simAttempted: true, simClean: true, blockingCount: 0, checksRun: true, checksOk: true })).toBe(true);
  });
  it("is no on conflict", () => {
    expect(decideMergeable({ simAttempted: true, simClean: false, blockingCount: 0, checksRun: true, checksOk: true })).toBe(false);
  });
  it("is no with blocking findings", () => {
    expect(decideMergeable({ simAttempted: true, simClean: true, blockingCount: 1, checksRun: true, checksOk: true })).toBe(false);
  });
  it("is no when checks were not run", () => {
    expect(decideMergeable({ simAttempted: true, simClean: true, blockingCount: 0, checksRun: false, checksOk: false })).toBe(false);
  });
});

describe("suggestNextAction", () => {
  it("prioritizes conflicts, then blocking, then checks", () => {
    expect(
      suggestNextAction({ attempted: true, clean: false, conflictedFiles: ["a"] }, [], [], true, []),
    ).toMatch(/conflict/i);
    expect(
      suggestNextAction(cleanSim, [{ rule: "r", severity: "blocking", message: "m" }], [], true, []),
    ).toMatch(/blocking/i);
    expect(suggestNextAction(cleanSim, [], [], false, [])).toMatch(/run_repo_checks/);
    expect(
      suggestNextAction(cleanSim, [], [], true, [{ command: "pnpm test", ok: false, summary: "" }]),
    ).toMatch(/failing checks/i);
  });
});

describe("buildReport", () => {
  it("produces a mergeable=yes report when all green", () => {
    const report = buildReport({
      meta: META,
      simulation: cleanSim,
      findings: [{ rule: "w", severity: "warning", message: "minor" }],
      changed: [{ path: "a.ts", status: "M", addedLines: [], content: "" }],
      checksRun: true,
      checkResults: [{ command: "pnpm test", ok: true, summary: "ok" }],
    });
    expect(report.mergeable).toBe(true);
    expect(report.verdict).toBe("yes");
    expect(report.warnings).toHaveLength(1);
    expect(report.blocking_issues).toHaveLength(0);
    expect(report.files_changed).toEqual([{ path: "a.ts", status: "M" }]);
  });

  it("produces mergeable=no when a check fails", () => {
    const report = buildReport({
      meta: META,
      simulation: cleanSim,
      findings: [],
      changed: [],
      checksRun: true,
      checkResults: [{ command: "pnpm typecheck", ok: false, summary: "error" }],
    });
    expect(report.mergeable).toBe(false);
    expect(report.verdict).toBe("no");
    expect(report.suggested_next_action).toMatch(/pnpm typecheck/);
  });
});
