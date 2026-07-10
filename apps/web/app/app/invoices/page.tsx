import { redirect } from "next/navigation";
import type { Route } from "next";
import { getSession } from "@/lib/auth/session";
import { withInvoiceContext } from "@/lib/invoices/db";
import type { InvoiceStatus } from "@ai-fsm/domain";
import {
  PageContainer,
  PageHeader,
  ItemCard,
  StatusSection,
  EmptyState,
  MetricGrid,
  Card,
  SectionHeader,
  LinkButton,
} from "@/components/ui";
import type { MetricCardData } from "@/components/ui";

export const dynamic = "force-dynamic";

interface InvoiceRow {
  id: string;
  status: InvoiceStatus;
  invoice_number: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  due_date: string | null;
  created_at: string;
  client_name: string | null;
  [key: string]: unknown;
}

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partially Paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

const STATUS_ORDER: InvoiceStatus[] = [
  "overdue",
  "sent",
  "partial",
  "draft",
  "paid",
  "void",
];

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function getDaysUntilDue(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function formatAging(days: number | null): string | null {
  if (days === null) return null;
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 7) return `Due in ${days} days`;
  return null;
}

/** Aging/overdue only applies while money is still open. */
function isOpenBalance(status: InvoiceStatus): boolean {
  return status === "sent" || status === "partial" || status === "overdue" || status === "draft";
}

export default async function InvoicesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-work"); // EPIC-006: techs have no invoice access

  const invoices = await withInvoiceContext(session, async (client) => {
    const r = await client.query(
      `SELECT i.id, i.status, i.invoice_number,
              i.subtotal_cents, i.tax_cents, i.total_cents, i.paid_cents,
              i.due_date, i.created_at,
              c.name AS client_name
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE i.account_id = $1
       ORDER BY 
         CASE i.status 
           WHEN 'overdue' THEN 1 
           WHEN 'partial' THEN 2 
           WHEN 'sent' THEN 3 
           ELSE 4 
         END,
         i.due_date ASC NULLS LAST
       LIMIT 100`,
      [session.accountId]
    );
    return r.rows as InvoiceRow[];
  });

  const grouped = STATUS_ORDER.reduce<Record<string, InvoiceRow[]>>(
    (acc, s) => ({ ...acc, [s]: [] }),
    {}
  );
  for (const inv of invoices) {
    grouped[inv.status]?.push(inv);
  }
  const activeStatuses = STATUS_ORDER.filter((s) => grouped[s].length > 0);

  const totalOutstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "partial" || i.status === "overdue")
    .reduce((sum, i) => sum + (i.total_cents - i.paid_cents), 0);

  const totalOverdue = grouped.overdue.reduce(
    (sum, i) => sum + (i.total_cents - i.paid_cents),
    0
  );

  const totalPaid = grouped.paid.reduce((sum, i) => sum + i.paid_cents, 0);
  const priorityInvoice = grouped.overdue[0] ?? grouped.partial[0] ?? grouped.sent[0] ?? null;
  const priorityLabel = priorityInvoice
    ? priorityInvoice.status === "overdue"
      ? "Collect overdue payment"
      : priorityInvoice.status === "partial"
        ? "Finish partial payment"
        : "Follow up on sent invoice"
    : null;

  const metrics: MetricCardData[] = [
    {
      label: "Outstanding",
      value: formatDollars(totalOutstanding),
      sub: `${grouped.sent.length + grouped.partial.length + grouped.overdue.length} unpaid`,
    },
    {
      label: "Overdue",
      value: formatDollars(totalOverdue),
      sub: `${grouped.overdue.length} invoices`,
      variant: totalOverdue > 0 ? "alert" : "default",
    },
    {
      label: "Collected",
      value: formatDollars(totalPaid),
      sub: `${grouped.paid.length} paid`,
      variant: totalPaid > 0 ? "success" : "default",
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Invoices"
        subtitle={`${invoices.length} total`}
      />

      {invoices.length > 0 && <MetricGrid metrics={metrics} />}

      {priorityInvoice && (
        <Card style={{ marginBottom: "var(--space-4)", background: "var(--color-red-50)", borderColor: "var(--color-danger)" }} data-testid="billing-queue-card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--color-danger)", letterSpacing: "0.04em" }}>BILLING QUEUE — ACTION NEEDED</div>
              <div style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginTop: 2 }}>{priorityLabel}</div>
              <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: 2 }}>
                {priorityInvoice.invoice_number} · {priorityInvoice.client_name ?? "Client"} · {priorityInvoice.due_date ? new Date(priorityInvoice.due_date).toLocaleDateString() : "No due date"}
              </div>
            </div>
            <LinkButton href={(`/app/invoices/${priorityInvoice.id}`) as Route} variant="primary" size="sm">
              Open &amp; Collect →
            </LinkButton>
          </div>
        </Card>
      )}

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Convert an approved estimate to create an invoice."
          data-testid="invoices-empty"
        />
      ) : (
        <div>
          {activeStatuses.map((status) => (
            <StatusSection
              key={status}
              title={STATUS_LABELS[status]}
              count={grouped[status].length}
            >
              {grouped[status].map((inv) => {
                const amountDue = inv.total_cents - inv.paid_cents;
                const open = isOpenBalance(inv.status);
                const daysUntilDue = open ? getDaysUntilDue(inv.due_date) : null;
                const aging = formatAging(daysUntilDue);
                // Past due_date alone must not mark paid/void invoices overdue
                // (e.g. Gina INV-0019 paid same day but due_date still in the past).
                const isOverdue = open && daysUntilDue !== null && daysUntilDue < 0;
                const isDueSoon = open && daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 7;
                const dueLabel =
                  inv.status === "paid"
                    ? "Paid"
                    : inv.status === "void"
                      ? "Void"
                      : inv.due_date
                        ? aging || `Due ${new Date(inv.due_date).toLocaleDateString()}`
                        : null;

                return (
                  <ItemCard
                    key={inv.id}
                    href={`/app/invoices/${inv.id}`}
                    title={inv.invoice_number}
                    titleBadge={
                      inv.client_name ? (
                        <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>· {inv.client_name}</span>
                      ) : null
                    }
                    meta={
                      <span style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontSize: "var(--text-sm)" }}>
                        {dueLabel && (
                          <span style={{ color: isOverdue ? "var(--color-danger)" : isDueSoon ? "var(--color-warning)" : "var(--fg-muted)" }}>
                            {dueLabel}
                          </span>
                        )}
                        <span style={{ color: "var(--fg-muted)" }}>·</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{formatDollars(inv.total_cents)}</span>
                        {amountDue > 0 && open && (
                          <span style={{ color: "var(--color-danger)", fontFamily: "var(--font-mono)" }}>
                            {formatDollars(amountDue)} due
                          </span>
                        )}
                      </span>
                    }
                    overdue={isOverdue && inv.status !== "overdue"}
                    actions={null}
                    data-testid="invoice-card"
                  />
                );
              })}
            </StatusSection>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
