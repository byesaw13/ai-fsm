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
  StatusBadge,
  MetricGrid,
  Card,
  SectionHeader,
  LinkButton,
} from "@/components/ui";
import type { StatusVariant, MetricCardData } from "@/components/ui";

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

export default async function InvoicesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

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
        <Card style={{ marginBottom: "var(--space-4)" }} data-testid="billing-queue-card">
          <SectionHeader title="Billing Queue" />
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ minWidth: 240, flex: "1 1 320px" }}>
              <p style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 700 }}>
                {priorityLabel}
              </p>
              <p style={{ margin: "var(--space-1) 0 0", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
                {priorityInvoice.invoice_number}{priorityInvoice.client_name ? ` · ${priorityInvoice.client_name}` : ""}
              </p>
              <p style={{ margin: "var(--space-1) 0 0", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
                {priorityInvoice.due_date ? `Due ${new Date(priorityInvoice.due_date).toLocaleDateString()}` : "No due date set"}
              </p>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
              <LinkButton href={(`/app/invoices/${priorityInvoice.id}`) as Route} variant="primary" size="sm">
                Open Invoice →
              </LinkButton>
              <LinkButton href="/app/invoices" variant="secondary" size="sm">
                View Queue
              </LinkButton>
            </div>
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
                const daysUntilDue = getDaysUntilDue(inv.due_date);
                const aging = formatAging(daysUntilDue);
                const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
                const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 7;

                return (
                  <ItemCard
                    key={inv.id}
                    href={`/app/invoices/${inv.id}`}
                    title={inv.invoice_number}
                    titleBadge={
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                        {inv.client_name && (
                          <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
                            — {inv.client_name}
                          </span>
                        )}
                        <StatusBadge variant={inv.status as StatusVariant}>
                          {STATUS_LABELS[inv.status]}
                        </StatusBadge>
                      </div>
                    }
                    meta={
                      inv.due_date && (
                        <span
                          style={{
                            color: isOverdue ? "var(--color-danger)" : isDueSoon ? "var(--color-warning)" : "var(--fg-muted)",
                            fontSize: "var(--text-sm)",
                          }}
                        >
                          {aging || `Due: ${new Date(inv.due_date).toLocaleDateString()}`}
                        </span>
                      )
                    }
                    overdue={isOverdue && inv.status !== "overdue"}
                    actions={
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-sm)" }}>
                          {formatDollars(inv.total_cents)}
                        </div>
                        {amountDue > 0 && amountDue !== inv.total_cents && (
                          <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                            {formatDollars(amountDue)} due
                          </div>
                        )}
                      </div>
                    }
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
