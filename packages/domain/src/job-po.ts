/**
 * Job Supply PO — short PO derived from jobs.job_number for supply houses.
 *
 * Canonical job number: J-YYYY-####  (e.g. J-2026-0029)
 * Supply PO (spoken):   J + YY + #### (e.g. J260029)
 *
 * See docs/superpowers/specs/2026-07-31-job-supply-po-design.md
 */

export type ParsedJobNumber = {
  year: number;
  seq: number;
  /** Canonical form J-YYYY-#### */
  canonical: string;
  /** Spoken supply-house PO JYY#### */
  supplyPo: string;
};

const CANONICAL_RE = /^J-(\d{4})-(\d{1,6})$/i;
const SUPPLY_RE = /^J(\d{2})(\d{4})$/i;
/** Loose: J-26-0029 or J 26 0029 etc. after strip */
const LOOSE_SUPPLY_RE = /^J-?(\d{2})-?(\d{4})$/i;

/**
 * Parse a job number or supply PO string into structured parts.
 * Accepts J-2026-0029, J260029, j-2026-29 (seq padded).
 */
export function parseJobNumber(raw: string | null | undefined): ParsedJobNumber | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().toUpperCase().replace(/\s+/g, "");

  let year: number;
  let seq: number;

  const full = s.match(CANONICAL_RE);
  if (full) {
    year = parseInt(full[1], 10);
    seq = parseInt(full[2], 10);
  } else {
    const supply = s.match(SUPPLY_RE) ?? s.match(LOOSE_SUPPLY_RE);
    if (!supply) return null;
    const yy = parseInt(supply[1], 10);
    seq = parseInt(supply[2], 10);
    // Prefer 20xx for two-digit years (valid through 2099)
    year = yy >= 0 && yy <= 99 ? 2000 + yy : yy;
  }

  if (!Number.isFinite(year) || !Number.isFinite(seq) || seq < 0 || seq > 999999) {
    return null;
  }
  if (year < 2000 || year > 2100) return null;

  const seqPad = String(seq).padStart(4, "0");
  const yy = String(year % 100).padStart(2, "0");
  return {
    year,
    seq,
    canonical: `J-${year}-${seqPad}`,
    supplyPo: `J${yy}${seqPad}`,
  };
}

/** Supply PO short form from job_number, or null if unparseable. */
export function toSupplyPo(jobNumber: string | null | undefined): string | null {
  return parseJobNumber(jobNumber)?.supplyPo ?? null;
}

/** Canonical J-YYYY-#### from any accepted form. */
export function toCanonicalJobNumber(jobNumber: string | null | undefined): string | null {
  return parseJobNumber(jobNumber)?.canonical ?? null;
}

/**
 * Pull candidate PO / job-number tokens from free text (notes, OCR, HD tags).
 * Returns unique supply-PO forms (JYY####) when parseable.
 */
export function extractSupplyPoCandidates(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  const found = new Set<string>();
  const upper = text.toUpperCase();

  // PO-marked: PO J260029, P.O. #J-2026-0029, PO:  J260029
  const poMarked =
    /\bP\.?\s*O\.?\s*[#:]?\s*(J-?\d{2,4}-?\d{3,6}|J\d{6})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = poMarked.exec(upper)) !== null) {
    const parsed = parseJobNumber(m[1]);
    if (parsed) found.add(parsed.supplyPo);
  }

  // Bare job numbers / supply POs (require leading J)
  const bare = /\bJ-?\d{4}-\d{1,6}\b|\bJ\d{6}\b|\bJ-?\d{2}-?\d{4}\b/gi;
  while ((m = bare.exec(upper)) !== null) {
    const parsed = parseJobNumber(m[0]);
    if (parsed) found.add(parsed.supplyPo);
  }

  return [...found];
}

export type JobPoMatchInput = {
  id: string;
  job_number?: string | null;
};

export type JobPoMatch = {
  jobId: string;
  jobNumber: string;
  supplyPo: string;
  confidence: "exact";
};

/**
 * Match free text (PO field + notes) against jobs by supply PO / job_number.
 * Returns a hit only when exactly one job matches any extracted candidate.
 */
export function matchJobsBySupplyPo(
  text: string | null | undefined,
  jobs: JobPoMatchInput[],
): JobPoMatch | null {
  const candidates = extractSupplyPoCandidates(text);
  if (candidates.length === 0) return null;

  const bySupply = new Map<string, JobPoMatchInput & { parsed: ParsedJobNumber }>();
  for (const j of jobs) {
    const parsed = parseJobNumber(j.job_number ?? null);
    if (!parsed) continue;
    // Last write wins if duplicate supply POs (shouldn't happen under unique job_number)
    bySupply.set(parsed.supplyPo, { ...j, parsed });
  }

  const hits: JobPoMatch[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const job = bySupply.get(c);
    if (!job || seen.has(job.id)) continue;
    seen.add(job.id);
    hits.push({
      jobId: job.id,
      jobNumber: job.parsed.canonical,
      supplyPo: job.parsed.supplyPo,
      confidence: "exact",
    });
  }

  if (hits.length === 1) return hits[0];
  return null;
}

/**
 * Label for job pickers: "J260029 · Front door" or just title.
 */
export function formatJobPickerLabel(
  title: string,
  jobNumber: string | null | undefined,
): string {
  const po = toSupplyPo(jobNumber);
  return po ? `${po} · ${title}` : title;
}
