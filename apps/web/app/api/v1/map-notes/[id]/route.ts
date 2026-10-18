import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";

export const dynamic = "force-dynamic";

const NOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DELETE = withRole(["owner"], async (request, session) => {
  const id = request.nextUrl.pathname.split("/").pop() ?? "";
  if (!NOTE_ID.test(id)) return NextResponse.json({ error: "Missing note." }, { status: 400 });
  try {
    await withDbSession(session, async (client) => {
      await client.query(`DELETE FROM map_notes WHERE id = $1 AND account_id = $2`, [id, session.accountId]);
    });
  } catch (error) {
    const missing = error instanceof Error && /map_notes/.test(error.message) && /does not exist/.test(error.message);
    return NextResponse.json(
      { error: missing ? "Map requests are not in the database yet. Run migrations, then save again." : "Could not remove that request." },
      { status: missing ? 503 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
});
