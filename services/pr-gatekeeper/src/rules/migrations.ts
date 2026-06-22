import type { ChangedFile, Finding } from "../types.js";

const MIGRATION_RE = /^db\/migrations\/(\d+)[^/]*\.sql$/;

/** Statements we treat as destructive enough to warn about. */
const DESTRUCTIVE: Array<{ re: RegExp; what: string }> = [
  { re: /\bdrop\s+table\b/i, what: "DROP TABLE" },
  { re: /\bdrop\s+column\b/i, what: "DROP COLUMN" },
  { re: /\balter\s+table\s+[^\n;]*\bdrop\b/i, what: "ALTER TABLE … DROP" },
  { re: /\bdrop\s+(?:index|constraint|view|type|sequence)\b/i, what: "DROP <object>" },
  { re: /\btruncate\b/i, what: "TRUNCATE" },
  { re: /\bdelete\s+from\b/i, what: "DELETE FROM" },
  { re: /\balter\s+column\s+[^\n;]*\btype\b/i, what: "ALTER COLUMN … TYPE" },
];

export function migrationNumber(path: string): string | null {
  const m = MIGRATION_RE.exec(path);
  return m ? m[1] : null;
}

export interface MigrationInput {
  /** Every migration filename present at the PR head (post-merge view). */
  allMigrationFiles: string[];
  /** The PR's changed files. */
  changed: ChangedFile[];
}

/**
 * Migration safety checks:
 *  - duplicate numeric prefixes among migrations (blocking) when a changed
 *    migration participates in the collision;
 *  - destructive statements in added migration lines (warning).
 */
export function checkMigrations({ allMigrationFiles, changed }: MigrationInput): Finding[] {
  const findings: Finding[] = [];

  const changedMigrationNumbers = new Set(
    changed.map((f) => migrationNumber(f.path)).filter((n): n is string => n !== null),
  );

  // Duplicate numbers.
  const byNumber = new Map<string, string[]>();
  for (const file of allMigrationFiles) {
    const num = migrationNumber(file);
    if (!num) continue;
    const list = byNumber.get(num) ?? [];
    list.push(file);
    byNumber.set(num, list);
  }
  for (const [num, fileList] of byNumber) {
    if (fileList.length > 1 && changedMigrationNumbers.has(num)) {
      findings.push({
        rule: "migrations.duplicate-number",
        severity: "blocking",
        message: `Duplicate migration number ${num}: ${fileList.sort().join(", ")}. Renumber to the next free prefix.`,
      });
    }
  }

  // Destructive statements in added lines of changed migrations.
  for (const file of changed) {
    if (!migrationNumber(file.path)) continue;
    for (const added of file.addedLines) {
      // Skip SQL line comments — rollback instructions are conventionally
      // written as `-- DROP …` and are not executed.
      if (added.text.trim().startsWith("--")) continue;
      for (const { re, what } of DESTRUCTIVE) {
        if (re.test(added.text)) {
          findings.push({
            rule: "migrations.destructive",
            severity: "warning",
            message: `Destructive migration statement (${what}). Confirm it is intentional and reversible per CLAUDE.md (additive/reversible unless an explicit migration plan).`,
            file: file.path,
            line: added.line,
          });
          break;
        }
      }
    }
  }

  return findings;
}
