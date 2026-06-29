"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, EmptyState, LocalTime, SectionHeader, useToast } from "@/components/ui";

type LocationEvent = {
  id: string;
  occurred_at: string;
  kind: string;
  zone: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoded_address: string | null;
  detected_activity: string | null;
  external_id: string | null;
};

type LocationSegment = {
  id: string;
  kind: "stop" | "drive";
  started_at: string;
  ended_at: string | null;
  place_label: string | null;
  zone: string | null;
  latitude: number | null;
  longitude: number | null;
  suggested_activity_type: string | null;
  status: string;
  estimated_miles: number | null;
  confidence: {
    level: "high" | "medium" | "low";
    reasons: string[];
  };
};

type DebugData = {
  events: LocationEvent[];
  segments: LocationSegment[];
};

function coordLabel(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return "no coordinates";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function eventSummary(event: LocationEvent): string {
  const parts = [
    event.zone ? `zone ${event.zone}` : null,
    event.detected_activity ? `activity ${event.detected_activity}` : null,
    event.geocoded_address,
    coordLabel(event.latitude, event.longitude),
  ].filter(Boolean);
  return parts.join(" · ");
}

function durationLabel(startedAt: string, endedAt: string | null): string {
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const mins = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function LocationDebugPanel({ day }: { day: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DebugData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/activities/location-debug?date=${day}`);
      if (!res.ok) throw new Error("debug load failed");
      const json = await res.json();
      setData(json?.data ?? { events: [], segments: [] });
    } catch {
      toast.error("Could not load location debug data");
    } finally {
      setLoading(false);
    }
  }, [day, toast]);

  useEffect(() => {
    if (open && !data) void load();
  }, [data, load, open]);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <SectionHeader title="Location debug" />
        <div style={{ flex: 1 }} />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (next) void load();
          }}
        >
          {open ? "Hide" : "Show"}
        </Button>
        {open ? (
          <Button size="sm" variant="ghost" loading={loading} onClick={() => void load()}>
            Refresh
          </Button>
        ) : null}
      </div>

      {open ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <strong style={{ fontSize: "0.9rem" }}>Raw HA events</strong>
            {!data || data.events.length === 0 ? (
              <EmptyState title="No raw events" description="HA did not post location events for this day." />
            ) : (
              data.events.map((event) => (
                <div
                  key={event.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "var(--space-2)",
                    background: "var(--surface)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                    <LocalTime iso={event.occurred_at} />
                    <Badge>{event.kind}</Badge>
                  </div>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{eventSummary(event)}</span>
                  {event.external_id ? (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{event.external_id}</span>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <strong style={{ fontSize: "0.9rem" }}>Derived segments</strong>
            {!data || data.segments.length === 0 ? (
              <EmptyState title="No segments" description="Dovetails did not derive stops or drives for this day." />
            ) : (
              data.segments.map((segment) => (
                <div
                  key={segment.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "var(--space-2)",
                    background: "var(--surface)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                    <LocalTime iso={segment.started_at} />
                    <span style={{ color: "var(--text-muted)" }}>to</span>
                    {segment.ended_at ? <LocalTime iso={segment.ended_at} /> : <span>now</span>}
                    <Badge>{segment.kind}</Badge>
                    <Badge>{segment.status}</Badge>
                    <Badge>{segment.confidence.level} confidence</Badge>
                  </div>
                  <strong style={{ fontSize: "0.9rem" }}>
                    {segment.place_label ?? (segment.kind === "drive" ? "Driving" : "Stop")} · {durationLabel(segment.started_at, segment.ended_at)}
                    {segment.estimated_miles != null ? ` · ~${segment.estimated_miles} mi` : ""}
                  </strong>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                    {[
                      segment.zone ? `zone ${segment.zone}` : null,
                      segment.suggested_activity_type ? `suggests ${segment.suggested_activity_type}` : null,
                      coordLabel(segment.latitude, segment.longitude),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {segment.confidence.reasons.length > 0 ? (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                      {segment.confidence.reasons.join(", ")}
                    </span>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
