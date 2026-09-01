import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  OWNER_PROMISE_ACTION_TYPE,
  PROMISE_ENTITY_TYPES,
  type PromiseEntityType,
} from "@ai-fsm/domain";
import { withRole } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { REVIEWABLE_PROCESSING_STATES } from "@/lib/captures/review-query";

export const dynamic = "force-dynamic";

const entityTypeSchema = z.enum(PROMISE_ENTITY_TYPES);

const confirmSchema = z.object({
  action: z.literal("confirm"),
  entity_type: entityTypeSchema,
  entity_id: z.string().uuid(),
  title: z.string().trim().min(1).max(500).optional(),
  due_at: z.string().nullable().optional(),
});

const correctSchema = z.object({
  action: z.literal("correct"),
  entity_type: entityTypeSchema,
  entity_id: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  due_at: z.string().nullable().optional(),
});

const snoozeSchema = z.object({ action: z.literal("snooze") });
const dismissSchema = z.object({ action: z.literal("dismiss") });

const bodySchema = z.discriminatedUnion("action", [
  confirmSchema,
  correctSchema,
  snoozeSchema,
  dismissSchema,
]);

const ENTITY_TABLE: Record<PromiseEntityType, string> = {
  booking_request: "booking_requests",
  estimate: "estimates",
  job: "jobs",
  invoice: "invoices",
};

const REVIEWABLE = new Set<string>(REVIEWABLE_PROCESSING_STATES);

type CaptureRow = {
  id: string;
  processing_state: string;
  snooze_count: number;
  proposed_title: string | null;
  proposed_due_at: string | null;
  confirmed_at: string | null;
  dismissed_at: string | null;
};

function captureIdFromUrl(url: string): string | null {
  const id = url.match(/\/captures\/([^/]+)\/review/)?.[1];
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  return id;
}

function jsonError(
  status: number,
  code: string,
  message: string,
  traceId: string,
) {
  return NextResponse.json({ error: { code, message, traceId } }, { status });
}

function normalizeDueAt(value: string | null | undefined): string | null | "invalid" {
  if (value == null || value === "") return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T12:00:00.000Z`;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "invalid";
  return parsed.toISOString();
}

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const id = captureIdFromUrl(request.url);
  if (!id) {
    return jsonError(404, "NOT_FOUND", "Capture not found", session.traceId);
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(422, "VALIDATION_ERROR", "Invalid review action", session.traceId);
  }
  const body = parsed.data;

  try {
    const result = await withDbSession(session, async (client) => {
      const { rows } = await client.query<CaptureRow>(
        `SELECT id, processing_state, snooze_count,
                proposed_title, proposed_due_at::text,
                confirmed_at::text, dismissed_at::text
         FROM capture_evidence
         WHERE id = $1 AND account_id = $2
         FOR UPDATE`,
        [id, session.accountId],
      );
      const capture = rows[0];
      if (!capture) return { kind: "not_found" as const };
      if (capture.confirmed_at || capture.dismissed_at || !REVIEWABLE.has(capture.processing_state)) {
        return { kind: "not_reviewable" as const };
      }

      if (body.action === "snooze") {
        if (Number(capture.snooze_count) >= 1) return { kind: "already_snoozed" as const };
        const updated = await client.query<{ id: string }>(
          `UPDATE capture_evidence
           SET snooze_count = 1,
               snoozed_at = now(),
               processing_state = 'snoozed',
               updated_at = now()
           WHERE id = $1 AND account_id = $2
             AND confirmed_at IS NULL AND dismissed_at IS NULL
             AND snooze_count = 0
           RETURNING id`,
          [id, session.accountId],
        );
        if (!updated.rows[0]) return { kind: "already_snoozed" as const };
        return { kind: "ok" as const, action: "snooze" as const };
      }

      if (body.action === "dismiss") {
        const updated = await client.query<{ id: string }>(
          `UPDATE capture_evidence
           SET dismissed_at = now(),
               processing_state = 'dismissed',
               updated_at = now()
           WHERE id = $1 AND account_id = $2
             AND confirmed_at IS NULL AND dismissed_at IS NULL
           RETURNING id`,
          [id, session.accountId],
        );
        if (!updated.rows[0]) return { kind: "not_reviewable" as const };
        return { kind: "ok" as const, action: "dismiss" as const };
      }

      const title =
        body.action === "correct"
          ? body.title
          : (body.title?.trim() || capture.proposed_title?.trim() || "");
      if (!title) return { kind: "title_required" as const };

      const dueSource = body.due_at !== undefined ? body.due_at : capture.proposed_due_at;
      const dueAt = normalizeDueAt(dueSource);
      if (dueAt === "invalid") return { kind: "invalid_due" as const };

      const table = ENTITY_TABLE[body.entity_type];
      const entity = await client.query<{ id: string }>(
        `SELECT id FROM ${table} WHERE id = $1 AND account_id = $2`,
        [body.entity_id, session.accountId],
      );
      if (!entity.rows[0]) return { kind: "entity_missing" as const };

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO action_items (
           account_id, entity_type, entity_id, action_type, title, due_at, source_capture_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          session.accountId,
          body.entity_type,
          body.entity_id,
          OWNER_PROMISE_ACTION_TYPE,
          title,
          dueAt,
          id,
        ],
      );
      const actionItemId = inserted.rows[0]?.id;
      if (!actionItemId) throw new Error("action_items insert returned no row");

      const confirmed = await client.query<{ id: string }>(
        `UPDATE capture_evidence
         SET confirmed_at = now(),
             processing_state = 'confirmed',
             updated_at = now()
         WHERE id = $1 AND account_id = $2
           AND confirmed_at IS NULL AND dismissed_at IS NULL
         RETURNING id`,
        [id, session.accountId],
      );
      if (!confirmed.rows[0]) throw new Error("capture confirm update matched no row");

      return { kind: "ok" as const, action: "confirm" as const, actionItemId };
    });

    if (result.kind === "not_found") {
      return jsonError(404, "NOT_FOUND", "Capture not found", session.traceId);
    }
    if (result.kind === "not_reviewable") {
      return jsonError(409, "NOT_REVIEWABLE", "Capture is not awaiting review", session.traceId);
    }
    if (result.kind === "already_snoozed") {
      return jsonError(409, "ALREADY_SNOOZED", "Already snoozed once", session.traceId);
    }
    if (result.kind === "title_required") {
      return jsonError(422, "VALIDATION_ERROR", "Title is required to attach", session.traceId);
    }
    if (result.kind === "invalid_due") {
      return jsonError(422, "VALIDATION_ERROR", "due_at is invalid", session.traceId);
    }
    if (result.kind === "entity_missing") {
      return jsonError(422, "VALIDATION_ERROR", "Supported entity is required", session.traceId);
    }
    if (result.action === "confirm") {
      return NextResponse.json({ data: { actionItemId: result.actionItemId } });
    }
    return NextResponse.json({ data: { action: result.action } });
  } catch (err) {
    logger.error("POST /api/v1/captures/[id]/review", err, { traceId: session.traceId });
    return jsonError(500, "INTERNAL_ERROR", "Failed to review capture", session.traceId);
  }
});
