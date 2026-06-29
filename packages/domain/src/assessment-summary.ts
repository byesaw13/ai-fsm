/**
 * Assessment → job description builder.
 *
 * Composes a normalized, human-readable job description from site assessment
 * data so the user never has to retype what they already captured on site.
 * The same output seeds the materials generator, estimate generator, work
 * order generator, and invoice scope summaries.
 */

/**
 * Loose room shape accepted by the description builder — dimensions and notes
 * are optional. The canonical persisted `AssessmentRoom` (below) is assignable
 * to this, so callers can pass either.
 */
export interface AssessmentSummaryRoom {
  name: string;
  length_ft?: number | null;
  width_ft?: number | null;
  height_ft?: number | null;
  notes?: string | null;
}

/**
 * The canonical persisted room — what `site_visit_assessments.rooms` stores and
 * what the materials generator and the estimate hand-off carry. One room shape
 * for every assessment-derived flow.
 */
export interface AssessmentRoom {
  id: string;
  name: string;
  length_ft: number | null;
  width_ft: number | null;
  height_ft: number | null;
  notes: string;
}

export type AssessmentTradeKey = "painting" | "drywall" | "trim" | "flooring";

export const ASSESSMENT_TRADE_LABELS: Record<AssessmentTradeKey, string> = {
  painting: "Painting",
  drywall: "Drywall",
  trim: "Trim",
  flooring: "Flooring",
};

export interface AssessmentSummaryInput {
  rooms?: AssessmentSummaryRoom[] | null;
  scope_notes?: string | null;
  access_notes?: string | null;
  has_pets?: boolean;
  difficult_access?: boolean;
  asbestos_risk?: boolean;
  lead_paint_risk?: boolean;
  total_sqft?: number | null;
  /** Number of assessment photos on file, if any. */
  photo_count?: number;
  /** Selected work items, when the assessment captures structured scope. */
  work_items?: string[] | null;
  /** Prep requirements (masking, furniture moving, surface prep, …). */
  prep_notes?: string | null;
  /** Trade-specific notes keyed by trade. */
  trade_notes?: Partial<Record<AssessmentTradeKey, string>> | null;
  /** Materials the customer is supplying themselves. */
  customer_supplied_materials?: string | null;
}

/**
 * Matches the `scope` limit enforced by /api/v1/estimates/ai-materials.
 * Generated descriptions must stay under this or generation 422s.
 */
export const MAX_JOB_DESCRIPTION_LENGTH = 5000;

export interface JobDescriptionOptions {
  maxLength?: number;
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** Join sections, dropping trailing ones that would exceed maxLength. */
function joinSectionsWithinLimit(sections: string[], maxLength: number): string {
  let out = "";
  for (const section of sections) {
    const candidate = out ? `${out}\n\n${section}` : section;
    if (candidate.length > maxLength) break;
    out = candidate;
  }
  // A single oversized leading section (e.g. max-length scope notes) still
  // has to fit, so hard-truncate as a last resort.
  if (!out && sections.length > 0) {
    out = sections[0].slice(0, maxLength);
  }
  return out;
}

function formatDimension(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function describeRoom(room: AssessmentSummaryRoom): string | null {
  const name = clean(room.name);
  const notes = clean(room.notes);
  const parts: string[] = [];

  if (room.length_ft && room.width_ft) {
    let dims = `${formatDimension(room.length_ft)} x ${formatDimension(room.width_ft)} ft`;
    if (room.height_ft) dims += `, ${formatDimension(room.height_ft)} ft ceiling`;
    dims += ` (${Math.round(room.length_ft * room.width_ft)} sqft)`;
    parts.push(dims);
  } else if (room.height_ft) {
    parts.push(`${formatDimension(room.height_ft)} ft ceiling`);
  }
  if (notes) parts.push(notes);

  if (!name && parts.length === 0) return null;
  if (!name) return parts.join(" — ");
  return parts.length > 0 ? `${name} — ${parts.join(" — ")}` : name;
}

/**
 * Build a normalized job description from site assessment data.
 * Returns "" when the assessment has no usable content.
 */
export function buildAssessmentJobDescription(
  input: AssessmentSummaryInput,
  options: JobDescriptionOptions = {}
): string {
  const maxLength = options.maxLength ?? MAX_JOB_DESCRIPTION_LENGTH;
  const sections: string[] = [];

  const scopeNotes = clean(input.scope_notes);
  if (scopeNotes) sections.push(scopeNotes);

  const workItems = (input.work_items ?? []).map(clean).filter(Boolean);
  if (workItems.length > 0) {
    sections.push(`Work items:\n${workItems.map((w) => `- ${w}`).join("\n")}`);
  }

  const roomLines = (input.rooms ?? [])
    .map(describeRoom)
    .filter((line): line is string => line !== null);
  if (roomLines.length > 0) {
    sections.push(`Rooms / areas:\n${roomLines.map((l) => `- ${l}`).join("\n")}`);
  }

  if (input.total_sqft && input.total_sqft > 0) {
    sections.push(`Total area: ${Math.round(input.total_sqft)} sqft`);
  }

  const prepNotes = clean(input.prep_notes);
  if (prepNotes) sections.push(`Prep requirements: ${prepNotes}`);

  for (const trade of Object.keys(ASSESSMENT_TRADE_LABELS) as AssessmentTradeKey[]) {
    const note = clean(input.trade_notes?.[trade]);
    if (note) sections.push(`${ASSESSMENT_TRADE_LABELS[trade]}: ${note}`);
  }

  const customerMaterials = clean(input.customer_supplied_materials);
  if (customerMaterials) {
    sections.push(`Customer-supplied materials: ${customerMaterials}`);
  }

  const conditions: string[] = [];
  if (input.has_pets) conditions.push("pets on site");
  if (input.difficult_access) conditions.push("difficult access");
  if (input.asbestos_risk) conditions.push("asbestos risk");
  if (input.lead_paint_risk) conditions.push("lead paint risk");
  if (conditions.length > 0) sections.push(`Site conditions: ${conditions.join("; ")}`);

  const accessNotes = clean(input.access_notes);
  if (accessNotes) sections.push(`Access: ${accessNotes}`);

  if (input.photo_count && input.photo_count > 0) {
    sections.push(
      `${input.photo_count} assessment photo${input.photo_count > 1 ? "s" : ""} on file.`
    );
  }

  return joinSectionsWithinLimit(sections, maxLength);
}

/**
 * The canonical assessment summary — the single contract every assessment-
 * derived flow consumes (materials, estimates, and later work orders/invoices).
 * Derivable from a persisted `site_visit_assessments` row; `generatedJobDescription`
 * is produced from the same data via `buildAssessmentJobDescription`.
 */
export interface AssessmentSummary {
  visitId: string | null;
  assessmentId: string | null;
  rooms: AssessmentRoom[];
  scopeNotes: string | null;
  accessNotes: string | null;
  hasPets: boolean;
  difficultAccess: boolean;
  asbestosRisk: boolean;
  leadPaintRisk: boolean;
  totalSqft: number | null;
  /** Structured scope work items, when the assessment captures them. */
  workItems: string[];
  /** Prep requirements (masking, furniture moving, surface prep, …). */
  prepNotes: string | null;
  /** Trade-specific notes keyed by trade. */
  tradeNotes: Partial<Record<AssessmentTradeKey, string>>;
  /** Materials the customer is supplying themselves (excluded from purchase lists). */
  customerSuppliedMaterials: string | null;
  generatedJobDescription: string;
}

export interface AssessmentSummaryBuildInput {
  visitId?: string | null;
  assessmentId?: string | null;
  rooms?: AssessmentRoom[] | null;
  scopeNotes?: string | null;
  accessNotes?: string | null;
  hasPets?: boolean;
  difficultAccess?: boolean;
  asbestosRisk?: boolean;
  leadPaintRisk?: boolean;
  totalSqft?: number | null;
  photoCount?: number;
  workItems?: string[] | null;
  prepNotes?: string | null;
  tradeNotes?: Partial<Record<AssessmentTradeKey, string>> | null;
  customerSuppliedMaterials?: string | null;
}

/**
 * Normalize raw assessment fields into the canonical `AssessmentSummary`,
 * filling `generatedJobDescription` from the same data. Pure — the single place
 * a summary is constructed, whether from persistence or the live form.
 */
export function buildAssessmentSummary(
  input: AssessmentSummaryBuildInput,
  options: JobDescriptionOptions = {}
): AssessmentSummary {
  const rooms = (input.rooms ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    length_ft: r.length_ft ?? null,
    width_ft: r.width_ft ?? null,
    height_ft: r.height_ft ?? null,
    notes: r.notes ?? "",
  }));
  const scopeNotes = input.scopeNotes ?? null;
  const accessNotes = input.accessNotes ?? null;
  const totalSqft = input.totalSqft ?? null;
  const hasPets = input.hasPets ?? false;
  const difficultAccess = input.difficultAccess ?? false;
  const asbestosRisk = input.asbestosRisk ?? false;
  const leadPaintRisk = input.leadPaintRisk ?? false;
  const workItems = (input.workItems ?? []).map((w) => w.trim()).filter(Boolean);
  const prepNotes = input.prepNotes ?? null;
  const tradeNotes = input.tradeNotes ?? {};
  const customerSuppliedMaterials = input.customerSuppliedMaterials ?? null;

  const generatedJobDescription = buildAssessmentJobDescription(
    {
      rooms,
      scope_notes: scopeNotes,
      access_notes: accessNotes,
      has_pets: hasPets,
      difficult_access: difficultAccess,
      asbestos_risk: asbestosRisk,
      lead_paint_risk: leadPaintRisk,
      total_sqft: totalSqft,
      photo_count: input.photoCount,
      work_items: workItems,
      prep_notes: prepNotes,
      trade_notes: tradeNotes,
      customer_supplied_materials: customerSuppliedMaterials,
    },
    options
  );

  return {
    visitId: input.visitId ?? null,
    assessmentId: input.assessmentId ?? null,
    rooms,
    scopeNotes,
    accessNotes,
    hasPets,
    difficultAccess,
    asbestosRisk,
    leadPaintRisk,
    totalSqft,
    workItems,
    prepNotes,
    tradeNotes,
    customerSuppliedMaterials,
    generatedJobDescription,
  };
}

/**
 * Combine a manually entered job description with the generated assessment
 * summary. Neither replaces the other: the manual text leads, the structured
 * summary follows. Duplicate or empty parts collapse away.
 */
export function composeJobDescription(
  manualDescription: string | null | undefined,
  assessment: AssessmentSummaryInput,
  options: JobDescriptionOptions = {}
): string {
  const maxLength = options.maxLength ?? MAX_JOB_DESCRIPTION_LENGTH;
  const manual = clean(manualDescription).slice(0, maxLength);
  const generated = buildAssessmentJobDescription(assessment, { maxLength });

  if (!manual) return generated;
  if (!generated) return manual;
  if (generated.includes(manual)) return generated;
  if (manual.includes(generated)) return manual;
  return joinSectionsWithinLimit([manual, ...generated.split("\n\n")], maxLength);
}
