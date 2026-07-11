"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { StatusKanbanBoard } from "@/components/kanban/StatusKanbanBoard";
import { canEstimateBoardDrop } from "@/lib/kanban/board-transitions";
import { formatCents } from "@/lib/money";

export type EstimateBoardRow = {
  id: string;
  status: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  sent_at: string | null;
  expires_at: string | null;
  created_at: string;
  estimate_number: string | null;
  client_name: string | null;
  job_title: string | null;
};

type Props = {
  estimates: EstimateBoardRow[];
  statusOrder: string[];
  statusLabels: Record<string, string>;
  canDrag: boolean;
};

export function EstimateBoard({
  estimates,
  statusOrder,
  statusLabels,
  canDrag,
}: Props) {
  const router = useRouter();

  const onMove = useCallback(
    async (itemId: string, _from: string, toStatus: string) => {
      try {
        const res = await fetch(`/api/v1/estimates/${itemId}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: toStatus }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: { message?: string; code?: string };
          } | null;
          const msg =
            data?.error?.code === "USE_SEND_ACTION"
              ? "Use Send to Client to mark an estimate as sent."
              : data?.error?.message ?? "Could not update estimate status";
          return { ok: false, message: msg };
        }
        router.refresh();
        return { ok: true };
      } catch {
        return { ok: false, message: "Network error — status not updated" };
      }
    },
    [router],
  );

  const columns = statusOrder.map((id) => {
    const colItems = estimates.filter((e) => e.status === id);
    const total = colItems.reduce((s, e) => s + e.total_cents, 0);
    return {
      id,
      label: statusLabels[id] ?? id,
      meta: (
        <span
          style={{
            fontFamily: "var(--font-mono), monospace",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--fg-muted)",
          }}
        >
          {formatCents(total)}
        </span>
      ),
    };
  });

  return (
    <StatusKanbanBoard
      columns={columns}
      items={estimates}
      canDrag={canDrag}
      canDrop={canEstimateBoardDrop}
      onMove={onMove}
      showEmptyColumns
      testId="estimate-board"
      cardTestId="estimate-card"
      renderCard={(est) => <EstimateCard est={est} />}
    />
  );
}

function EstimateCard({ est }: { est: EstimateBoardRow }) {
  const nowTime = Date.now();
  const isExpired =
    !!est.expires_at && new Date(est.expires_at).getTime() < nowTime;
  const isExpiringSoon =
    !isExpired &&
    !!est.expires_at &&
    new Date(est.expires_at).getTime() < nowTime + 7 * 24 * 60 * 60 * 1000;

  return (
    <Link
      href={`/app/estimates/${est.id}`}
      style={{
        textDecoration: "none",
        display: "block",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md, var(--radius))",
        padding: "var(--space-3)",
        color: "inherit",
      }}
      draggable={false}
    >
      <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--fg)" }}>
        {est.estimate_number ? `${est.estimate_number} · ` : ""}
        {est.client_name ?? "Unknown client"}
      </div>
      {est.job_title && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
          {est.job_title}
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 4,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono), monospace",
            fontSize: "var(--text-sm)",
            fontWeight: 700,
          }}
        >
          {formatCents(est.total_cents)}
        </span>
        {est.expires_at && est.status === "sent" && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: isExpired
                ? "var(--color-danger)"
                : isExpiringSoon
                  ? "var(--color-warning)"
                  : "var(--fg-muted)",
            }}
          >
            {isExpired
              ? "Expired"
              : `Exp: ${new Date(est.expires_at).toLocaleDateString([], { month: "numeric", day: "numeric" })}`}
          </span>
        )}
      </div>
    </Link>
  );
}
