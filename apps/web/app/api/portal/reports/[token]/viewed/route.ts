import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isPortalPreview } from "@/lib/portal/session";
import { withPublishedReport } from "@/lib/job-reports/public";
import { isAutomatedUserAgent } from "@/lib/job-reports/bots";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/portal/reports/[token]/viewed — counts a customer opening a Job
 * Report. Sent by a script once the page is actually shown in a browser, so
 * SMS/email link previews and mail scanners (which fetch the page but don't
 * run it) never count. Also skipped: known bot agents, staff of the account,
 * staff "view as client" previews, and repeat reloads from the same device
 * within 30 minutes. Always answers 204 so nothing can probe it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const done = () => new NextResponse(null, { status: 204 });
  if (!UUID.test(token) || isAutomatedUserAgent(request.headers.get("user-agent"))) return done();

  const repeat = !checkRateLimit(`report-view:${token}:${getClientIp(request)}`, { limit: 1, windowSeconds: 30 * 60 }).allowed;
  if (repeat) return done();

  const staff = await getSession();
  await withPublishedReport(token, async (db, accountId) => {
    if (staff?.accountId === accountId) return;
    const { rows } = await db.query<{ client_id: string }>(
      `SELECT client_id::text FROM portal_job_updates WHERE share_token = $1 AND account_id = $2`,
      [token, accountId],
    );
    if (!rows[0] || (await isPortalPreview(rows[0].client_id))) return;
    await db.query(
      `UPDATE portal_job_updates
       SET view_count = view_count + 1, first_viewed_at = COALESCE(first_viewed_at, now())
       WHERE share_token = $1 AND account_id = $2`,
      [token, accountId],
    );
  });
  return done();
}
