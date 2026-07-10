"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { StatusKanbanBoard } from "@/components/kanban/StatusKanbanBoard";
import { canWorkOrderBoardDrop } from "@/lib/kanban/board-transitions";

export type WorkOrderBoardRow = {
  id: string;
  title: string;
  status: string;
  total_cents: number;
  client_name: string | null;
  property_address: string | null;
  completed_at: string | null;
};

type Props = {
  workOrders: WorkOrderBoardRow[];
  statusOrder: string[];
  statusLabels: Record<string, string>;
  canDrag: boolean;
};

export function WorkOrderBoard({
  workOrders,
  statusOrder,
  statusLabels,
  canDrag,
}: Props) {
  const router = useRouter();

  const onMove = useCallback(
    async (itemId: string, _from: string, toStatus: string) => {
      try {
        const res = await fetch(`/api/v1/work-orders/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: toStatus }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          return {
            ok: false,
            message: data?.error?.message ?? "Could not update work order status",
          };
        }
        router.refresh();
        return { ok: true };
      } catch {
        return { ok: false, message: "Network error — status not updated" };
      }
    },
    [router],
  );

  const columns = statusOrder.map((id) => ({
    id,
    label: statusLabels[id] ?? id,
  }));

  return (
    <StatusKanbanBoard
      columns={columns}
      items={workOrders}
      canDrag={canDrag}
      canDrop={canWorkOrderBoardDrop}
      onMove={onMove}
      showEmptyColumns={canDrag}
      testId="work-order-board"
      cardTestId="work-order-card"
      renderCard={(wo) => <WorkOrderCard wo={wo} />}
    />
  );
}

function WorkOrderCard({ wo }: { wo: WorkOrderBoardRow }) {
  return (
    <Link
      href={`/app/work-orders/${wo.id}`}
      style={{
        textDecoration: "none",
        display: "block",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "var(--space-3)",
        color: "inherit",
      }}
      draggable={false}
    >
      <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--fg)" }}>
        {wo.title}
      </div>
      {wo.client_name && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
          {wo.client_name}
        </div>
      )}
      {wo.property_address && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
          {wo.property_address}
        </div>
      )}
      {wo.total_cents > 0 && (
        <div
          style={{
            marginTop: 4,
            fontFamily: "var(--font-mono), monospace",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
          }}
        >
          ${(wo.total_cents / 100).toFixed(2)}
        </div>
      )}
    </Link>
  );
}
