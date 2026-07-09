"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Badge, SectionHeader, LocalTime, useToast, ConfirmDialog } from "@/components/ui";
import type { VisitClassification } from "@ai-fsm/domain";
import { asTimelineEntry, proposeRebalance, type RebalanceAdjustment } from "@/lib/activities/timeline";
import type { ActivityEntryDto } from "./ActivityTracker";

// EPIC-007: detected customer visits awaiting review. The owner classifies each
// (or ignores it); confirming writes a ledger entry and, the first time, learns
// the property's coordinates from the stop.

type Candidate = {
  id: string;
  confidence_score: number;
  distance_meters: number | null;
  arrival_time: string;
  departure_time: string;
  duration_minutes: number;
  property_address: string | null;
  client_name: string | null;
};

const CLASSIFY_BUTTONS: { value: Exclude<VisitClassification, "ignore">; label: string }[] = [
  { value: "job_work", label: "Job Work" },
  { value: "warranty_callback", label: "Warranty" },
  { value: "estimate_visit", label: "Estimate" },
  { value: "walkthrough", label: "Walkthrough" },
  { value: "material_drop", label: "Material" },
  { value: "realtor", label: "Realtor" },
];

export function VisitCandidatesPanel({ day, entries }: { day?: string; entries: ActivityEntryDto[] }) {
  const router = useRouter();
  const toast = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<{
    id: string;
    body: Record<string, unknown>;
    rebalance: RebalanceAdjustment[];
  } | null>(null);

  function timelineEntries() {
    return entries.map(asTimelineEntry);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = day ? `?date=${day}` : "";
      const res = await fetch(`/api/v1/visit-candidates${qs}`);
      const json = await res.json();
      setCandidates(json?.data?.candidates ?? []);
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>, successMsg: string) {
    setPending(id);
    try {
      const res = await fetch(`/api/v1/visit-candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error?.message ?? "Could not update visit");
        return;
      }
      toast.success(successMsg);
      await load();
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  if (loading || candidates.length === 0) return null; // quiet unless there's something to review

  return (
    <div style={{ marginTop: "var(--space-5)" }}>
      <SectionHeader title="Detected visits" count={candidates.length} />
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {candidates.map((c) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              padding: "var(--space-3)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <span style={{ fontSize: "1.1rem" }}>📍</span>
              <strong style={{ fontSize: "0.95rem" }}>
                {c.client_name ?? "Unknown customer"}
                {c.property_address ? ` · ${c.property_address}` : ""}
              </strong>
              <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                <LocalTime iso={c.arrival_time} /> – <LocalTime iso={c.departure_time} />
                {" · "}
                {c.duration_minutes} min
              </span>
              <Badge>{c.confidence_score}% confidence</Badge>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              {CLASSIFY_BUTTONS.map((b) => (
                <Button
                  key={b.value}
                  size="sm"
                  variant="secondary"
                  disabled={pending === c.id}
                  onClick={() => {
                    const body = { action: "confirm", classification: b.value };
                    const rebalance = proposeRebalance(timelineEntries(), {
                      started_at: c.arrival_time,
                      ended_at: c.departure_time,
                    });
                    if (rebalance.length > 0) {
                      setConfirmReplace({ id: c.id, body, rebalance });
                      return;
                    }
                    void patch(c.id, body, "Logged to your day");
                  }}
                >
                  {b.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                disabled={pending === c.id}
                onClick={() => patch(c.id, { action: "ignore" }, "Ignored")}
              >
                Ignore
              </Button>
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={confirmReplace !== null}
        title="Replace manual activity?"
        body="This detected visit overlaps manual time. Confirming will archive the original manual activity for reporting and prevent double-counted time."
        confirmLabel="Confirm and archive"
        onConfirm={() => {
          const pendingReplace = confirmReplace;
          setConfirmReplace(null);
          if (pendingReplace) {
            void patch(
              pendingReplace.id,
              { ...pendingReplace.body, rebalance: pendingReplace.rebalance },
              "Logged to your day",
            );
          }
        }}
        onCancel={() => setConfirmReplace(null)}
        loading={pending === confirmReplace?.id}
      />
    </div>
  );
}
