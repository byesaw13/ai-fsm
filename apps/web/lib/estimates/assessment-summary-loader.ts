import {
  buildAssessmentSummary,
  normalizeAssessmentRooms,
  type AssessmentSummary,
} from "@ai-fsm/domain";
import { queryForSession } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Server-side derivation of the canonical AssessmentSummary from the persisted
 * site_visit_assessments row. The single place the persisted assessment becomes
 * the shared contract (TASK-018). No new tables; reuses the domain builder.
 */

export type SiteVisitAssessmentRow = {
  id: string;
  visit_id: string;
  rooms: unknown; // jsonb: AssessmentRoom[] (see normalizeAssessmentRoom)
  scope_notes: string | null;
  access_notes: string | null;
  has_pets: boolean;
  difficult_access: boolean;
  asbestos_risk: boolean;
  lead_paint_risk: boolean;
  total_sqft: number | string | null;
  photo_count?: number | string | null;
  work_items?: unknown;
  prep_notes?: string | null;
  trade_notes?: unknown;
  customer_supplied_materials?: string | null;
};

function toWorkItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

function toTradeNotes(value: unknown): Partial<Record<"painting" | "drywall" | "trim" | "flooring", string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Partial<Record<"painting" | "drywall" | "trim" | "flooring", string>> = {};
  for (const key of ["painting", "drywall", "trim", "flooring"] as const) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  }
  return out;
}

/** Pure: map a persisted assessment row into the canonical summary. */
export function mapRowToAssessmentSummary(row: SiteVisitAssessmentRow): AssessmentSummary {
  const sqft = row.total_sqft == null ? null : Number(row.total_sqft);
  const photoCount = row.photo_count == null ? 0 : Number(row.photo_count);
  return buildAssessmentSummary({
    visitId: row.visit_id,
    assessmentId: row.id,
    rooms: normalizeAssessmentRooms(row.rooms),
    scopeNotes: row.scope_notes,
    accessNotes: row.access_notes,
    hasPets: row.has_pets,
    difficultAccess: row.difficult_access,
    asbestosRisk: row.asbestos_risk,
    leadPaintRisk: row.lead_paint_risk,
    totalSqft: Number.isFinite(sqft as number) ? (sqft as number) : null,
    photoCount: Number.isFinite(photoCount) ? photoCount : 0,
    workItems: toWorkItems(row.work_items),
    prepNotes: row.prep_notes ?? null,
    tradeNotes: toTradeNotes(row.trade_notes),
    customerSuppliedMaterials: row.customer_supplied_materials ?? null,
  });
}

const ASSESSMENT_SELECT = `SELECT a.id, a.visit_id, a.rooms, a.scope_notes, a.access_notes,
            a.has_pets, a.difficult_access, a.asbestos_risk, a.lead_paint_risk,
            a.total_sqft, a.work_items, a.prep_notes, a.trade_notes,
            a.customer_supplied_materials,
            (SELECT COUNT(*) FROM visit_media m
              WHERE m.visit_id = a.visit_id AND m.category = 'assessment') AS photo_count
     FROM site_visit_assessments a`;

/** Load the canonical assessment summary for a visit, or null if none exists. */
export async function loadAssessmentSummary(
  session: SessionPayload,
  visitId: string
): Promise<AssessmentSummary | null> {
  const rows = await queryForSession<SiteVisitAssessmentRow>(
    session,
    `${ASSESSMENT_SELECT} WHERE a.visit_id = $1 AND a.account_id = $2`,
    [visitId, session.accountId]
  );
  return rows[0] ? mapRowToAssessmentSummary(rows[0]) : null;
}

/** Load the canonical assessment summary by assessment id, or null if none exists. */
export async function loadAssessmentSummaryById(
  session: SessionPayload,
  assessmentId: string
): Promise<AssessmentSummary | null> {
  const rows = await queryForSession<SiteVisitAssessmentRow>(
    session,
    `${ASSESSMENT_SELECT} WHERE a.id = $1 AND a.account_id = $2`,
    [assessmentId, session.accountId]
  );
  return rows[0] ? mapRowToAssessmentSummary(rows[0]) : null;
}
