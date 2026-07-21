import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canCreateEstimates } from "@/lib/auth/permissions";
import { queryForSession } from "@/lib/db";
import {
  PageContainer,
  PageHeader,
  ItemCard,
  StatusSection,
  EmptyState,
  StatusBadge,
} from "@/components/ui";
import type { StatusVariant } from "@/components/ui";
import { WORK_ORDER_UI_STATUSES, WORK_ORDER_STATUS_LABELS } from "@ai-fsm/domain";
import { WorkOrderBoard } from "./WorkOrderBoard";

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

const STATUS_ORDER = [
  "dispatched",
  "scheduled",
  "ready",
  "waiting",
  "draft",
  "completed",
  "cancelled",
] as const;

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  WORK_ORDER_UI_STATUSES.map((s) => [s, WORK_ORDER_STATUS_LABELS[s]]),
);

interface PageProps {
  searchParams: Promise<{ view?: string; show?: string }>;
}

export default async function WorkOrdersPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateEstimates(session.role)) redirect("/app");

  const { view, show } = await searchParams;
  // Default board (consistent with estimates); list via ?view=list
  const isBoardView = view !== "list";
  // Default: hide completed/cancelled so multi-day history doesn't fill the board.
  const showClosed = show === "all";
  const canDrag = canCreateEstimates(session.role);

  const rows = await queryForSession<Row>(
    session,
    `SELECT w.id, w.title, w.status, w.total_cents,
            c.name AS client_name, p.address AS property_address, w.completed_at::text
     FROM work_orders w
     LEFT JOIN clients c ON c.id = w.client_id
     LEFT JOIN properties p ON p.id = w.property_id
     WHERE w.account_id = $1
       AND ($2::boolean OR w.status NOT IN ('completed', 'cancelled'))
     ORDER BY w.created_at DESC
     LIMIT 200`,
    [session.accountId, showClosed],
  );

  const grouped = STATUS_ORDER.map((s) => ({
    status: s,
    items: rows.filter((r) => r.status === s),
  })).filter((g) => g.items.length > 0);

  const listQs = (next: { view?: string; show?: string }) => {
    const p = new URLSearchParams();
    if (next.view === "list") p.set("view", "list");
    if (next.show === "all") p.set("show", "all");
    const s = p.toString();
    return (s ? `/app/work-orders?${s}` : "/app/work-orders") as Route;
  };

  return (
    <PageContainer>
      <PageHeader
        title="Work Orders"
        subtitle={showClosed ? `${rows.length} total` : `${rows.length} open`}
      />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-1)",
          marginBottom: "var(--space-4)",
          alignItems: "center",
        }}
      >
        {(
          [
            { key: "board", label: "Board View" },
            { key: "list", label: "List View" },
          ] as const
        ).map(({ key, label }) => {
          const isActive = isBoardView ? key === "board" : key === "list";
          const href = listQs({
            view: key === "list" ? "list" : undefined,
            show: showClosed ? "all" : undefined,
          });
          return (
            <Link
              key={key}
              href={href}
              style={{
                padding: "var(--space-1) var(--space-3)",
                borderRadius: "var(--radius-md, var(--radius))",
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                textDecoration: "none",
                background: isActive ? "var(--accent-subtle)" : "var(--bg-card)",
                color: isActive ? "var(--accent)" : "var(--fg-muted)",
                border: isActive
                  ? "1px solid var(--accent)"
                  : "1px solid var(--border)",
              }}
            >
              {label}
            </Link>
          );
        })}
        <span style={{ width: 1, height: 20, background: "var(--border)", margin: "0 var(--space-1)" }} aria-hidden />
        {(
          [
            { all: false, label: "Open" },
            { all: true, label: "All" },
          ] as const
        ).map(({ all, label }) => {
          const isActive = showClosed === all;
          const href = listQs({
            view: isBoardView ? undefined : "list",
            show: all ? "all" : undefined,
          });
          return (
            <Link
              key={label}
              href={href}
              style={{
                padding: "var(--space-1) var(--space-3)",
                borderRadius: "var(--radius-md, var(--radius))",
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                textDecoration: "none",
                background: isActive ? "var(--accent-subtle)" : "var(--bg-card)",
                color: isActive ? "var(--accent)" : "var(--fg-muted)",
                border: isActive
                  ? "1px solid var(--accent)"
                  : "1px solid var(--border)",
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={showClosed ? "No work orders yet" : "No open work orders"}
          description={
            showClosed
              ? "Create one from a site assessment."
              : "Completed work is hidden — switch to All to see history."
          }
        />
      ) : isBoardView ? (
        <WorkOrderBoard
          workOrders={rows}
          statusOrder={[...STATUS_ORDER]}
          statusLabels={STATUS_LABELS}
          canDrag={canDrag}
        />
      ) : (
        grouped.map((g) => (
          <StatusSection
            key={g.status}
            title={STATUS_LABELS[g.status] ?? g.status}
            count={g.items.length}
          >
            {g.items.map((w) => (
              <ItemCard
                key={w.id}
                href={`/app/work-orders/${w.id}`}
                title={w.title}
                titleBadge={
                  <StatusBadge variant={w.status as StatusVariant}>
                    {STATUS_LABELS[w.status] ?? w.status}
                  </StatusBadge>
                }
                meta={
                  <>
                    {w.client_name && (
                      <span className="p7-item-meta-text">{w.client_name}</span>
                    )}
                    {w.property_address && (
                      <span className="p7-item-meta-text">{w.property_address}</span>
                    )}
                    {w.total_cents > 0 && (
                      <span className="p7-item-meta-text">
                        ${(w.total_cents / 100).toFixed(2)}
                      </span>
                    )}
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
