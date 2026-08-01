"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { ArrivalProposalDto } from "@/lib/field/load-arrival-proposals";
import { WorkOrderPicker } from "./WorkOrderPicker";

export function ArrivalProposalBanner({
  proposals,
  openWorkOrdersByProperty,
}: {
  proposals: ArrivalProposalDto[];
  openWorkOrdersByProperty: Record<
    string,
    { id: string; title: string; scheduledToday?: boolean }[]
  >;
}) {
  const params = useSearchParams();
  const focus = params.get("proposal");
  const ordered = useMemo(() => {
    const list = [...proposals];
    if (focus) list.sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : 0));
    return list;
  }, [proposals, focus]);

  const top = ordered[0];
  const [woId, setWoId] = useState<string | null>(top?.workOrderId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!top) return null;

  const options = top.propertyId
    ? openWorkOrdersByProperty[top.propertyId] ?? []
    : [];
  const ambiguous =
    top.woResolution === "ambiguous" || (!top.workOrderId && options.length > 1);

  async function act(action: "confirm" | "ignore") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/visit-candidates/${top.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          classification: action === "confirm" ? "job_work" : undefined,
          work_order_id: action === "confirm" ? woId ?? undefined : undefined,
          // Only switch when confirming still-on-site (open proposal).
          switch_activity: action === "confirm" && !top.departureTime,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error?.message ?? "Request failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p7-field-hero" data-testid="arrival-proposal-banner" style={{ marginBottom: "var(--space-4)" }}>
      <div className="p7-field-hero__kicker">Proposal · on site</div>
      <div className="p7-field-hero__title">{top.clientName ?? "Customer"}</div>
      <div className="p7-field-hero__meta">
        {top.propertyName}
        {top.workOrderTitle ? ` · ${top.workOrderTitle}` : ""}
        {" · "}
        {top.confidenceScore}% match
      </div>
      {ambiguous && options.length > 0 && (
        <div style={{ marginTop: "var(--space-2)" }}>
          <WorkOrderPicker options={options} value={woId} onChange={setWoId} />
        </div>
      )}
      {error && (
        <p role="alert" style={{ margin: 0, color: "#fca5a5", fontSize: "var(--text-sm)" }}>
          {error}
        </p>
      )}
      <div className="p7-field-hero__actions">
        <button
          type="button"
          className="p7-field-hero__primary"
          disabled={busy || (ambiguous && !woId)}
          onClick={() => act("confirm")}
        >
          {busy ? "…" : "Confirm"}
        </button>
        <button
          type="button"
          className="p7-field-hero__secondary"
          disabled={busy}
          onClick={() => act("ignore")}
        >
          Not this job
        </button>
      </div>
    </div>
  );
}
