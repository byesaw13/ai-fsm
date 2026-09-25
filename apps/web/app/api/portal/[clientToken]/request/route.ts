import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { priceBookCategorySchema, scoreSiteVisitProbability } from "@ai-fsm/domain";
import { getPool } from "@/lib/db";
import { createIntakeRecords } from "@/lib/intake/records";
import { requirePortalClient } from "@/lib/portal/guard";
import { checkRateLimit, getClientIp, BOOKING_RATE_LIMIT } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    property_id: z.string().uuid().optional(),
    address: z.string().trim().min(3).max(500).optional(),
    service_category: priceBookCategorySchema,
    service_description: z.string().trim().min(10).max(2000),
    access_notes: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.property_id || d.address, { message: "Pick an address" });

/**
 * POST /api/portal/[clientToken]/request — TASK-161 "Request service".
 * Same intake pipeline as the public booking form, but the client (and, when
 * picked, the property) is the signed-in one, so staff never retype anything.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientToken: string }> },
) {
  const { clientToken } = await params;
  const guard = await requirePortalClient(clientToken, { write: true });
  if ("response" in guard) return guard.response;
  const { client } = guard;

  const rl = checkRateLimit(`portal-request:${client.id}:${getClientIp(request)}`, BOOKING_RATE_LIMIT);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const data = parsed.data;

  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
    await db.query(
      `SELECT set_config('app.current_account_id', $1, true), set_config('app.current_role', 'owner', true)`,
      [client.account_id],
    );

    let address = data.address ?? "";
    if (data.property_id) {
      // Only an address this client owns — never a sponsored or someone else's.
      const { rows } = await db.query<{ address: string }>(
        `SELECT p.address FROM properties p
         WHERE p.id = $1 AND p.account_id = $2
           AND (p.client_id = $3 OR EXISTS (
             SELECT 1 FROM property_contacts pc
             WHERE pc.property_id = p.id AND pc.client_id = $3 AND pc.role = 'owner'))`,
        [data.property_id, client.account_id, client.id],
      );
      if (!rows[0]) {
        await db.query("ROLLBACK");
        return NextResponse.json({ error: "Address not found" }, { status: 404 });
      }
      address = rows[0].address;
    }

    const decision = scoreSiteVisitProbability({
      service_category: data.service_category,
      service_description: data.service_description,
      intake_metadata: null,
    });
    const preferred = client.preferred_contact;
    const { bookingId } = await createIntakeRecords(db, {
      accountId: client.account_id,
      existingClientId: client.id,
      existingPropertyId: data.property_id ?? null,
      name: client.name,
      email: client.email,
      phone: client.phone,
      serviceCategory: data.service_category,
      serviceDescription: data.service_description,
      preferredDate: new Date().toISOString().slice(0, 10),
      address,
      accessNotes: data.access_notes ?? null,
      preferredContact:
        preferred === "sms" || preferred === "email" || preferred === "phone"
          ? preferred
          : client.email ? "email" : "phone",
      smsConsent: false,
      smsConsentSource: "portal",
      routingPath: decision.path,
      walkthroughScore: decision.score,
      referralSource: "repeat",
    });
    await db.query("COMMIT");
    return NextResponse.json({ ok: true, booking_id: bookingId }, { status: 201 });
  } catch (err) {
    await db.query("ROLLBACK");
    logger.error("POST portal request failed", err);
    return NextResponse.json({ error: "Could not send your request" }, { status: 500 });
  } finally {
    db.release();
  }
}
