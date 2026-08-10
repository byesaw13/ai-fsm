import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  expandMaterialTemplates,
  type MaterialTemplateRow,
} from "@/lib/jobs/material-templates";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  price_book_codes: z.array(z.string().trim().min(1).max(20)).min(1).max(30),
  dimensions: z.record(z.number().nonnegative()).optional(),
  include_optional: z.boolean().optional().default(false),
  include_consumable: z.boolean().optional().default(false),
  customer_supplied: z.array(z.string()).optional().default([]),
  /** When true, insert lines; when false, return preview only */
  commit: z.boolean().optional().default(true),
});

function jobIdFromUrl(url: string): string | null {
  const m = url.match(/\/jobs\/([^/]+)\/materials\/build/);
  return m?.[1] ?? null;
}

async function assertJobAccess(
  client: { query: (q: string, p?: unknown[]) => Promise<{ rowCount: number | null }> },
  jobId: string,
  accountId: string,
  role: string,
  userId: string,
): Promise<"ok" | "not_found" | "forbidden"> {
  const job = await client.query(`SELECT id FROM jobs WHERE id = $1 AND account_id = $2`, [
    jobId,
    accountId,
  ]);
  if ((job.rowCount ?? 0) === 0) return "not_found";
  if (role === "tech") {
    const assigned = await client.query(
      `SELECT id FROM visits
       WHERE job_id = $1 AND account_id = $2 AND assigned_user_id = $3
       LIMIT 1`,
      [jobId, accountId, userId],
    );
    if ((assigned.rowCount ?? 0) === 0) return "forbidden";
  }
  return "ok";
}

/** POST — expand price-book material templates into the job buy list */
export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  const jobId = jobIdFromUrl(request.url);
  if (!jobId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
      { status: 404 },
    );
  }

  if (session.role === "tech") {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Techs cannot build buy lists from templates",
          traceId: session.traceId,
        },
      },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid body",
          details: parsed.error.flatten().fieldErrors,
          traceId: session.traceId,
        },
      },
      { status: 422 },
    );
  }

  try {
    return await withDbSession(session, async (client) => {
      const access = await assertJobAccess(
        client,
        jobId,
        session.accountId,
        session.role,
        session.userId,
      );
      if (access === "not_found") {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
          { status: 404 },
        );
      }
      if (access === "forbidden") {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Not assigned to this job", traceId: session.traceId } },
          { status: 403 },
        );
      }

      const codes = parsed.data.price_book_codes.map((c) => c.trim());
      const templates = await client.query<MaterialTemplateRow>(
        `SELECT t.id, t.price_book_id, pb.code AS price_book_code, pb.name AS price_book_name,
                t.catalog_material_id, t.material_name, t.quantity_type,
                t.quantity_flat::float, t.input_key, t.quantity_multiplier::float,
                t.waste_factor::float, t.role, t.unit_label, t.store_section, t.sort_order,
                mpb.unit_cost_cents, mpb.supplier, mpb.preferred_vendor, mpb.product_url,
                mpb.search_query, mpb.sku, mpb.aisle, mpb.bay
         FROM price_book_material_templates t
         JOIN price_book pb ON pb.id = t.price_book_id
         LEFT JOIN materials_price_book mpb
           ON mpb.id = t.catalog_material_id AND mpb.account_id = $1
         WHERE pb.code = ANY($2::text[])
         ORDER BY pb.code, t.sort_order, t.material_name`,
        [session.accountId, codes],
      );

      if (templates.rows.length === 0) {
        return NextResponse.json(
          {
            error: {
              code: "NO_TEMPLATES",
              message:
                "No material templates for those price-book tasks yet. Add templates on the price book or pick different tasks.",
              traceId: session.traceId,
            },
          },
          { status: 422 },
        );
      }

      const expanded = expandMaterialTemplates(templates.rows, {
        dimensions: parsed.data.dimensions,
        includeOptional: parsed.data.include_optional,
        includeConsumable: parsed.data.include_consumable,
        customerSuppliedNames: parsed.data.customer_supplied,
      });

      if (!parsed.data.commit) {
        return NextResponse.json({
          data: { mode: "preview", lines: expanded, template_count: templates.rows.length },
        });
      }

      // Dedupe against existing buy list (name + unit)
      const existing = await client.query<{ name: string; unit_label: string | null }>(
        `SELECT name, unit_label FROM job_material_lines
         WHERE job_id = $1 AND account_id = $2`,
        [jobId, session.accountId],
      );
      const seen = new Set(
        existing.rows.map(
          (r) =>
            `${r.name.trim().toLowerCase()}||${(r.unit_label ?? "").trim().toLowerCase()}`,
        ),
      );

      const maxSort = await client.query<{ m: string | null }>(
        `SELECT MAX(sort_order)::text AS m FROM job_material_lines
         WHERE job_id = $1 AND account_id = $2`,
        [jobId, session.accountId],
      );
      let sortOrder = (parseInt(maxSort.rows[0]?.m ?? "-1", 10) || -1) + 1;

      const inserted: unknown[] = [];
      for (const line of expanded) {
        const key = `${line.name.trim().toLowerCase()}||${(line.unit_label ?? "").trim().toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const ins = await client.query(
          `INSERT INTO job_material_lines
             (account_id, job_id, name, quantity, unit_label, store_section,
              status, source, catalog_material_id, sku, notes, sort_order,
              supplier, aisle, bay, role, generation_source, price_book_code)
           VALUES ($1,$2,$3,$4,$5,$6,'needed','kit',$7,$8,$9,$10,$11,$12,$13,$14,'template',$15)
           RETURNING *`,
          [
            session.accountId,
            jobId,
            line.name,
            line.quantity,
            line.unit_label,
            line.store_section,
            line.catalog_material_id,
            line.sku,
            line.price_book_code ? `From task ${line.price_book_code}` : null,
            sortOrder++,
            line.supplier,
            line.aisle,
            line.bay,
            line.role,
            line.price_book_code,
          ],
        );
        inserted.push(ins.rows[0]);
      }

      return NextResponse.json({
        data: {
          mode: "committed",
          inserted: inserted.length,
          skipped_existing: expanded.length - inserted.length,
          lines: inserted,
          preview: expanded,
        },
      });
    });
  } catch (err) {
    logger.error("POST /api/v1/jobs/[id]/materials/build", err, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Could not build materials from templates",
          traceId: session.traceId,
        },
      },
      { status: 500 },
    );
  }
});
