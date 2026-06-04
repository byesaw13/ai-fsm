import { query } from "@/lib/db";

export type ClientContextEstimate = {
  id: string;
  status: string;
  total_cents: number;
  sent_at: string | null;
  notes: string | null;
}

export type ClientContextJob = {
  id: string;
  title: string;
  status: string;
}

export type ClientContextMessage = {
  direction: "inbound" | "outbound";
  body_preview: string | null;
  created_at: string;
}

export interface ClientContext {
  openEstimates: ClientContextEstimate[];
  recentJobs: ClientContextJob[];
  recentMessages: ClientContextMessage[];
}

/**
 * Gather the customer history the SMS classifier needs to be context-aware:
 *  - open estimates (draft/sent) so an approval can target the right one
 *  - recent jobs for follow-up / scheduling context
 *  - the last several messages so a back-and-forth reads as a thread
 *
 * Plain (non-session) reads against the owner's account, mirroring how the
 * internal SMS endpoint already resolves data.
 */
export async function getClientContext(
  accountId: string,
  clientId: string
): Promise<ClientContext> {
  const [openEstimates, recentJobs, recentMessages] = await Promise.all([
    query<ClientContextEstimate>(
      `SELECT id, status, total_cents, sent_at, notes
       FROM estimates
       WHERE account_id = $1 AND client_id = $2 AND status IN ('draft','sent')
       ORDER BY created_at DESC
       LIMIT 10`,
      [accountId, clientId]
    ),
    query<ClientContextJob>(
      `SELECT id, title, status
       FROM jobs
       WHERE account_id = $1 AND client_id = $2
       ORDER BY created_at DESC
       LIMIT 5`,
      [accountId, clientId]
    ),
    query<ClientContextMessage>(
      `SELECT direction, body_preview, created_at
       FROM communications_log
       WHERE account_id = $1 AND client_id = $2
       ORDER BY created_at DESC
       LIMIT 10`,
      [accountId, clientId]
    ),
  ]);

  return { openEstimates, recentJobs, recentMessages };
}

/** Render the context into compact text for the Claude prompt. */
export function renderContextForPrompt(ctx: ClientContext): string {
  if (
    ctx.openEstimates.length === 0 &&
    ctx.recentJobs.length === 0 &&
    ctx.recentMessages.length === 0
  ) {
    return "No prior history — this is a new or unknown contact.";
  }

  const estimates = ctx.openEstimates.length
    ? ctx.openEstimates
        .map(
          (e) =>
            `  - estimate ${e.id} | status=${e.status} | total=$${(e.total_cents / 100).toFixed(2)}${e.notes ? ` | "${e.notes.slice(0, 60)}"` : ""}`
        )
        .join("\n")
    : "  (none)";

  const jobs = ctx.recentJobs.length
    ? ctx.recentJobs.map((j) => `  - job ${j.id} | ${j.title} | status=${j.status}`).join("\n")
    : "  (none)";

  // Oldest → newest so the thread reads naturally
  const thread = ctx.recentMessages.length
    ? [...ctx.recentMessages]
        .reverse()
        .map((m) => `  ${m.direction === "inbound" ? "Customer" : "Nick"}: ${m.body_preview ?? ""}`)
        .join("\n")
    : "  (none)";

  return [
    "Open estimates:",
    estimates,
    "Recent jobs:",
    jobs,
    "Recent message thread (oldest first):",
    thread,
  ].join("\n");
}
