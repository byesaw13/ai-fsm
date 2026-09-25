import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getPool, queryOne, query } from "@/lib/db";
import { derivePortalStage, CUSTOMER_STAGE_ORDER, CUSTOMER_STAGE_LABELS, CUSTOMER_STAGE_COLORS } from "@ai-fsm/domain";
import { SmsOptOutButton } from "./SmsOptOutButton";
import { getPortalSession } from "@/lib/portal/session";
import PortalLogoutButton from "./PortalLogoutButton";
import { loadSponsoredInvoices, type SponsoredInvoiceRow } from "@/lib/portal/sponsored-invoices";
import { SPONSORED_PURPOSE_LABELS } from "@/lib/invoices/sponsored";
import { receivedCents, summarizeSpend } from "@/lib/portal/spend";
import { InvoicePicker, type PickerGroup } from "./InvoicePicker";
import { RequestServiceForm } from "./RequestServiceForm";
import { YourInfo } from "./YourInfo";

export const dynamic = "force-dynamic";

interface EstimateRow extends Record<string, unknown> {
  id: string; status: string; total_cents: number;
  sent_at: string | null; expires_at: string | null;
  share_token: string; property_address: string | null;
}
interface InvoiceRow extends Record<string, unknown> {
  id: string; invoice_number: string; status: string;
  total_cents: number; paid_cents: number; due_date: string | null;
  share_token: string; property_address: string | null;
  deposit_cents: number | null; paid_at: string | null; sent_at: string | null;
  job_title: string | null;
}
interface PlanRow extends Record<string, unknown> {
  id: string; name: string; frequency: string; services: string[];
  price_cents: number; status: string; next_scheduled_date: string | null; notes: string | null;
}
interface VisitRow { id: string; tech_notes: string | null; completed_at: string | null; }
interface JobRow extends Record<string, unknown> {
  id: string; title: string; status: string;
  completed_at: string | null; property_address: string | null;
  visits: VisitRow[];
}

function cents(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    approved: { bg: "#d1fae5", text: "#065f46" },
    paid: { bg: "#d1fae5", text: "#065f46" },
    sent: { bg: "#dbeafe", text: "#1e40af" },
    draft: { bg: "#f3f4f6", text: "#374151" },
    declined: { bg: "#fee2e2", text: "#991b1b" },
    expired: { bg: "#fef3c7", text: "#92400e" },
    overdue: { bg: "#fee2e2", text: "#991b1b" },
    partial: { bg: "#fef3c7", text: "#92400e" },
    active: { bg: "#d1fae5", text: "#065f46" },
    paused: { bg: "#fef3c7", text: "#92400e" },
    cancelled: { bg: "#f3f4f6", text: "#6b7280" },
    completed: { bg: "#d1fae5", text: "#065f46" },
  };
  const c = colors[status] ?? { bg: "#f3f4f6", text: "#374151" };
  return (
    <span style={{ display: "inline-block", background: c.bg, color: c.text, borderRadius: 12, padding: "2px 8px", fontSize: 12, fontWeight: 500, textTransform: "capitalize" }}>
      {status.replace("_", " ")}
    </span>
  );
}

interface ClientRow extends Record<string, unknown> {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  account_id: string;
  account_name: string;
  preferred_contact: string;
  sms_consent: boolean;
}

interface CommRow extends Record<string, unknown> {
  channel: string;
  outcome: string;
  body_preview: string | null;
  created_at: string;
}

export default async function ClientPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientToken: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { clientToken } = await params;
  const { email: emailResult } = await searchParams;

  const [portalSession, client] = await Promise.all([
    getPortalSession(),
    queryOne<ClientRow>(
      `SELECT c.id, c.name, c.email, c.phone, c.account_id, c.preferred_contact, c.sms_consent,
              a.name AS account_name
       FROM clients c
       JOIN accounts a ON a.id = c.account_id
       WHERE c.portal_token = $1`,
      [clientToken]
    ),
  ]);

  if (!client) notFound();

  if (!portalSession || portalSession.clientId !== client.id) {
    redirect(`/portal/login`);
  }

  const [estimates, invoices, plans, maintenanceJobs, activeVisitRows, recentComms, properties, sponsored] = await Promise.all([
    query<EstimateRow>(
      `SELECT e.id, e.status, e.total_cents, e.sent_at, e.expires_at,
              e.share_token, p.address AS property_address
       FROM estimates e
       LEFT JOIN properties p ON p.id = e.property_id
       WHERE e.client_id = $1 AND e.status != 'draft'
       ORDER BY e.created_at DESC`,
      [client.id]
    ),
    query<InvoiceRow>(
      `SELECT i.id, i.invoice_number, i.status, i.total_cents, i.paid_cents,
              i.due_date, i.share_token, i.deposit_cents, i.paid_at, i.sent_at,
              -- What the work was: summary's first line, else job title, else first line item.
              COALESCE(
                NULLIF(btrim(split_part(i.work_summary, E'\n', 1)), ''),
                j.title,
                (SELECT li.description FROM invoice_line_items li
                 WHERE li.invoice_id = i.id AND li.visible_to_customer
                 ORDER BY li.sort_order, li.created_at LIMIT 1)
              ) AS job_title,
              COALESCE(p.address, jp.address) AS property_address
       FROM invoices i
       LEFT JOIN jobs j ON j.id = i.job_id
       LEFT JOIN properties p ON p.id = i.property_id
       LEFT JOIN properties jp ON jp.id = j.property_id
       WHERE i.client_id = $1 AND i.status != 'draft' AND i.billing_context = 'standard'
       ORDER BY i.created_at DESC`,
      [client.id]
    ),
    query<PlanRow>(
      `SELECT id, name, frequency, services, price_cents, status, next_scheduled_date, notes
       FROM maintenance_plans
       WHERE client_id = $1
       ORDER BY status, created_at DESC`,
      [client.id]
    ),
    query<JobRow>(
      `SELECT j.id, j.title, j.status,
              p.address AS property_address,
              MAX(v.completed_at)::text AS completed_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', v.id, 'status', v.status, 'completed_at', v.completed_at,
                    'tech_notes', v.tech_notes
                  ) ORDER BY v.scheduled_start
                ) FILTER (WHERE v.id IS NOT NULL),
                '[]'
              ) AS visits
       FROM jobs j
       LEFT JOIN properties p ON p.id = j.property_id
       LEFT JOIN visits v ON v.job_id = j.id
       WHERE j.client_id = $1 AND j.job_type = 'maintenance' AND j.status = 'completed'
       GROUP BY j.id, p.address
       ORDER BY MAX(v.completed_at) DESC NULLS LAST
       LIMIT 20`,
      [client.id]
    ),
    // Active (non-completed) visits for any job — used to derive scheduled stage
    query<{ id: string }>(
      `SELECT v.id FROM visits v
       JOIN jobs j ON j.id = v.job_id
       WHERE j.client_id = $1 AND v.status IN ('scheduled','arrived','in_progress')
       LIMIT 1`,
      [client.id]
    ),
    query<CommRow>(
      `SELECT channel, outcome, body_preview, created_at
       FROM communications_log
       WHERE client_id = $1 AND direction = 'outbound'
       ORDER BY created_at DESC
       LIMIT 5`,
      [client.id]
    ),
    query<{ id: string; name: string | null; address: string; open_issue_count: number }>(
      `SELECT p.id, p.name, p.address,
              COUNT(pi.id) FILTER (WHERE pi.status IN ('open','monitoring'))::int AS open_issue_count
       FROM properties p
       LEFT JOIN property_issues pi ON pi.property_id = p.id AND pi.account_id = p.account_id
       WHERE p.client_id = $1 AND p.account_id = $2
       GROUP BY p.id
       ORDER BY p.address`,
      [client.id, client.account_id]
    ),
    loadSponsoredInvoices(getPool(), client.id),
  ]);

  // Sponsored rows count toward what this payer owes, but never add properties.
  const billed = [...invoices, ...sponsored];
  const openInvoices = billed.filter((i) => !["paid", "void"].includes(i.status as string));
  const totalOwed = openInvoices.reduce(
    (s, i) => s + ((i.total_cents as number) - (i.paid_cents as number)),
    0
  );

  const spend = summarizeSpend(billed);
  const dueOf = (i: { status: string; total_cents: number; paid_cents: number; deposit_cents: number | null }) =>
    ["paid", "void"].includes(i.status)
      ? 0
      : Math.max(i.total_cents - i.paid_cents - Math.max(i.deposit_cents ?? 0, 0), 0);
  const dateOf = (i: { sent_at: string | null; due_date: string | null }) => {
    const d = i.sent_at ?? i.due_date;
    return d ? new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "";
  };
  const invoiceGroups = groupBy(invoices, (i) => i.property_address ?? "No address yet").map(
    ([heading, rows]): PickerGroup => ({
      heading,
      rows: rows.map((i) => ({
        id: i.id,
        label: i.job_title ?? `Invoice #${i.invoice_number}`,
        sub: [`#${i.invoice_number}`, dateOf(i), i.due_date && dueOf(i) > 0 ? `Due ${new Date(i.due_date).toLocaleDateString()}` : ""].filter(Boolean).join(" · "),
        status: i.status,
        totalCents: i.total_cents,
        paidCents: receivedCents(i),
        dueCents: dueOf(i),
        shareToken: i.share_token,
      })),
    }),
  );
  const sponsoredGroups = groupBy(sponsored, (r) => {
    const place = r.property_name || r.property_address;
    return r.beneficiary_name ? `${place} — for ${r.beneficiary_name}` : place;
  }).map(
    ([heading, rows]): PickerGroup => ({
      heading,
      rows: rows.map((inv) => ({
        id: inv.id,
        // The address is already the group heading; the row says what the work was.
        label: inv.work_summary?.split("\n")[0]?.trim() || `Invoice #${inv.invoice_number}`,
        sub: `#${inv.invoice_number} · ${SPONSORED_PURPOSE_LABELS[inv.sponsored_purpose]}${inv.paid_at ? ` · Paid ${new Date(inv.paid_at).toLocaleDateString()}` : ""}`,
        status: inv.status,
        totalCents: inv.total_cents,
        paidCents: receivedCents(inv),
        dueCents: dueOf(inv),
        shareToken: inv.share_token,
      })),
    }),
  );
  const readOnly = Boolean(portalSession?.isPreview);

  const activeStage = derivePortalStage({
    hasOpenInvoice:      openInvoices.length > 0,
    hasPaidInvoice:      billed.some((i) => i.status === "paid"),
    hasApprovedEstimate: estimates.some((e) => e.status === "approved"),
    hasSentEstimate:     estimates.some((e) => e.status === "sent"),
    hasScheduledVisit:   activeVisitRows.length > 0,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", padding: "24px 16px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {portalSession?.isPreview && (
          <div
            style={{
              background: "#1e293b",
              color: "#f8fafc",
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 500,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 24,
              borderRadius: 8,
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <span>
              👁️ <strong>Admin Preview Mode</strong> — Viewing portal for <strong>{client.name}</strong> (read-only)
            </span>
            <a
              href={`/api/v1/admin/portal-preview/exit?client=${client.id}`}
              style={{ color: "#38bdf8", textDecoration: "none", fontWeight: 600, fontSize: 13 }}
            >
              Exit Preview & Return to App →
            </a>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>{client.account_name}</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 0" }}>
              Welcome, {(client.name as string).split(" ")[0]}
            </h1>
          </div>
          <PortalLogoutButton />
        </div>

        {/* Stage progress bar */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {CUSTOMER_STAGE_ORDER.map((stage) => {
              const isActive = stage === activeStage;
              const isPast = CUSTOMER_STAGE_ORDER.indexOf(stage) < CUSTOMER_STAGE_ORDER.indexOf(activeStage);
              const color = CUSTOMER_STAGE_COLORS[stage];
              return (
                <div
                  key={stage}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "6px 4px",
                    borderRadius: 6,
                    background: isActive ? color.bg : isPast ? "#f0fdf4" : "#f9fafb",
                    border: isActive ? `1.5px solid ${color.fg}` : "1.5px solid transparent",
                    opacity: isPast ? 0.6 : 1,
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: isActive ? color.fg : "#9ca3af" }}>
                    {CUSTOMER_STAGE_LABELS[stage]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {totalOwed > 0 && (
          <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: "12px 16px", marginBottom: 24, color: "#92400e" }}>
            You have an outstanding balance of <strong>{cents(totalOwed)}</strong>.
          </div>
        )}

        {emailResult === "updated" && (
          <div role="status" style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "12px 16px", marginBottom: 24, color: "#065f46" }}>
            Your email address is updated.
          </div>
        )}
        {emailResult === "conflict" && (
          <div role="alert" style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 24, color: "#991b1b" }}>
            We couldn&apos;t switch to that email online. Please call or text us.
          </div>
        )}

        {!readOnly && (
          <RequestServiceForm
            clientToken={clientToken}
            properties={properties.map((p) => ({ id: p.id, address: p.address }))}
          />
        )}

        {properties.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>My Properties</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {properties.map((p) => (
                <a
                  key={p.id as string}
                  href={`/portal/${clientToken}/property/${p.id}`}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "14px 16px", textDecoration: "none", color: "inherit" }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{(p.name as string) || (p.address as string)}</div>
                    {p.name && <div style={{ fontSize: 12, color: "#6b7280" }}>{p.address as string}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {(p.open_issue_count as number) > 0 && (
                      <span style={{ fontSize: 12, background: "#fee2e2", color: "#dc2626", borderRadius: 99, padding: "2px 8px", fontWeight: 600 }}>
                        {p.open_issue_count as number} issue{(p.open_issue_count as number) !== 1 ? "s" : ""}
                      </span>
                    )}
                    <span style={{ fontSize: 13, color: "#6b7280" }}>History →</span>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {plans.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Maintenance Plan</h2>
            {plans.map((plan) => (
              <div key={plan.id as string} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{plan.name as string}</div>
                    <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2, textTransform: "capitalize" }}>
                      {plan.frequency as string} · {cents(plan.price_cents as number)}/period
                    </div>
                  </div>
                  <StatusBadge status={plan.status as string} />
                </div>
                {(plan.services as string[]).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>SERVICES INCLUDED</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {(plan.services as string[]).map((s, i) => <li key={i} style={{ fontSize: 13 }}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {plan.next_scheduled_date && (
                  <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>
                    Next scheduled: {new Date(plan.next_scheduled_date as string).toLocaleDateString()}
                  </div>
                )}
                {plan.notes && (
                  <div style={{ marginTop: 8, fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>{plan.notes as string}</div>
                )}
              </div>
            ))}
          </section>
        )}

        {estimates.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Estimates</h2>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
              {estimates.map((e, idx) => (
                <div key={e.id as string} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: idx < estimates.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <div>
                    {e.property_address && <div style={{ fontSize: 13, color: "#374151" }}>{e.property_address as string}</div>}
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>
                      {e.sent_at ? new Date(e.sent_at as string).toLocaleDateString() : ""}
                      {e.expires_at ? ` · Expires ${new Date(e.expires_at as string).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontWeight: 600 }}>{cents(e.total_cents as number)}</div>
                    <StatusBadge status={e.status as string} />
                    <Link href={`/portal/estimates/${e.share_token}`} style={{ fontSize: 13, color: "#2563eb" }}>View →</Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {billed.length > 0 && (
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {[["Paid all time", spend.allTimeCents], ["This year", spend.thisYearCents]].map(([label, value]) => (
              <div key={label as string} style={{ flex: 1, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{label as string}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{cents(value as number)}</div>
              </div>
            ))}
          </div>
        )}

        {invoices.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Invoices</h2>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>Tick any to print or save them as one PDF.</div>
            <InvoicePicker clientToken={clientToken} groups={invoiceGroups} />
          </section>
        )}

        {sponsored.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Sponsored Work</h2>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
              Work you paid for at other people&apos;s properties.
            </div>
            <InvoicePicker clientToken={clientToken} groups={sponsoredGroups} />
          </section>
        )}

        {maintenanceJobs.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Maintenance History</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {maintenanceJobs.map((job) => (
                <div key={job.id as string} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontWeight: 600 }}>{job.title as string}</div>
                    <StatusBadge status={job.status as string} />
                  </div>
                  {job.property_address && <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>{job.property_address as string}</div>}
                  {job.completed_at && (
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>
                      Completed {new Date(job.completed_at as string).toLocaleDateString()}
                    </div>
                  )}
                  {job.visits.filter((v) => v.tech_notes).map((v) => (
                    <div key={v.id} style={{ marginTop: 10, padding: "10px 12px", background: "#f9fafb", borderRadius: 6, fontSize: 13 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 4 }}>TECHNICIAN NOTES</div>
                      <div style={{ color: "#374151", whiteSpace: "pre-wrap" }}>{v.tech_notes}</div>
                      {v.completed_at && (
                        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                          {new Date(v.completed_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Your info</h2>
          <YourInfo
            clientToken={clientToken}
            name={client.name}
            phone={client.phone}
            email={client.email}
            preferredContact={client.preferred_contact}
            readOnly={readOnly}
          />
          {client.sms_consent && !readOnly && (
            <div style={{ marginTop: 10 }}>
              <SmsOptOutButton clientToken={clientToken} />
            </div>
          )}
        </section>

        {/* Message History */}
        {recentComms.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Message History</h2>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
              {recentComms.map((msg, idx) => (
                <div key={idx} style={{ padding: "12px 16px", borderBottom: idx < recentComms.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>
                      {msg.channel as string}
                    </span>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>
                      {new Date(msg.created_at as string).toLocaleDateString()}
                    </span>
                  </div>
                  {msg.body_preview && (
                    <div style={{ fontSize: 13, color: "#374151" }}>{msg.body_preview as string}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {estimates.length === 0 && invoices.length === 0 && sponsored.length === 0 && plans.length === 0 && maintenanceJobs.length === 0 && (
          <div style={{ textAlign: "center", color: "#9ca3af", padding: 48 }}>Nothing to show yet.</div>
        )}

      </div>
    </div>
  );
}

function groupBy<T>(rows: T[], key: (row: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return [...groups];
}
