import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { queryForSession } from "@/lib/db";
import { SystemMap, type MapNote } from "./SystemMap";

export const dynamic = "force-dynamic";

/** Owner-only picture of the job path, the backlog on each step, and unused files. */
export default async function SystemMapPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/app");

  let notes: MapNote[] = [];
  let notesReady = true;
  try {
    const rows = await queryForSession<{ id: string; node_id: string; body: string; created_at: string }>(
      session,
      `SELECT id, node_id, body, created_at::text
       FROM map_notes
       WHERE account_id = $1
       ORDER BY created_at`,
      [session.accountId],
    );
    notes = rows.map((row) => ({ id: row.id, nodeId: row.node_id, body: row.body, createdAt: row.created_at }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/map_notes/.test(message) && /does not exist/.test(message)) notesReady = false;
    else throw error;
  }

  return <SystemMap notes={notes} notesReady={notesReady} />;
}
