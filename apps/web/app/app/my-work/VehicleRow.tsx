"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import { SUSPICIOUS_SESSION_MILES } from "@/lib/mileage/sessions";
import type { OpenSession, VehicleOption } from "../WorkdayPanel";

function fmtOdo(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString();
}

function odometerWarning(v: VehicleOption | null, start: number): string | null {
  const last = v?.current_odometer;
  if (last == null) return null;
  if (start < last) {
    return `That is ${fmtOdo(last - start)} mi below the last known reading — a reason is required.`;
  }
  if (start - last > SUSPICIOUS_SESSION_MILES) {
    return `That jumps ${fmtOdo(start - last)} mi from the last reading — double-check the number.`;
  }
  return null;
}

export function VehicleRow({
  openSession,
  vehicles,
  milesToday,
  onStartMileage,
}: {
  openSession: OpenSession | null;
  vehicles: VehicleOption[];
  milesToday: number;
  onStartMileage?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [checkpointOdo, setCheckpointOdo] = useState("");
  const [pending, setPending] = useState(false);
  const [showSwitch, setShowSwitch] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [switchVehicleId, setSwitchVehicleId] = useState("");
  const [switchEnd, setSwitchEnd] = useState("");
  const [switchStart, setSwitchStart] = useState("");
  const [switchCorrectionReason, setSwitchCorrectionReason] = useState("");
  const [closeOdo, setCloseOdo] = useState("");

  const activeVehicle = openSession
    ? vehicles.find((v) => v.id === openSession.vehicle_id) ?? null
    : null;
  const nickname = openSession?.vehicle_nickname ?? activeVehicle?.nickname ?? "Vehicle";
  const switchTarget = vehicles.find((v) => v.id === switchVehicleId) ?? null;
  const switchStartNum = Number(switchStart);
  const switchWarn =
    Number.isInteger(switchStartNum) && switchTarget
      ? odometerWarning(switchTarget, switchStartNum)
      : null;
  const switchNeedsReason = !!(
    switchTarget?.current_odometer != null &&
    Number.isInteger(switchStartNum) &&
    switchStartNum < switchTarget.current_odometer
  );

  async function saveCheckpoint() {
    if (!openSession) return;
    const odometer = Number(checkpointOdo);
    if (!Number.isInteger(odometer) || odometer < 1) {
      toast.error("Enter a valid odometer reading");
      return;
    }
    setPending(true);
    const res = await fetch(`/api/v1/sessions/${openSession.id}/checkpoint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ odometer }),
    });
    setPending(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error?.message ?? "Could not save odometer");
      return;
    }
    toast.success("Odometer saved");
    setCheckpointOdo("");
    router.refresh();
  }

  async function switchVehicle() {
    if (!openSession) return;
    const end = Number(switchEnd);
    const newStart = Number(switchStart);
    const newVehicle = vehicles.find((v) => v.id === switchVehicleId);
    if (!newVehicle) {
      toast.error("Pick the vehicle you're switching to");
      return;
    }
    if (!Number.isInteger(end) || end <= openSession.start_odometer) {
      toast.error(`End odometer must be above ${fmtOdo(openSession.start_odometer)}`);
      return;
    }
    if (!Number.isInteger(newStart) || newStart < 0) {
      toast.error("Enter the new vehicle's start odometer");
      return;
    }
    const needsReason =
      (newVehicle.current_odometer ?? 0) > newStart;
    if (needsReason && !switchCorrectionReason.trim()) {
      toast.error("A correction reason is required");
      return;
    }
    setPending(true);
    const res = await fetch("/api/v1/sessions/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        close_session_id: openSession.id,
        end_odometer: end,
        new_vehicle_id: switchVehicleId,
        new_start_odometer: newStart,
        ...(needsReason
          ? { correction: true, correction_reason: switchCorrectionReason.trim() }
          : {}),
      }),
    });
    setPending(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error?.message ?? "Could not switch vehicle");
      return;
    }
    toast.success(`Switched to ${newVehicle.nickname}`);
    setShowSwitch(false);
    setSwitchCorrectionReason("");
    router.refresh();
  }

  async function closeSession() {
    if (!openSession) return;
    const odometer = Number(closeOdo);
    if (!Number.isInteger(odometer) || odometer <= openSession.start_odometer) {
      toast.error(`Ending odometer must be greater than start (${fmtOdo(openSession.start_odometer)})`);
      return;
    }
    setPending(true);
    const res = await fetch(`/api/v1/sessions/${openSession.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ end_odometer: odometer }),
    });
    setPending(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error?.message ?? "Could not close session");
      return;
    }
    toast.success("Mileage session closed");
    setShowClose(false);
    router.refresh();
  }

  if (!openSession) {
    return (
      <div className="field-right-now__row">
        <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          No mileage session
        </span>
        {onStartMileage ? (
          <button
            type="button"
            className="p7-btn p7-btn-ghost p7-btn-sm"
            onClick={onStartMileage}
          >
            Start
          </button>
        ) : (
          <Link href="/app/mileage" className="p7-btn p7-btn-ghost p7-btn-sm">
            Start
          </Link>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="field-right-now__row field-right-now__toggle"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
          {nickname} · {milesToday} mi today
        </span>
        <span aria-hidden style={{ color: "var(--fg-muted)" }}>
          {expanded ? "▴" : "▾"}
        </span>
      </button>

      {expanded && (
        <div className="field-right-now__expanded">
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "end", flexWrap: "wrap" }}>
            <label style={{ flex: 1, minWidth: 120, fontSize: "var(--text-sm)", fontWeight: 600 }}>
              Odometer reading
              <input
                value={checkpointOdo}
                onChange={(e) => setCheckpointOdo(e.target.value)}
                inputMode="numeric"
                placeholder={fmtOdo(openSession.start_odometer)}
                style={{
                  display: "block",
                  width: "100%",
                  minHeight: 40,
                  marginTop: 6,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "0 var(--space-3)",
                }}
              />
            </label>
            <button
              type="button"
              className="p7-btn p7-btn-primary p7-btn-sm"
              disabled={pending}
              onClick={saveCheckpoint}
            >
              Save reading
            </button>
          </div>

          {!showSwitch && !showClose && (
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <button
                type="button"
                className="p7-btn p7-btn-ghost p7-btn-sm"
                onClick={() => {
                  setShowSwitch(true);
                  setShowClose(false);
                }}
              >
                Switch vehicle
              </button>
              <button
                type="button"
                className="p7-btn p7-btn-ghost p7-btn-sm"
                onClick={() => {
                  setShowClose(true);
                  setShowSwitch(false);
                }}
              >
                Close session
              </button>
            </div>
          )}

          {showSwitch && (
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              <label style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                End odometer ({nickname})
                <input
                  value={switchEnd}
                  onChange={(e) => setSwitchEnd(e.target.value)}
                  inputMode="numeric"
                  style={{
                    display: "block",
                    width: "100%",
                    minHeight: 40,
                    marginTop: 6,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: "0 var(--space-3)",
                  }}
                />
              </label>
              <label style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                New vehicle
                <select
                  value={switchVehicleId}
                  onChange={(e) => setSwitchVehicleId(e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    minHeight: 40,
                    marginTop: 6,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: "0 var(--space-3)",
                  }}
                >
                  <option value="">Select vehicle</option>
                  {vehicles
                    .filter((v) => v.id !== openSession.vehicle_id)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.nickname}
                      </option>
                    ))}
                </select>
              </label>
              <label style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                New start odometer
                <input
                  value={switchStart}
                  onChange={(e) => setSwitchStart(e.target.value)}
                  inputMode="numeric"
                  style={{
                    display: "block",
                    width: "100%",
                    minHeight: 40,
                    marginTop: 6,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: "0 var(--space-3)",
                  }}
                />
              </label>
              {switchWarn && (
                <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-amber-700)" }}>
                  {switchWarn}
                </p>
              )}
              {switchNeedsReason && (
                <label style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                  Correction reason
                  <input
                    value={switchCorrectionReason}
                    onChange={(e) => setSwitchCorrectionReason(e.target.value)}
                    placeholder="Odometer replaced, wrong truck, etc."
                    style={{
                      display: "block",
                      width: "100%",
                      minHeight: 40,
                      marginTop: 6,
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      padding: "0 var(--space-3)",
                    }}
                  />
                </label>
              )}
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button
                  type="button"
                  className="p7-btn p7-btn-primary p7-btn-sm"
                  disabled={pending}
                  onClick={switchVehicle}
                >
                  Switch
                </button>
                <button
                  type="button"
                  className="p7-btn p7-btn-ghost p7-btn-sm"
                  onClick={() => {
                    setShowSwitch(false);
                    setSwitchCorrectionReason("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showClose && (
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              <label style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                End odometer
                <input
                  value={closeOdo}
                  onChange={(e) => setCloseOdo(e.target.value)}
                  inputMode="numeric"
                  style={{
                    display: "block",
                    width: "100%",
                    minHeight: 40,
                    marginTop: 6,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: "0 var(--space-3)",
                  }}
                />
              </label>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button
                  type="button"
                  className="p7-btn p7-btn-secondary p7-btn-sm"
                  disabled={pending}
                  onClick={closeSession}
                >
                  Close session
                </button>
                <button
                  type="button"
                  className="p7-btn p7-btn-ghost p7-btn-sm"
                  onClick={() => setShowClose(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}