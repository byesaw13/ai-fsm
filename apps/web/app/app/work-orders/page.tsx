import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canCreateEstimates } from "@/lib/auth/permissions";
import { queryForSession } from "@/lib/db";
import { PageContainer, PageHeader, ItemCard, StatusSection, EmptyState, StatusBadge } from "@/components/ui";
import type { StatusVariant } from "@/components/ui";
import { WORK_ORDER_UI_STATUSES, WORK_ORDER_STATUS_LABELS } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string;
  status: string;
  total_cents: number;
  client_name: string | null;
  property_address: string | null;
  completed_at: string | null;
};

const STATUS_ORDER = ["dispatched", "scheduled", "ready", "waiting", "draft", "completed", "cancelled"] as const;
const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  WORK_ORDER_UI_STATUSES.map((s) => [s, WORK_ORDER_STATUS_LABELS[s]]),
);

export default async function WorkOrdersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateEstimates(session.role)) redirect("/app");

  const rows = await queryForSession<Row>(
    session,
    `SELECT w.id, w.title, w.status, w.total_cents,
            c.name AS client_name, p.address AS property_address, w.completed_at::text
     FROM work_orders w
     LEFT JOIN clients c ON c.id = w.client_id
     LEFT JOIN properties p ON p.id = w.property_id
     WHERE w.account_id = $1
     ORDER BY w.created_at DESC
     LIMIT 200`,
    [session.accountId],
  );

  const grouped = STATUS_ORDER.map((s) => ({ status: s, items: rows.filter((r) => r.status === s) })).filter((g) => g.items.length > 0);

  return (
    <PageContainer>
      <PageHeader title="Work Orders" subtitle={`${rows.length} total`} />
      {rows.length === 0 ? (
        <EmptyState title="No work orders yet" description="Create one from a site assessment." />
      ) : (
        grouped.map((g) => (
          <StatusSection key={g.status} title={STATUS_LABELS[g.status] ?? g.status} count={g.items.length}>
            {g.items.map((w) => (
              <ItemCard
                key={w.id}
                href={`/app/work-orders/${w.id}`}
                title={w.title}
                titleBadge={<StatusBadge variant={w.status as StatusVariant}>{STATUS_LABELS[w.status] ?? w.status}</StatusBadge>}
                meta={
                  <>
                    {w.client_name && <span className="p7-item-meta-text">{w.client_name}</span>}
                    {w.property_address && <span className="p7-item-meta-text">{w.property_address}</span>}
                    {w.total_cents > 0 && <span className="p7-item-meta-text">${(w.total_cents / 100).toFixed(2)}</span>}
                  </>
                }
              />
            ))}
          </StatusSection>
        ))
      )}
    </PageContainer>
  );
}
