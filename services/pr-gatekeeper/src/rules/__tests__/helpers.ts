import type { AddedLine, ChangeStatus, ChangedFile } from "../../types.js";

/** Build a ChangedFile fixture. `added` lines are auto-numbered from 1. */
export function file(
  path: string,
  opts: { status?: ChangeStatus; added?: string[]; content?: string } = {},
): ChangedFile {
  const added: AddedLine[] = (opts.added ?? []).map((text, i) => ({ line: i + 1, text }));
  return {
    path,
    status: opts.status ?? "M",
    addedLines: added,
    content: opts.content ?? (opts.added ?? []).join("\n"),
  };
}
