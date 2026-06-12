/**
 * Assessment → job description builder.
 *
 * Composes a normalized, human-readable job description from site assessment
 * data so the user never has to retype what they already captured on site.
 * The same output seeds the materials generator, estimate generator, work
 * order generator, and invoice scope summaries.
 */

export interface AssessmentSummaryRoom {
  name: string;
  length_ft?: number | null;
  width_ft?: number | null;
  height_ft?: number | null;
  notes?: string | null;
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

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
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
export function buildAssessmentJobDescription(input: AssessmentSummaryInput): string {
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

  return sections.join("\n\n");
}

/**
 * Combine a manually entered job description with the generated assessment
 * summary. Neither replaces the other: the manual text leads, the structured
 * summary follows. Duplicate or empty parts collapse away.
 */
export function composeJobDescription(
  manualDescription: string | null | undefined,
  assessment: AssessmentSummaryInput
): string {
  const manual = clean(manualDescription);
  const generated = buildAssessmentJobDescription(assessment);

  if (!manual) return generated;
  if (!generated) return manual;
  if (generated.includes(manual)) return generated;
  if (manual.includes(generated)) return manual;
  return `${manual}\n\n${generated}`;
}
