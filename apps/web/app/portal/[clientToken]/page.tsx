import { notFound } from "next/navigation";
import Link from "next/link";
import { queryOne, query } from "@/lib/db";
import { derivePortalStage, CUSTOMER_STAGE_ORDER, CUSTOMER_STAGE_LABELS, CUSTOMER_STAGE_COLORS } from "@ai-fsm/domain";

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
}
interface PlanRow extends Record<string, unknown> {
  id: string; name: string; frequency: string; services: string[];
  price_cents: number; status: string; next_scheduled_date: string | null; notes: string | null;
}
interface VisitRow { id: string; tech_notes: string | null; completed_at: string | null; }
interface JobRow extends Record<string, unknown> {
  id: string; title: string; status: string;
  scheduled_end: string | null; property_address: string | null;
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
  email: string;
  account_name: string;
}

export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ clientToken: string }>;
}) {
  const { clientToken } = await params;

  const client = await queryOne<ClientRow>(
    `SELECT c.id, c.name, c.email, a.name AS account_name
     FROM clients c
     JOIN accounts a ON a.id = c.account_id
     WHERE c.portal_token = $1`,
    [clientToken]
  );

  if (!client) notFound();

  const [estimates, invoices, plans, maintenanceJobs, activeVisitRows] = await Promise.all([
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
              i.due_date, i.share_token, p.address AS property_address
       FROM invoices i
       LEFT JOIN properties p ON p.id = i.property_id
       WHERE i.client_id = $1 AND i.status != 'draft'
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
      `SELECT j.id, j.title, j.status, j.scheduled_start, j.scheduled_end,
              p.address AS property_address,
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
       ORDER BY j.scheduled_end DESC NULLS LAST
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
  ]);

  const openInvoices = invoices.filter((i) => !["paid", "void"].includes(i.status as string));
  const totalOwed = openInvoices.reduce(
    (s, i) => s + ((i.total_cents as number) - (i.paid_cents as number)),
    0
  );

  const activeStage = derivePortalStage({
    hasOpenInvoice:      openInvoices.length > 0,
    hasPaidInvoice:      invoices.some((i) => i.status === "paid"),
    hasApprovedEstimate: estimates.some((e) => e.status === "approved"),
    hasSentEstimate:     estimates.some((e) => e.status === "sent"),
    hasScheduledVisit:   activeVisitRows.length > 0,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", padding: "24px 16px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 13, color: "#6b7280" }}>{client.account_name}</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 0" }}>
            Welcome, {(client.name as string).split(" ")[0]}
          </h1>
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

        {invoices.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Invoices</h2>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
              {invoices.map((inv, idx) => {
                const balance = (inv.total_cents as number) - (inv.paid_cents as number);
                return (
                  <div key={inv.id as string} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: idx < invoices.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>#{inv.invoice_number as string}</div>
                      {inv.property_address && <div style={{ fontSize: 12, color: "#9ca3af" }}>{inv.property_address as string}</div>}
                      {inv.due_date && <div style={{ fontSize: 12, color: "#9ca3af" }}>Due {new Date(inv.due_date as string).toLocaleDateString()}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 600 }}>{cents(inv.total_cents as number)}</div>
                        {balance > 0 && balance < (inv.total_cents as number) && (
                          <div style={{ fontSize: 12, color: "#6b7280" }}>{cents(balance)} due</div>
                        )}
                      </div>
                      <StatusBadge status={inv.status as string} />
                      <Link href={`/portal/invoices/${inv.share_token}`} style={{ fontSize: 13, color: "#2563eb" }}>View →</Link>
                    </div>
                  </div>
                );
              })}
            </div>
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
                  {job.scheduled_end && (
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>
                      Completed {new Date(job.scheduled_end as string).toLocaleDateString()}
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

        {estimates.length === 0 && invoices.length === 0 && plans.length === 0 && maintenanceJobs.length === 0 && (
          <div style={{ textAlign: "center", color: "#9ca3af", padding: 48 }}>Nothing to show yet.</div>
        )}

      </div>
    </div>
  );
}
