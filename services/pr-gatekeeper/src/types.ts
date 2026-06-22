/** Shared types for the PR Gatekeeper. Kept runtime-free for easy testing. */

export type ChangeStatus = "A" | "M" | "D" | "R" | "C" | "T";

export interface AddedLine {
  /** 1-based line number in the new version of the file. */
  line: number;
  text: string;
}

/** A single file changed by the PR, with its added lines and post-merge content. */
export interface ChangedFile {
  path: string;
  status: ChangeStatus;
  addedLines: AddedLine[];
  /** File content at the PR head (empty string for deletions or binary). */
  content: string;
}

export type Severity = "blocking" | "warning";

/** One issue found by a rule check. */
export interface Finding {
  /** Stable rule id, e.g. "migrations.duplicate-number". */
  rule: string;
  severity: Severity;
  message: string;
  file?: string;
  line?: number;
}

export interface PrMeta {
  number: number;
  title: string;
  baseRef: string;
  headRef: string;
  headSha: string;
  state: string;
  isCrossRepository: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface CheckResult {
  command: string;
  ok: boolean;
  /** Short, redacted tail of output for context. */
  summary: string;
}

export interface MergeSimulation {
  attempted: boolean;
  clean: boolean;
  conflictedFiles: string[];
}

export interface MergeReport {
  pr: Pick<PrMeta, "number" | "title" | "baseRef" | "headRef" | "headSha"> | null;
  mergeable: boolean;
  verdict: "yes" | "no";
  merge_simulation: MergeSimulation;
  blocking_issues: Finding[];
  warnings: Finding[];
  checks: { run: boolean; results: CheckResult[] };
  files_changed: Array<{ path: string; status: ChangeStatus }>;
  suggested_next_action: string;
}
