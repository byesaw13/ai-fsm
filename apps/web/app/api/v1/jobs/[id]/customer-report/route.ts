import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole, type AuthSession } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { appUrl, sendEmail } from "@/lib/email/mailer";
import { logCommunication } from "@/lib/communications-log";
import { normalizePhone } from "@/lib/phone";
import { isSmsGatewayConfigured, sendSmsViaGateway } from "@/lib/sms/gateway";
import { logOutboundSms } from "@/lib/sms/outbound";
import { loadReportEditor } from "@/lib/job-reports/load";
import { cleanRecords, REPORT_AREAS, REPORT_WORK_TYPES } from "@/lib/job-reports/logic";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const content = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(4000),
  area: z.enum(Object.keys(REPORT_AREAS) as [string, ...string[]]).nullable(),
  work_type: z.enum(Object.keys(REPORT_WORK_TYPES) as [string, ...string[]]).nullable(),
  media_ids: z.array(z.string().uuid()).max(40),
  records: z.array(z.object({ label: z.string().max(200), detail: z.string().max(500) })).max(40),
});
const body = z.discriminatedUnion("action", [
  content.extend({ action: z.literal("save") }),
  content.extend({ action: z.literal("publish") }),
  z.object({ action: z.literal("withdraw") }),
  z.object({ action: z.literal("send"), channel: z.enum(["email", "sms"]) }),
]);

const reportUrl = (token: string) => `${appUrl()}/portal/reports/${token}`;

/**
 * POST /api/v1/jobs/[id]/customer-report — TASK-162.
 * save | publish | withdraw | send. Owner/admin only. Nothing reaches the
 * customer until publish; withdraw rotates the share token.
 */
export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const jobId = request.nextUrl.pathname.split("/").at(-2)!;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid report", traceId: session.traceId } }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const result = await withDbSession(session, async (db) => {
      const editor = await loadReportEditor(db, session.accountId, jobId);
      if (!editor) return { status: 404, error: "Job not found" } as const;
      const report = editor.report;

      if (input.action === "withdraw") {
        if (!report) return { status: 404, error: "No report yet" } as const;
        await db.query(
          `UPDATE portal_job_updates SET status = 'withdrawn', share_token = gen_random_uuid() WHERE id = $1`,
          [report.id],
        );
        return { status: 200, data: { status: "withdrawn" } } as const;
      }

      if (input.action === "send") {
        if (!report || report.status !== "published") return { status: 409, error: "Publish the report first" } as const;
        return { status: 200, send: { report, editor } } as const;
      }

      if (!editor.recipient.ok) return { status: 409, error: editor.recipient.reason } as const;
      const allowed = new Set(editor.photos.map((p) => p.id));
      if (!input.media_ids.every((id) => allowed.has(id))) {
        return { status: 400, error: "A photo isn't from this job" } as const;
      }
      const records = cleanRecords(input.records);
      const publish = input.action === "publish";
      const { rows } = await db.query<{ share_token: string; status: string }>(
        `INSERT INTO portal_job_updates
           (account_id, job_id, property_id, client_id, sponsored, title, summary, area, work_type,
            media_ids, records, status, published_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid[], $11::jsonb,
                 CASE WHEN $12 THEN 'published' ELSE 'draft' END,
                 CASE WHEN $12 THEN now() END, $13)
         ON CONFLICT (job_id) DO UPDATE SET
           property_id = EXCLUDED.property_id, client_id = EXCLUDED.client_id, sponsored = EXCLUDED.sponsored,
           title = EXCLUDED.title, summary = EXCLUDED.summary, area = EXCLUDED.area,
           work_type = EXCLUDED.work_type, media_ids = EXCLUDED.media_ids, records = EXCLUDED.records,
           status = CASE WHEN $12 OR portal_job_updates.status = 'published' THEN 'published' ELSE 'draft' END,
           published_at = CASE WHEN $12 THEN COALESCE(portal_job_updates.published_at, now())
                               ELSE portal_job_updates.published_at END
         RETURNING share_token::text, status`,
        [
          session.accountId, jobId, editor.job.property_id, editor.recipient.clientId,
          editor.recipient.sponsored, input.title, input.summary, input.area, input.work_type,
          input.media_ids, JSON.stringify(editor.recipient.sponsored ? [] : records), publish, session.userId,
        ],
      );
      return { status: 200, data: { status: rows[0].status, url: reportUrl(rows[0].share_token) } } as const;
    });

    if ("error" in result) {
      return NextResponse.json({ error: { code: "REJECTED", message: result.error, traceId: session.traceId } }, { status: result.status });
    }
    if ("data" in result) return NextResponse.json(result.data);

    // send — outside the transaction (network calls).
    const { report, editor } = result.send;
    const r = editor.recipient;
    if (!r.ok) return NextResponse.json({ error: { code: "REJECTED", message: r.reason } }, { status: 409 });
    const url = reportUrl(report.share_token);
    const first = (r.name ?? "").split(" ")[0] || "there";
    const channel = (input as { channel: "email" | "sms" }).channel;

    if (channel === "email") {
      if (!r.email) return NextResponse.json({ error: { code: "REJECTED", message: "No email on file" } }, { status: 409 });
      const sent = await sendEmail({
        to: r.email,
        subject: `Your job report: ${report.title}`,
        text: `Hi ${first},\n\nHere's what we did${editor.job.address ? ` at ${editor.job.address}` : ""}, with photos:\n${url}\n\nThanks,\nDovetails`,
        html: `<p>Hi ${escapeHtml(first)},</p><p>Here's what we did${editor.job.address ? ` at ${escapeHtml(editor.job.address)}` : ""}, with photos:</p><p><a href="${url}">View your job report</a></p><p>Thanks,<br>Dovetails</p>`,
      });
      await logCommunication({
        accountId: session.accountId, channel: "email", direction: "outbound", outcome: sent.ok ? "sent" : "failed",
        clientId: r.clientId, jobId, bodyPreview: `Job report: ${report.title}`, initiatedBy: session.userId,
      });
      if (!sent.ok) return NextResponse.json({ error: { code: "SEND_FAILED", message: sent.error ?? "Email failed" } }, { status: 502 });
      return NextResponse.json({ sent: "email" });
    }

    const phone = normalizePhone(r.phone);
    if (!isSmsGatewayConfigured() || !phone || !r.smsConsent) {
      return NextResponse.json({ error: { code: "REJECTED", message: "Texting isn't available for this customer — copy the link instead." } }, { status: 409 });
    }
    const message = `Dovetails: ${report.title} is done. Photos and details: ${url} Reply STOP to opt out.`;
    const sent = await sendSmsViaGateway({ phone, message });
    await logOutboundSms({
      accountId: session.accountId, clientId: r.clientId, jobId, bodyPreview: message,
      outcome: sent.ok ? "sent" : "failed", initiatedBy: session.userId,
    });
    if (!sent.ok) return NextResponse.json({ error: { code: "SEND_FAILED", message: sent.error } }, { status: 502 });
    return NextResponse.json({ sent: "sms" });
  } catch (err) {
    logger.error("POST customer-report failed", err, { traceId: session.traceId });
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Could not save the report", traceId: session.traceId } }, { status: 500 });
  }
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
