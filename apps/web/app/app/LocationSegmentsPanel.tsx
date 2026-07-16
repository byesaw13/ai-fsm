"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select, Badge, SectionHeader, EmptyState, LocalTime, useToast, ConfirmDialog } from "@/components/ui";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_META, type ActivityType } from "@ai-fsm/domain";
import {
  asTimelineEntry,
  proposeRebalance,
  rebalanceHasDeletes,
  type RebalanceAdjustment,
} from "@/lib/activities/timeline";
import { formatElapsed } from "@/lib/activities/summary";
import { segmentConfidenceLevel } from "@/lib/location/segment-confidence";
import { SegmentLinkModal } from "@/components/field/SegmentLinkModal";
import type { ActivityEntryDto } from "./ActivityTracker";

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
  vehicle_id: string | null;
  vehicle_session_id: string | null;
  estimated_miles: number | null;
  latitude: number | null;
  longitude: number | null;
  is_likely_noise?: boolean;
};

type VehicleOption = {
  id: string;
  nickname: string;
  is_default?: boolean;
};

const ACTIVITY_OPTIONS = ACTIVITY_TYPES.map((t) => ({
  value: t,
  label: `${ACTIVITY_TYPE_META[t].emoji} ${ACTIVITY_TYPE_META[t].label}`,
}));

function defaultActivity(seg: Segment): ActivityType {
  const s = seg.suggested_activity_type;
  if (s && (ACTIVITY_TYPES as readonly string[]).includes(s)) return s as ActivityType;
  return seg.kind === "drive" ? "travel" : "job_work";
}

export function LocationSegmentsPanel({ day, entries }: { day?: string; entries: ActivityEntryDto[] }) {
  const router = useRouter();
  const toast = useToast();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [choice, setChoice] = useState<Record<string, ActivityType>>({});
  const [vehicleChoice, setVehicleChoice] = useState<Record<string, string>>({});
  const [milesChoice, setMilesChoice] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [linkSeg, setLinkSeg] = useState<Segment | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<{
    id: string;
    body: Record<string, unknown>;
    rebalance: RebalanceAdjustment[];
    successMsg: string;
  } | null>(null);

  function timelineEntries() {
    return entries.map(asTimelineEntry);
  }

  function defaultVehicleId(seg: Segment): string {
    if (seg.vehicle_id && vehicles.some((v) => v.id === seg.vehicle_id)) return seg.vehicle_id;
    return vehicles.find((v) => v.is_default)?.id ?? vehicles[0]?.id ?? "";
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = day ? `?date=${day}` : "";
      const [segRes, vehRes] = await Promise.all([
        fetch(`/api/v1/activities/segments${qs}`),
        fetch("/api/v1/vehicles"),
      ]);
      const segJson = await segRes.json();
      const vehJson = await vehRes.json();
      const list: Segment[] = segJson?.data?.segments ?? [];
      const vehList: VehicleOption[] = vehJson?.data ?? [];
      setSegments(list);
      setVehicles(vehList);
      setChoice((prev) => {
        const next = { ...prev };
        for (const s of list) if (!next[s.id]) next[s.id] = defaultActivity(s);
        return next;
      });
      setVehicleChoice((prev) => {
        const next = { ...prev };
        for (const s of list) {
          if (s.kind !== "drive" || next[s.id]) continue;
          const vid =
            s.vehicle_id && vehList.some((v) => v.id === s.vehicle_id)
              ? s.vehicle_id
              : vehList.find((v) => v.is_default)?.id ?? vehList[0]?.id ?? "";
          next[s.id] = vid;
        }
        return next;
      });
      setMilesChoice((prev) => {
        const next = { ...prev };
        for (const s of list) {
          if (s.kind === "drive" && !next[s.id] && s.estimated_miles != null) {
            next[s.id] = String(s.estimated_miles);
          }
        }
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
        const proposed = json.error?.proposed_rebalance as RebalanceAdjustment[] | undefined;
        if (res.status === 409 && Array.isArray(proposed) && proposed.length > 0) {
          // Server-owned proposal: soft auto-retry; deletes need confirm.
          if (!json.error?.requires_delete_confirm && !rebalanceHasDeletes(proposed)) {
            const retry = await fetch(`/api/v1/activities/segments/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...body, rebalance: proposed }),
            });
            if (retry.ok) {
              toast.success(successMsg);
              await load();
              router.refresh();
              window.dispatchEvent(new CustomEvent("fsm:segments-changed"));
              return;
            }
            const retryJson = await retry.json().catch(() => ({}));
            toast.error(retryJson.error?.message ?? "Could not update segment");
            return;
          }
          setConfirmReplace({
            id,
            body: { ...body, rebalance: proposed },
            rebalance: proposed,
            successMsg,
          });
          return;
        }
        toast.error(json.error?.message ?? "Could not update segment");
        return;
      }
      toast.success(successMsg);
      await load();
      router.refresh();
      window.dispatchEvent(new CustomEvent("fsm:segments-changed"));
    } finally {
      setPending(null);
    }
  }

  function maybeConfirmThenPatch(
    id: string,
    body: Record<string, unknown>,
    startedAt: string,
    endedAt: string,
    successMsg: string,
  ) {
    const rebalance = proposeRebalance(timelineEntries(), {
      started_at: startedAt,
      ended_at: endedAt,
    });
    // Soft only (stop open work / trim) — send without dialog; server also auto-softs.
    if (rebalance.length === 0 || !rebalanceHasDeletes(rebalance)) {
      void patch(id, { ...body, rebalance }, successMsg);
      return;
    }
    setConfirmReplace({ id, body: { ...body, rebalance }, rebalance, successMsg });
  }

  function confirmDrive(seg: Segment) {
    const vehicleId = vehicleChoice[seg.id] ?? defaultVehicleId(seg);
    const miles = Number(milesChoice[seg.id]);
    if (!vehicleId) {
      toast.error("Pick a vehicle for this drive");
      return;
    }
    if (!Number.isFinite(miles) || miles <= 0) {
      toast.error("Enter the trip miles");
      return;
    }
    const body = {
      action: "confirm_trip",
      vehicle_id: vehicleId,
      miles,
      activity_type: choice[seg.id] ?? defaultActivity(seg),
    };
    if (!seg.ended_at) return;
    maybeConfirmThenPatch(seg.id, body, seg.started_at, seg.ended_at, "Trip logged — time and mileage linked");
  }

  function confirmStop(seg: Segment) {
    const body = { action: "confirm", activity_type: choice[seg.id] ?? defaultActivity(seg) };
    if (!seg.ended_at) return;
    maybeConfirmThenPatch(seg.id, body, seg.started_at, seg.ended_at, "Logged to your day");
  }

  const provisional = segments.filter((s) => s.status === "provisional");
  const confirmed = segments.filter((s) => s.status === "confirmed");

  const vehicleOptions = vehicles.map((v) => ({ value: v.id, label: v.nickname }));

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <SectionHeader title="Captured locations" />
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "calc(-1 * var(--space-2)) 0 0" }}>
        Auto-recorded stops &amp; drives — label each into your day. Drives log travel time and mileage together.
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
            const flagged = !!seg.is_likely_noise;
            const isDrive = seg.kind === "drive";
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
                  <span style={{ fontSize: "1.1rem" }}>{isDrive ? "🚗" : "📍"}</span>
                  <strong style={{ fontSize: "0.95rem" }}>
                    {seg.place_label ?? (isDrive ? "Driving" : "Stop")}
                  </strong>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    <LocalTime iso={seg.started_at} />
                    {seg.ended_at ? <> – <LocalTime iso={seg.ended_at} /></> : " – now"}
                    {" · "}
                    {formatElapsed(seg.started_at, seg.ended_at ? new Date(seg.ended_at).getTime() : Date.now())}
                  </span>
                  {isOpen ? <Badge>In progress</Badge> : null}
                  {flagged ? <Badge className="p7-badge-status-overdue">Likely noise</Badge> : null}
                  <Badge>{segmentConfidenceLevel(seg)} confidence</Badge>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  <Select
                    id={`seg-activity-${seg.id}`}
                    options={ACTIVITY_OPTIONS}
                    value={choice[seg.id] ?? defaultActivity(seg)}
                    onChange={(e) => setChoice((c) => ({ ...c, [seg.id]: e.target.value as ActivityType }))}
                    disabled={isOpen || pending === seg.id}
                  />
                  {isDrive ? (
                    <>
                      <Select
                        id={`seg-vehicle-${seg.id}`}
                        options={vehicleOptions.length ? vehicleOptions : [{ value: "", label: "No vehicles" }]}
                        value={vehicleChoice[seg.id] ?? defaultVehicleId(seg)}
                        onChange={(e) => setVehicleChoice((c) => ({ ...c, [seg.id]: e.target.value }))}
                        disabled={isOpen || pending === seg.id || vehicleOptions.length === 0}
                      />
                      <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "0.85rem" }}>
                        <span style={{ color: "var(--text-muted)" }}>mi</span>
                        <input
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={milesChoice[seg.id] ?? ""}
                          onChange={(e) => setMilesChoice((c) => ({ ...c, [seg.id]: e.target.value }))}
                          disabled={isOpen || pending === seg.id}
                          style={{
                            width: "4.5rem",
                            padding: "var(--space-1) var(--space-2)",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border)",
                          }}
                        />
                      </label>
                    </>
                  ) : null}
                  <Button
                    size="sm"
                    variant={flagged ? "ghost" : "primary"}
                    loading={pending === seg.id}
                    disabled={isOpen || (isDrive && vehicleOptions.length === 0)}
                    onClick={() => (isDrive ? confirmDrive(seg) : confirmStop(seg))}
                  >
                    {isDrive ? "Confirm trip" : "Confirm"}
                  </Button>
                  <Button
                    size="sm"
                    variant={flagged ? "primary" : "ghost"}
                    disabled={pending === seg.id}
                    onClick={() => patch(seg.id, { action: "dismiss" }, "Dismissed")}
                  >
                    Dismiss
                  </Button>
                  {!isDrive ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isOpen || pending === seg.id}
                      onClick={() => setLinkSeg(seg)}
                    >
                      Link customer
                    </Button>
                  ) : null}
                </div>
                {isOpen ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: 0 }}>
                    {isDrive ? "Confirm this trip once the drive ends." : "Label this once it ends."}
                  </p>
                ) : flagged ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: 0 }}>
                    Looks like you didn’t really go anywhere — probably safe to dismiss.
                  </p>
                ) : isDrive && seg.estimated_miles != null ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: 0 }}>
                    GPS estimate: {seg.estimated_miles} mi — edit before confirming if needed.
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
                  style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "0.85rem", color: "var(--text-muted)", flexWrap: "wrap" }}
                >
                  <span>✓</span>
                  <span>{seg.kind === "drive" ? "🚗" : "📍"}</span>
                  <span>{seg.place_label ?? (seg.kind === "drive" ? "Driving" : "Stop")}</span>
                  <span>· {formatElapsed(seg.started_at, seg.ended_at ? new Date(seg.ended_at).getTime() : Date.now())}</span>
                  {seg.kind === "drive" && seg.vehicle_session_id ? (
                    <Badge>Trip linked</Badge>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
      <ConfirmDialog
        open={confirmReplace !== null}
        title="Archive overlapping activity?"
        body="This fully covers existing time on your ledger. Confirming archives those blocks (still in audit) so minutes are not double-counted."
        confirmLabel="Confirm and archive"
        onConfirm={() => {
          const pendingReplace = confirmReplace;
          setConfirmReplace(null);
          if (pendingReplace) {
            void patch(pendingReplace.id, pendingReplace.body, pendingReplace.successMsg);
          }
        }}
        onCancel={() => setConfirmReplace(null)}
        loading={pending === confirmReplace?.id}
      />
      {linkSeg ? (
        <SegmentLinkModal
          open
          onClose={() => setLinkSeg(null)}
          segmentId={linkSeg.id}
          segmentKind={linkSeg.kind}
          placeLabel={linkSeg.place_label}
          startedAt={linkSeg.started_at}
          endedAt={linkSeg.ended_at}
          initial={null}
          persistMode="api"
          onSaved={async () => {
            await load();
            router.refresh();
            window.dispatchEvent(new CustomEvent("fsm:segments-changed"));
            toast.success("Linked to customer");
          }}
        />
      ) : null}
    </section>
  );
}