"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select, Badge, SectionHeader, EmptyState, LocalTime, useToast } from "@/components/ui";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_META, type ActivityType } from "@ai-fsm/domain";

// TASK-024 (slice 2): the labelable day timeline. Shows captured stop/drive
// segments fed in from Home Assistant; the owner assigns an activity to each and
// confirms it into the ledger, or dismisses it. Nothing reaches activity_entries
// until confirmed here.

type Segment = {
  id: string;
  kind: "stop" | "drive";
  started_at: string;
  ended_at: string | null;
  place_label: string | null;
  zone: string | null;
  suggested_activity_type: string | null;
  status: string;
  activity_entry_id: string | null;
};

const ACTIVITY_OPTIONS = ACTIVITY_TYPES.map((t) => ({
  value: t,
  label: `${ACTIVITY_TYPE_META[t].emoji} ${ACTIVITY_TYPE_META[t].label}`,
}));

function durationLabel(startedAt: string, endedAt: string | null): string {
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const mins = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function defaultActivity(seg: Segment): ActivityType {
  const s = seg.suggested_activity_type;
  if (s && (ACTIVITY_TYPES as readonly string[]).includes(s)) return s as ActivityType;
  return seg.kind === "drive" ? "travel" : "job_work";
}

export function LocationSegmentsPanel({ day }: { day?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [choice, setChoice] = useState<Record<string, ActivityType>>({});
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = day ? `?date=${day}` : "";
      const res = await fetch(`/api/v1/activities/segments${qs}`);
      const json = await res.json();
      const list: Segment[] = json?.data?.segments ?? [];
      setSegments(list);
      setChoice((prev) => {
        const next = { ...prev };
        for (const s of list) if (!next[s.id]) next[s.id] = defaultActivity(s);
        return next;
      });
    } catch {
      toast.error("Could not load captured locations");
    } finally {
      setLoading(false);
    }
  }, [day, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>, successMsg: string) {
    setPending(id);
    try {
      const res = await fetch(`/api/v1/activities/segments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error?.message ?? "Could not update segment");
        return;
      }
      toast.success(successMsg);
      await load();
      router.refresh(); // refresh the activity_entries timeline above
    } finally {
      setPending(null);
    }
  }

  const provisional = segments.filter((s) => s.status === "provisional");
  const confirmed = segments.filter((s) => s.status === "confirmed");

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <SectionHeader title="Captured locations" />
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "calc(-1 * var(--space-2)) 0 0" }}>
        Auto-recorded stops &amp; drives — label each into your day.
      </p>

      {loading ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Loading…</p>
      ) : segments.length === 0 ? (
        <EmptyState
          title="Nothing captured yet"
          description="When the Home Assistant bridge is connected, your stops and drives appear here to label."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {provisional.map((seg) => {
            const isOpen = seg.ended_at === null;
            return (
              <div
                key={seg.id}
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
                  <span style={{ fontSize: "1.1rem" }}>{seg.kind === "drive" ? "🚗" : "📍"}</span>
                  <strong style={{ fontSize: "0.95rem" }}>
                    {seg.place_label ?? (seg.kind === "drive" ? "Driving" : "Stop")}
                  </strong>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    <LocalTime iso={seg.started_at} />
                    {seg.ended_at ? <> – <LocalTime iso={seg.ended_at} /></> : " – now"}
                    {" · "}
                    {durationLabel(seg.started_at, seg.ended_at)}
                  </span>
                  {isOpen ? <Badge>In progress</Badge> : null}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  <Select
                    id={`seg-activity-${seg.id}`}
                    options={ACTIVITY_OPTIONS}
                    value={choice[seg.id] ?? defaultActivity(seg)}
                    onChange={(e) => setChoice((c) => ({ ...c, [seg.id]: e.target.value as ActivityType }))}
                    disabled={isOpen || pending === seg.id}
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    loading={pending === seg.id}
                    disabled={isOpen}
                    onClick={() => patch(seg.id, { action: "confirm", activity_type: choice[seg.id] ?? defaultActivity(seg) }, "Logged to your day")}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending === seg.id}
                    onClick={() => patch(seg.id, { action: "dismiss" }, "Dismissed")}
                  >
                    Dismiss
                  </Button>
                </div>
                {isOpen ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: 0 }}>
                    Label this once it ends.
                  </p>
                ) : null}
              </div>
            );
          })}

          {confirmed.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
              <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Logged</span>
              {confirmed.map((seg) => (
                <div
                  key={seg.id}
                  style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "0.85rem", color: "var(--text-muted)" }}
                >
                  <span>✓</span>
                  <span>{seg.kind === "drive" ? "🚗" : "📍"}</span>
                  <span>{seg.place_label ?? (seg.kind === "drive" ? "Driving" : "Stop")}</span>
                  <span>· {durationLabel(seg.started_at, seg.ended_at)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
