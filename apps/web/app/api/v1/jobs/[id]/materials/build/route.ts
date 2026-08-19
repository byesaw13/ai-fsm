import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { hydrateBuyListLocations } from "@/lib/jobs/buy-list-seed";
import {
  expandMaterialTemplatesDetailed,
  type MaterialTemplateRow,
} from "@/lib/jobs/material-templates";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  price_book_codes: z.array(z.string().trim().min(1).max(20)).min(1).max(30),
  dimensions: z.record(z.number().finite().nonnegative()).optional(),
  include_optional: z.boolean().optional().default(false),
  include_consumable: z.boolean().optional().default(false),
  customer_supplied: z.array(z.string().trim().max(200)).max(50).optional().default([]),
  task_qty: z.number().finite().positive().max(99).optional().default(1),
  /** When true, insert lines; when false, return preview only */
  commit: z.boolean().optional().default(true),
});

function jobIdFromUrl(url: string): string | null {
  const m = url.match(/\/jobs\/([^/]+)\/materials\/build/);
  return m?.[1] ?? null;
}

function lineKey(name: string, unit: string | null | undefined): string {
  return `${name.trim().toLowerCase()}||${(unit ?? "").trim().toLowerCase()}`;
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

      await client.query(`SELECT id FROM jobs WHERE id = $1 AND account_id = $2 FOR UPDATE`, [
        jobId,
        session.accountId,
      ]);

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

      const matchedCodes = [...new Set(templates.rows.map((r) => r.price_book_code))];
      const missingCodes = codes.filter((c) => !matchedCodes.includes(c));

      if (templates.rows.length === 0) {
        return NextResponse.json(
          {
            error: {
              code: "NO_TEMPLATES",
              message:
                "No material templates for those price-book tasks yet. Add templates on the price book or pick different tasks.",
              missing_codes: missingCodes,
              traceId: session.traceId,
            },
          },
          { status: 422 },
        );
      }

      const { lines: expanded, omitted } = expandMaterialTemplatesDetailed(templates.rows, {
        dimensions: parsed.data.dimensions,
        includeOptional: parsed.data.include_optional,
        includeConsumable: parsed.data.include_consumable,
        customerSuppliedNames: parsed.data.customer_supplied,
        taskQty: parsed.data.task_qty,
      });

      const unresolvedMustBuy = omitted.filter(
        (o) => o.role === "must_buy" && o.reason === "missing_dimension",
      );

      const requiredInputs = [
        ...new Set(
          templates.rows
            .filter((t) => t.input_key && (t.role === "must_buy" || parsed.data.include_optional || parsed.data.include_consumable))
            .map((t) => t.input_key as string),
        ),
      ];

      const existing = await client.query<{
        name: string;
        unit_label: string | null;
        status: string;
      }>(
        `SELECT name, unit_label, status FROM job_material_lines
         WHERE job_id = $1 AND account_id = $2`,
        [jobId, session.accountId],
      );

      const blocking = new Set(
        existing.rows
          .filter((r) => r.status === "needed" || r.status === "on_truck")
          .map((r) => lineKey(r.name, r.unit_label)),
      );
      const otherExisting = new Set(
        existing.rows
          .filter((r) => r.status !== "needed" && r.status !== "on_truck")
          .map((r) => lineKey(r.name, r.unit_label)),
      );

      const skipped = expanded
        .filter((line) => {
          const key = lineKey(line.name, line.unit_label);
          return blocking.has(key) || otherExisting.has(key);
        })
        .map((line) => ({
          name: line.name,
          reason: blocking.has(lineKey(line.name, line.unit_label))
            ? "already_on_list"
            : "already_resolved",
        }));

      const toInsert = expanded.filter((line) => {
        const key = lineKey(line.name, line.unit_label);
        return !blocking.has(key) && !otherExisting.has(key);
      });

      const hydrated = await hydrateBuyListLocations(
        client,
        session.accountId,
        toInsert.map((line, index) => ({
          name: line.name,
          quantity: line.quantity,
          unit_label: line.unit_label,
          store_section: line.store_section,
          status: "needed" as const,
          source: "kit" as const,
          catalog_material_id: line.catalog_material_id,
          sku: line.sku,
          notes: line.price_book_code ? `From task ${line.price_book_code}` : null,
          sort_order: index,
          supplier: line.supplier,
          aisle: line.aisle,
          bay: line.bay,
        })),
      );

      const previewLines = expanded.map((line) => {
        const key = lineKey(line.name, line.unit_label);
        const already = blocking.has(key) || otherExisting.has(key);
        const loc = hydrated.find((h) => lineKey(h.name, h.unit_label) === key);
        return {
          ...line,
          catalog_material_id: loc?.catalog_material_id ?? line.catalog_material_id,
          supplier: loc?.supplier ?? line.supplier,
          aisle: loc?.aisle ?? line.aisle,
          bay: loc?.bay ?? line.bay,
          already_on_list: already,
        };
      });

      if (!parsed.data.commit) {
        return NextResponse.json({
          data: {
            mode: "preview",
            lines: previewLines,
            omitted,
            skipped,
            missing_codes: missingCodes,
            matched_codes: matchedCodes,
            required_inputs: requiredInputs,
            template_count: templates.rows.length,
            unresolved_must_buy: unresolvedMustBuy.length,
          },
        });
      }

      if (unresolvedMustBuy.length > 0) {
        return NextResponse.json(
          {
            error: {
              code: "MISSING_DIMENSION",
              message: "Enter measurements before adding must-buy items.",
              omitted: unresolvedMustBuy,
              required_inputs: requiredInputs,
              traceId: session.traceId,
            },
          },
          { status: 422 },
        );
      }

      const maxSort = await client.query<{ m: string | null }>(
        `SELECT MAX(sort_order)::text AS m FROM job_material_lines
         WHERE job_id = $1 AND account_id = $2`,
        [jobId, session.accountId],
      );
      let sortOrder = (parseInt(maxSort.rows[0]?.m ?? "-1", 10) || -1) + 1;

      const inserted: unknown[] = [];
      for (const line of hydrated) {
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
            line.notes,
            sortOrder++,
            line.supplier,
            line.aisle,
            line.bay,
            expanded.find((e) => lineKey(e.name, e.unit_label) === lineKey(line.name, line.unit_label))
              ?.role ?? "must_buy",
            expanded.find((e) => lineKey(e.name, e.unit_label) === lineKey(line.name, line.unit_label))
              ?.price_book_code ?? null,
          ],
        );
        inserted.push(ins.rows[0]);
      }

      await client.query(
        `UPDATE jobs SET materials_plan_seeded_at = COALESCE(materials_plan_seeded_at, now())
         WHERE id = $1 AND account_id = $2`,
        [jobId, session.accountId],
      );

      logger.info("POST /api/v1/jobs/[id]/materials/build committed", {
        traceId: session.traceId,
        jobId,
        codes: matchedCodes,
        inserted: inserted.length,
        skipped: skipped.length,
        omitted: omitted.length,
      });

      return NextResponse.json({
        data: {
          mode: "committed",
          inserted: inserted.length,
          skipped_existing: skipped.length,
          skipped,
          omitted,
          missing_codes: missingCodes,
          matched_codes: matchedCodes,
          lines: inserted,
          preview: previewLines,
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
