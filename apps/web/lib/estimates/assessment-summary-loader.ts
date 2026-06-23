import {
  buildAssessmentSummary,
  type AssessmentRoom,
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
  rooms: unknown; // jsonb: [{ id, name, length_ft, width_ft, height_ft, notes }]
  scope_notes: string | null;
  access_notes: string | null;
  has_pets: boolean;
  difficult_access: boolean;
  asbestos_risk: boolean;
  lead_paint_risk: boolean;
  total_sqft: number | string | null;
  photo_count?: number | string | null;
};

function toRooms(value: unknown): AssessmentRoom[] {
  if (!Array.isArray(value)) return [];
  return value.map((r) => {
    const room = (r ?? {}) as Record<string, unknown>;
    const num = (v: unknown): number | null => {
      const n = typeof v === "string" ? parseFloat(v) : (v as number);
      return Number.isFinite(n) ? (n as number) : null;
    };
    return {
      id: typeof room.id === "string" ? room.id : "",
      name: typeof room.name === "string" ? room.name : "",
      length_ft: num(room.length_ft),
      width_ft: num(room.width_ft),
      height_ft: num(room.height_ft),
      notes: typeof room.notes === "string" ? room.notes : "",
    };
  });
}

/** Pure: map a persisted assessment row into the canonical summary. */
export function mapRowToAssessmentSummary(row: SiteVisitAssessmentRow): AssessmentSummary {
  const sqft = row.total_sqft == null ? null : Number(row.total_sqft);
  const photoCount = row.photo_count == null ? 0 : Number(row.photo_count);
  return buildAssessmentSummary({
    visitId: row.visit_id,
    assessmentId: row.id,
    rooms: toRooms(row.rooms),
    scopeNotes: row.scope_notes,
    accessNotes: row.access_notes,
    hasPets: row.has_pets,
    difficultAccess: row.difficult_access,
    asbestosRisk: row.asbestos_risk,
    leadPaintRisk: row.lead_paint_risk,
    totalSqft: Number.isFinite(sqft as number) ? (sqft as number) : null,
    photoCount: Number.isFinite(photoCount) ? photoCount : 0,
  });
}

/** Load the canonical assessment summary for a visit, or null if none exists. */
export async function loadAssessmentSummary(
  session: SessionPayload,
  visitId: string
): Promise<AssessmentSummary | null> {
  const rows = await queryForSession<SiteVisitAssessmentRow>(
    session,
    `SELECT a.id, a.visit_id, a.rooms, a.scope_notes, a.access_notes,
            a.has_pets, a.difficult_access, a.asbestos_risk, a.lead_paint_risk,
            a.total_sqft,
            (SELECT COUNT(*) FROM visit_media m
              WHERE m.visit_id = a.visit_id AND m.category = 'assessment') AS photo_count
     FROM site_visit_assessments a
     WHERE a.visit_id = $1 AND a.account_id = $2`,
    [visitId, session.accountId]
  );
  return rows[0] ? mapRowToAssessmentSummary(rows[0]) : null;
}
