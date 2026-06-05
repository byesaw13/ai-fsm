/**
 * Build estimate scope notes from a completed site-visit walkthrough.
 *
 * Previously, launching an estimate from a visit (`?from_visit=`) showed a
 * decorative "Walkthrough Evidence" card but pre-filled nothing into the form,
 * so the tech's notes, parts, and measurements had to be re-typed. This helper
 * turns that evidence into seed text for the estimate's scope notes.
 *
 * It is pure (no DB / React) so it can be unit-tested, and it is only ever used
 * as the INITIAL value of the notes field — it never overwrites later edits.
 */

export interface WalkthroughPart {
  name: string;
  quantity: number;
}

export interface WalkthroughPrefillInput {
  visitDate: string | null;
  techNotes: string | null;
  parts: WalkthroughPart[];
  assessmentPhotoCount: number;
  beforePhotoCount: number;
}

function formatVisitDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Returns the seed scope-notes text, or "" when there is nothing useful to
 * pre-fill (no tech notes, no parts, no photos).
 */
export function buildWalkthroughScopeNotes(input: WalkthroughPrefillInput): string {
  const { techNotes, parts, assessmentPhotoCount, beforePhotoCount } = input;
  const date = formatVisitDate(input.visitDate);

  const hasContent =
    (techNotes?.trim().length ?? 0) > 0 ||
    parts.length > 0 ||
    assessmentPhotoCount > 0 ||
    beforePhotoCount > 0;
  if (!hasContent) return "";

  const sections: string[] = [];

  sections.push(date ? `Walkthrough findings (site visit ${date}):` : "Walkthrough findings:");

  if (techNotes?.trim()) {
    sections.push(techNotes.trim());
  }

  if (parts.length > 0) {
    const lines = parts.map((p) => {
      const qty = p.quantity && p.quantity !== 1 ? ` x${p.quantity}` : "";
      return `- ${p.name}${qty}`;
    });
    sections.push(`Parts identified on site:\n${lines.join("\n")}`);
  }

  const evidence: string[] = [];
  if (assessmentPhotoCount > 0) {
    evidence.push(`${assessmentPhotoCount} assessment photo${assessmentPhotoCount !== 1 ? "s" : ""}`);
  }
  if (beforePhotoCount > 0) {
    evidence.push(`${beforePhotoCount} before photo${beforePhotoCount !== 1 ? "s" : ""}`);
  }
  if (evidence.length > 0) {
    sections.push(`Evidence on file: ${evidence.join(", ")}.`);
  }

  return sections.join("\n\n");
}
