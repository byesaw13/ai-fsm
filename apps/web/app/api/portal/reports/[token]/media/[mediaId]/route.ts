import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { queryOne } from "@/lib/db";
import { visitMediaPath } from "@/lib/pdf/photo-recap";
import { REPORT_PHOTO_CATEGORIES } from "@/lib/job-reports/load";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/portal/reports/[token]/media/[mediaId] — TASK-162. Serves a photo
 * only if it is in that published report's chosen photos and belongs to the
 * report's job. Everything else (unticked, receipts, other jobs) is a 404.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; mediaId: string }> },
) {
  const { token, mediaId } = await params;
  if (!UUID.test(token) || !UUID.test(mediaId)) return notFound();

  const media = await queryOne<{ visit_id: string; filename: string; mime_type: string }>(
    `SELECT vm.visit_id::text, vm.filename, vm.mime_type
     FROM portal_job_updates r
     JOIN visit_media vm ON vm.id = $2 AND vm.id = ANY(r.media_ids) AND vm.account_id = r.account_id
     JOIN visits v ON v.id = vm.visit_id AND v.job_id = r.job_id
     WHERE r.share_token = $1 AND r.status = 'published' AND vm.category = ANY($3::text[])`,
    [token, mediaId, [...REPORT_PHOTO_CATEGORIES]],
  );
  if (!media) return notFound();

  try {
    const buf = fs.readFileSync(visitMediaPath(media.visit_id, media.filename));
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": media.mime_type,
        "Cache-Control": "private, max-age=3600",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
}

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
