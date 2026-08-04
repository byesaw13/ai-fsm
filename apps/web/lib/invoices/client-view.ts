/**
 * Client portal view tracking for invoices.
 * Not a billing status — sits alongside sent/partial/paid.
 */

export type InvoiceViewFields = {
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
};

/** True when the invoice was sent and the client has never opened the portal link. */
export function isInvoiceUnread(input: {
  status: string;
  sent_at?: string | null;
  first_viewed_at?: string | null;
}): boolean {
  if (!["sent", "partial", "overdue"].includes(input.status)) return false;
  // Treat as "out to client" if status is open-billing, even if sent_at is null
  // (older rows / edge transitions).
  return !input.first_viewed_at;
}

export function formatInvoiceViewLabel(input: {
  status: string;
  first_viewed_at?: string | null;
  last_viewed_at?: string | null;
  view_count?: number | null;
}): { kind: "unread" | "viewed" | "none"; label: string; title?: string } {
  if (!["sent", "partial", "overdue", "paid"].includes(input.status)) {
    return { kind: "none", label: "" };
  }
  if (!input.first_viewed_at) {
    if (input.status === "paid") return { kind: "none", label: "" };
    return { kind: "unread", label: "Not opened" };
  }
  const when = new Date(input.last_viewed_at ?? input.first_viewed_at);
  const whenLabel = when.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const count = input.view_count ?? 1;
  return {
    kind: "viewed",
    label: count > 1 ? `Opened ${count}× · ${whenLabel}` : `Opened ${whenLabel}`,
    title: `First opened ${new Date(input.first_viewed_at).toLocaleString()}`,
  };
}

/**
 * Stamp a portal open. Uses the app DB role (bypasses RLS) via a raw pool client
 * or any client that can UPDATE invoices by share_token.
 *
 * Returns whether the row was updated, and whether this open set first_viewed_at
 * for the first time (for attention events).
 */
export async function recordInvoicePortalView(
  queryFn: (
    sql: string,
    params: unknown[],
  ) => Promise<{ rowCount: number | null; rows?: Array<Record<string, unknown>> }>,
  shareToken: string,
): Promise<{ updated: boolean; firstOpen: boolean; invoice?: {
  id: string;
  account_id: string;
  invoice_number: string;
  client_name: string | null;
} }> {
  // Capture prior first_viewed_at so we only emit attention on first open.
  const before = await queryFn(
    `SELECT i.id, i.account_id, i.invoice_number, i.first_viewed_at, c.name AS client_name
     FROM invoices i
     LEFT JOIN clients c ON c.id = i.client_id
     WHERE i.share_token = $1
       AND i.status IN ('sent', 'partial', 'overdue')`,
    [shareToken],
  );
  const row = before.rows?.[0] as
    | {
        id: string;
        account_id: string;
        invoice_number: string;
        first_viewed_at: string | null;
        client_name: string | null;
      }
    | undefined;
  if (!row) return { updated: false, firstOpen: false };

  const wasFirst = !row.first_viewed_at;

  // Only stamp open client-facing invoices. Draft never left the shop; paid/void
  // stay fully money-immutable (view carve-out still exists for edge retries).
  const result = await queryFn(
    `UPDATE invoices
     SET first_viewed_at = COALESCE(first_viewed_at, now()),
         last_viewed_at = now(),
         view_count = view_count + 1
     WHERE share_token = $1
       AND status IN ('sent', 'partial', 'overdue')`,
    [shareToken],
  );
  const updated = (result.rowCount ?? 0) > 0;
  return {
    updated,
    firstOpen: updated && wasFirst,
    invoice: {
      id: row.id,
      account_id: row.account_id,
      invoice_number: row.invoice_number,
      client_name: row.client_name,
    },
  };
}
