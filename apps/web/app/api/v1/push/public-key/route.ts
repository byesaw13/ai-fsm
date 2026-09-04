/**
 * GET /api/v1/push/public-key — the VAPID public key the client needs to
 * subscribe, or `{ configured: false }` when push isn't set up. Served from an
 * endpoint (not a build-time env) so key rotation needs no rebuild.
 */
import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push/vapid";

export const dynamic = "force-dynamic";

export function GET() {
  const key = getVapidPublicKey();
  return NextResponse.json({ data: { configured: Boolean(key), publicKey: key } });
}
