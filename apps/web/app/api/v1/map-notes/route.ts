import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { ALL_NODES } from "@/app/app/map/map-data";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  nodeId: z.string().refine((id) => ALL_NODES.some((node) => node.id === id), "Unknown bubble"),
  body: z.string().trim().min(1).max(500),
});

export const POST = withRole(["owner"], async (request, session) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Say which bubble, and write the request in one short note." }, { status: 400 });
  }
  try {
    const note = await withDbSession(session, async (client) => {
      const result = await client.query<{ id: string; node_id: string; body: string; created_at: string }>(
        `INSERT INTO map_notes (account_id, node_id, body, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, node_id, body, created_at`,
        [session.accountId, parsed.data.nodeId, parsed.data.body, session.userId],
      );
      return result.rows[0];
    });
    return NextResponse.json({
      note: { id: note.id, nodeId: note.node_id, body: note.body, createdAt: note.created_at },
    });
  } catch (error) {
    const missing = error instanceof Error && /map_notes/.test(error.message) && /does not exist/.test(error.message);
    return NextResponse.json(
      { error: missing ? "Map requests are not in the database yet. Run migrations, then save again." : "Could not save that request." },
      { status: missing ? 503 : 500 },
    );
  }
});
