import type { AddedLine, ChangeStatus } from "./types.js";

export interface NameStatusEntry {
  status: ChangeStatus;
  path: string;
}

/**
 * Parse `git diff --name-status <range>` output.
 *
 * Lines look like:
 *   M\tapps/web/app/api/foo/route.ts
 *   A\tdb/migrations/120_thing.sql
 *   R100\told/path\tnew/path
 * For renames/copies the new path is used and the status collapses to R/C.
 */
export function parseNameStatus(output: string): NameStatusEntry[] {
  const entries: NameStatusEntry[] = [];
  for (const raw of output.split("\n")) {
    const line = raw.trimEnd();
    if (!line) continue;
    const parts = line.split("\t");
    const code = parts[0] ?? "";
    const letter = code.charAt(0).toUpperCase();
    if (!"AMDRCT".includes(letter)) continue;
    const status = letter as ChangeStatus;
    // R/C carry a similarity number and two paths; otherwise one path.
    const path = letter === "R" || letter === "C" ? parts[2] : parts[1];
    if (!path) continue;
    entries.push({ status, path });
  }
  return entries;
}

/**
 * Parse a unified diff for a single file and return the added lines (those
 * prefixed with `+`, excluding the `+++` file header), each tagged with its
 * 1-based line number in the new file.
 */
export function parseAddedLines(unifiedDiff: string): AddedLine[] {
  const added: AddedLine[] = [];
  let newLineNo = 0;
  for (const line of unifiedDiff.split("\n")) {
    if (line.startsWith("@@")) {
      // @@ -a,b +c,d @@  → next new-file line is c
      const m = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (m) newLineNo = parseInt(m[1], 10);
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      added.push({ line: newLineNo, text: line.slice(1) });
      newLineNo++;
    } else if (line.startsWith("-")) {
      // removed line: does not advance the new-file counter
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file" — ignore
    } else {
      // context line advances the new-file counter
      newLineNo++;
    }
  }
  return added;
}
