import type { PoolClient } from "pg";

/** Last 10 digits of a US phone however it was typed, or null if it isn't one. */
export function phoneDigits(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? d : null;
}

/**
 * The existing customer with this email (any case) or phone (any format), so
 * every door that adds a customer finds the one already on file (TASK-249).
 * A number that isn't 10 digits still matches when typed exactly the same.
 */
export async function findClientByContact(
  client: PoolClient,
  accountId: string,
  contact: { phone?: string | null; email?: string | null },
): Promise<string | null> {
  const email = contact.email?.trim().toLowerCase();
  if (email) {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM clients WHERE account_id = $1 AND lower(email) = $2 ORDER BY created_at LIMIT 1`,
      [accountId, email],
    );
    if (rows[0]) return rows[0].id;
  }
  const phone = contact.phone?.trim();
  if (phone) {
    const digits = phoneDigits(phone);
    const { rows } = await client.query<{ id: string }>(
      digits
        ? `SELECT id FROM clients
           WHERE account_id = $1
             AND right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $2
           ORDER BY created_at LIMIT 1`
        : `SELECT id FROM clients WHERE account_id = $1 AND phone = $2 ORDER BY created_at LIMIT 1`,
      [accountId, digits ?? phone],
    );
    if (rows[0]) return rows[0].id;
  }
  return null;
}
