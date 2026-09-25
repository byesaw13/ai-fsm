import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getPortalSession, PREVIEW_READ_ONLY_MESSAGE } from "./session";

export interface PortalClient extends Record<string, unknown> {
  id: string;
  account_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  preferred_contact: string | null;
  sms_consent: boolean;
}

/**
 * Portal API guard: the portal token alone never authorizes anything — the
 * browser must hold a portal session for that same client. `write` requests
 * are refused during a staff preview (TASK-160).
 */
export async function requirePortalClient(
  clientToken: string,
  opts: { write: boolean },
): Promise<{ client: PortalClient } | { response: NextResponse }> {
  const client = await queryOne<PortalClient>(
    `SELECT id::text, account_id::text, name, email, phone, preferred_contact, sms_consent
     FROM clients WHERE portal_token = $1`,
    [clientToken],
  );
  const session = await getPortalSession();
  if (!client || !session || session.clientId !== client.id) {
    return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }
  if (opts.write && session.isPreview) {
    return { response: NextResponse.json({ error: PREVIEW_READ_ONLY_MESSAGE }, { status: 403 }) };
  }
  return { client };
}
