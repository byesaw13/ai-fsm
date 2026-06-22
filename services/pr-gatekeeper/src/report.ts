import type {
  ChangedFile,
  CheckResult,
  Finding,
  MergeReport,
  MergeSimulation,
  PrMeta,
} from "./types.js";

export function splitFindings(findings: Finding[]): { blocking: Finding[]; warnings: Finding[] } {
  return {
    blocking: findings.filter((f) => f.severity === "blocking"),
    warnings: findings.filter((f) => f.severity === "warning"),
  };
}

export interface MergeableInput {
  simAttempted: boolean;
  simClean: boolean;
  blockingCount: number;
  checksRun: boolean;
  checksOk: boolean;
}

/**
 * A PR is mergeable only when: the merge simulation was attempted and clean,
 * there are no blocking findings, and the repo checks were run and all passed.
 * If checks were not run, we deliberately do NOT call it mergeable — the report
 * stays conservative.
 */
export function decideMergeable(i: MergeableInput): boolean {
  if (!i.simAttempted || !i.simClean) return false;
  if (i.blockingCount > 0) return false;
  if (!i.checksRun || !i.checksOk) return false;
  return true;
}

export function suggestNextAction(
  sim: MergeSimulation,
  blocking: Finding[],
  warnings: Finding[],
  checksRun: boolean,
  failedChecks: CheckResult[],
): string {
  if (sim.attempted && !sim.clean) {
    return `Resolve merge conflicts with main (${sim.conflictedFiles.length} file(s)) and re-run.`;
  }
  if (blocking.length > 0) {
    const rules = [...new Set(blocking.map((b) => b.rule))].join(", ");
    return `Fix ${blocking.length} blocking issue(s) before merge: ${rules}.`;
  }
  if (!checksRun) {
    return "Run run_repo_checks (or generate_merge_report with run_checks=true) to validate typecheck/lint/test/build.";
  }
  if (failedChecks.length > 0) {
    return `Fix failing checks: ${failedChecks.map((c) => c.command).join(", ")}.`;
  }
  if (warnings.length > 0) {
    return `Mergeable — review ${warnings.length} warning(s) first.`;
  }
  return "Mergeable — no blocking issues or failing checks.";
}

export interface BuildReportInput {
  meta: PrMeta | null;
  simulation: MergeSimulation;
  findings: Finding[];
  changed: ChangedFile[];
  checksRun: boolean;
  checkResults: CheckResult[];
}

export function buildReport(input: BuildReportInput): MergeReport {
  const { blocking, warnings } = splitFindings(input.findings);
  const failedChecks = input.checkResults.filter((c) => !c.ok);
  const checksOk = input.checkResults.length > 0 && failedChecks.length === 0;

  const mergeable = decideMergeable({
    simAttempted: input.simulation.attempted,
    simClean: input.simulation.clean,
    blockingCount: blocking.length,
    checksRun: input.checksRun,
    checksOk,
  });

  return {
    pr: input.meta
      ? {
          number: input.meta.number,
          title: input.meta.title,
          baseRef: input.meta.baseRef,
          headRef: input.meta.headRef,
          headSha: input.meta.headSha,
        }
      : null,
    mergeable,
    verdict: mergeable ? "yes" : "no",
    merge_simulation: input.simulation,
    blocking_issues: blocking,
    warnings,
    checks: { run: input.checksRun, results: input.checkResults },
    files_changed: input.changed.map((f) => ({ path: f.path, status: f.status })),
    suggested_next_action: suggestNextAction(
      input.simulation,
      blocking,
      warnings,
      input.checksRun,
      failedChecks,
    ),
  };
}
