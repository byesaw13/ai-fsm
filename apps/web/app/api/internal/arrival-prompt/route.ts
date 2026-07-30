import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const KEY = process.env.LOCATION_INTERNAL_KEY;

const bodySchema = z.object({
  candidate_id: z.string().uuid(),
  action: z.literal("prompted"),
});

/**
 * HA Companion ack after sending an arrival push notification.
 * Stamps visit_candidates.live_prompted_at so we only interrupt once.
 */
export async function POST(req: NextRequest) {
  if (!KEY || req.headers.get("x-api-key") !== KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const client = await getPool().connect();
  try {
    // Resolve account from candidate (internal key is account-agnostic single-tenant deploy).
    const { rows } = await client.query<{ id: string; live_prompted_at: string | null }>(
      `UPDATE visit_candidates
       SET live_prompted_at = COALESCE(live_prompted_at, now()), updated_at = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING id, live_prompted_at::text`,
      [parsed.data.candidate_id],
    );
    if (!rows[0]) {
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, already: Boolean(rows[0].live_prompted_at) });
  } finally {
    client.release();
  }
}
