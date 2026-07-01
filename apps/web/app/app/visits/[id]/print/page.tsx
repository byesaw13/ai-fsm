import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query, queryOne } from "@/lib/db";
import { buildClientDocumentFilename } from "@/lib/estimates/guardrails";
import { PrintButton } from "./PrintButton";
import type { ChecklistDisposition } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

interface VisitReportRow extends Record<string, unknown> {
  id: string;
  status: string;
  assigned_user_id: string | null;
  scheduled_start: Date;
  scheduled_end: Date;
  completed_at: Date | null;
  tech_notes: string | null;
  materials_used: string | null;
  membership_visit_phase: string;
  included_labor_cap_minutes: number | null;
  included_labor_minutes_used: number;
  job_title: string | null;
  job_type: string | null;
  assigned_user_name: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
}

interface ChecklistRow extends Record<string, unknown> {
  id: string;
  label: string;
  disposition: ChecklistDisposition | null;
  note: string | null;
  section: string;
  sort_order: number;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function addr(
  line1: string | null,
  city: string | null,
  state: string | null,
  zip: string | null
): string {
  const parts = [line1, [city, state].filter(Boolean).join(", "), zip].filter(Boolean);
  return parts.join("\n");
}

interface FindingsSection {
  label: string;
  disposition: ChecklistDisposition;
  intro: string;
}

const FINDINGS_SECTIONS: FindingsSection[] = [
  {
    label: "Requires Attention — Fix Now",
    disposition: "fix_now",
    intro: "The following items need prompt attention. We recommend scheduling a follow-up.",
  },
  {
    label: "Monitor",
    disposition: "monitor",
    intro: "The following items are not urgent but should be watched at the next visit.",
  },
  {
    label: "Optional Improvements",
    disposition: "optional",
    intro: "The following improvements are available at your discretion.",
  },
  {
    label: "Refer to Trade",
    disposition: "refer",
    intro: "The following items fall outside our scope and should be handled by a licensed trade contractor.",
  },
];

export default async function VisitReportPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const visit = await queryOne<VisitReportRow>(
    `SELECT
       v.id, v.status, v.assigned_user_id,
       v.scheduled_start, v.scheduled_end, v.completed_at,
       v.tech_notes, v.materials_used,
       v.membership_visit_phase,
       v.included_labor_cap_minutes,
       v.included_labor_minutes_used,
       j.title      AS job_title,
       j.job_type   AS job_type,
       u.full_name  AS assigned_user_name,
       c.name       AS client_name,
       c.email      AS client_email,
       c.phone      AS client_phone,
       p.address    AS property_address,
       p.city       AS property_city,
       p.state      AS property_state,
       p.zip        AS property_zip
     FROM visits v
     LEFT JOIN jobs       j ON j.id = v.job_id
     LEFT JOIN users      u ON u.id = v.assigned_user_id
     LEFT JOIN clients    c ON c.id = j.client_id
     LEFT JOIN properties p ON p.id = j.property_id
     WHERE v.id = $1 AND v.account_id = $2`,
    [id, session.accountId]
  );

  if (!visit) notFound();

  // Techs can only access their own assigned visits
  if (session.role === "tech" && visit.assigned_user_id !== session.userId) notFound();

  // Report is only valid for completed visits or membership visits in reporting phase
  const isReportable =
    visit.status === "completed" ||
    (visit.job_type === "maintenance" && visit.membership_visit_phase === "reporting");
  if (!isReportable) notFound();

  const checklistItems = await query<ChecklistRow>(
    `SELECT id, label, disposition, note, section, sort_order
     FROM visit_checklist_items
     WHERE visit_id = $1 AND account_id = $2
     ORDER BY sort_order ASC`,
    [id, session.accountId]
  );

  const reportNumber = `RPT-${visit.id.slice(0, 8).toUpperCase()}`;
  const visitDate = fmtDate(visit.completed_at ?? visit.scheduled_start);
  const timeWindow = `${fmtTime(visit.scheduled_start)} – ${fmtTime(visit.scheduled_end)}`;

  const documentFilename = buildClientDocumentFilename({
    date: visit.completed_at ?? visit.scheduled_start,
    clientName: visit.client_name,
    jobType: visit.job_type ?? "maintenance",
    documentType: "visit_report",
    status: "final",
  });

  const serviceAddress = visit.property_address
    ? addr(visit.property_address, visit.property_city, visit.property_state, visit.property_zip)
    : null;

  const completedItems = checklistItems.filter((i) => i.disposition === "ok");
  const hasFindings = FINDINGS_SECTIONS.some((s) =>
    checklistItems.some((i) => i.disposition === s.disposition)
  );

  return (
    <>
      <style>{`
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
        }
        body { font-family: Georgia, serif; color: #111; background: #fff; margin: 0; }
        .wrap { max-width: 780px; margin: 0 auto; padding: 48px 40px; }
        h1 { font-size: 28px; margin: 0; }
        h2 { font-size: 13px; font-weight: 600; text-transform: uppercase;
             letter-spacing: 0.08em; color: #555; margin: 32px 0 8px;
             border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        p { margin: 4px 0; line-height: 1.5; }
        .company-name { font-size: 20px; font-weight: 700; }
        .header-row { display: flex; justify-content: space-between; align-items: flex-start; }
        .meta-label { color: #666; font-size: 12px; }
        .section-block { margin-top: 24px; }
        .intro-note { font-size: 13px; color: #555; margin-bottom: 10px; font-style: italic; }
        ul.findings { list-style: none; padding: 0; margin: 0; }
        ul.findings li { padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 14px; }
        ul.findings li:last-child { border-bottom: none; }
        .item-label { font-weight: 600; }
        .item-note { color: #444; font-size: 13px; margin-top: 2px; }
        .tag { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase;
               letter-spacing: 0.06em; padding: 2px 7px; border-radius: 4px; margin-right: 8px; }
        .tag-ok       { background: #d1fae5; color: #065f46; }
        .tag-fix_now  { background: #fee2e2; color: #991b1b; }
        .tag-monitor  { background: #fef3c7; color: #92400e; }
        .tag-optional { background: #ede9fe; color: #5b21b6; }
        .tag-refer    { background: #f3f4f6; color: #374151; }
        .meta-table { border-collapse: collapse; margin-top: 8px; }
        .meta-table td { padding: 4px 0; font-size: 14px; vertical-align: top; }
        .meta-table td:first-child { color: #666; width: 140px; font-size: 13px; }
        .cap-bar-wrap { background: #eee; border-radius: 4px; height: 8px; width: 200px; display: inline-block; vertical-align: middle; margin-left: 8px; }
        .cap-bar-fill { height: 100%; border-radius: 4px; background: #111; }
        .footer { margin-top: 56px; padding-top: 16px; border-top: 1px solid #ddd;
                  font-size: 12px; color: #888; text-align: center; }
      `}</style>

      <PrintButton />

      <div className="wrap">
        {/* Header */}
        <div className="header-row">
          <div>
            <div className="company-name">Dovetails Services LLC</div>
            <p style={{ color: "#666", fontSize: 13 }}>Licensed &amp; Insured</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <h1>Visit Report</h1>
            <p className="meta-label">{reportNumber}</p>
            <p className="meta-label no-print">{documentFilename}</p>
            <p className="meta-label">{visitDate}</p>
          </div>
        </div>

        {/* Client + Service Address */}
        <div style={{ display: "flex", gap: 48, marginTop: 32 }}>
          {visit.client_name && (
            <div>
              <h2 style={{ margin: "0 0 6px" }}>Prepared For</h2>
              <p style={{ fontWeight: 600 }}>{visit.client_name}</p>
              {visit.client_email && <p>{visit.client_email}</p>}
              {visit.client_phone && <p>{visit.client_phone}</p>}
            </div>
          )}
          {serviceAddress && (
            <div>
              <h2 style={{ margin: "0 0 6px" }}>Service Address</h2>
              <p style={{ whiteSpace: "pre-wrap" }}>{serviceAddress}</p>
            </div>
          )}
        </div>

        {/* Visit Details */}
        <div className="section-block">
          <h2>Visit Details</h2>
          <table className="meta-table">
            <tbody>
              {visit.job_title && (
                <tr>
                  <td>Project</td>
                  <td>{visit.job_title}</td>
                </tr>
              )}
              <tr>
                <td>Date</td>
                <td>{visitDate}</td>
              </tr>
              <tr>
                <td>Scheduled Window</td>
                <td>{timeWindow}</td>
              </tr>
              {visit.assigned_user_name && (
                <tr>
                  <td>Technician</td>
                  <td>{visit.assigned_user_name}</td>
                </tr>
              )}
              {visit.included_labor_cap_minutes !== null && (
                <tr>
                  <td>Included Labor</td>
                  <td>
                    {visit.included_labor_minutes_used} of {visit.included_labor_cap_minutes} min used
                    <span className="cap-bar-wrap">
                      <span
                        className="cap-bar-fill"
                        style={{
                          width: `${Math.min(100, Math.round((visit.included_labor_minutes_used / visit.included_labor_cap_minutes) * 100))}%`,
                        }}
                      />
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Work Completed */}
        {completedItems.length > 0 && (
          <div className="section-block">
            <h2>Work Completed</h2>
            <ul className="findings">
              {completedItems.map((item) => (
                <li key={item.id}>
                  <span className="tag tag-ok">OK</span>
                  <span className="item-label">{item.label}</span>
                  {item.note && <div className="item-note">{item.note}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Findings: Fix Now / Monitor / Optional / Refer */}
        {hasFindings && (
          <div className="section-block">
            <h2>Findings &amp; Recommendations</h2>
            {FINDINGS_SECTIONS.map(({ label, disposition, intro }) => {
              const items = checklistItems.filter((i) => i.disposition === disposition);
              if (items.length === 0) return null;
              return (
                <div key={disposition} style={{ marginBottom: 24 }}>
                  <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{label}</p>
                  <p className="intro-note">{intro}</p>
                  <ul className="findings">
                    {items.map((item) => (
                      <li key={item.id}>
                        <span className={`tag tag-${disposition}`}>
                          {disposition === "fix_now" ? "Fix Now"
                            : disposition === "monitor" ? "Monitor"
                            : disposition === "optional" ? "Optional"
                            : "Refer"}
                        </span>
                        <span className="item-label">{item.label}</span>
                        {item.note && <div className="item-note">{item.note}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {/* Tech Notes */}
        {visit.tech_notes && (
          <div className="section-block">
            <h2>Technician Notes</h2>
            <p style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{visit.tech_notes}</p>
          </div>
        )}

        {/* Materials Used */}
        {visit.materials_used && (
          <div className="section-block">
            <h2>Materials Used</h2>
            <p style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{visit.materials_used}</p>
          </div>
        )}

        {/* Next Steps */}
        {hasFindings && (
          <div className="section-block">
            <h2>Next Steps</h2>
            <p style={{ fontSize: 14 }}>
              Please review the findings above. Items marked <strong>Fix Now</strong> should be
              addressed promptly — contact us to schedule a follow-up. Items marked{" "}
              <strong>Monitor</strong> will be re-evaluated at your next membership visit.
            </p>
          </div>
        )}

        <div className="footer">
          Dovetails Services LLC &nbsp;·&nbsp; {reportNumber} &nbsp;·&nbsp; {visitDate}
        </div>
      </div>
    </>
  );
}
