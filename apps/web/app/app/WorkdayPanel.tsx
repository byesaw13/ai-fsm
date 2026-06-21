"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, EmptyState, LinkButton, Modal, SectionHeader, StatusBadge, useToast } from "@/components/ui";
import { NowBar, DayTimeSummary, type ActivityEntryDto } from "./ActivityTracker";
import type { StatusVariant } from "@/components/ui";
import type { DayMileageSummary } from "@/lib/mileage/sessions";
import { ACTIVITY_TYPE_META, type ActivityType } from "@ai-fsm/domain";

export type CountAction = {
  label: string;
  count: number;
  href: Route;
  detail: string;
  tone: "danger" | "warning" | "default";
};

export type CommandVisit = {
  id: string;
  title: string;
  status: string;
  client_name: string | null;
  property_address: string | null;
  visit_id: string | null;
  scheduled_start: string | null;
  visit_status: string | null;
  sub_status: string | null;
};

export type VehicleOption = {
  id: string;
  nickname: string;
  plate: string | null;
  current_odometer: number | null;
};

export type OpenSession = {
  id: string;
  session_date: string;
  vehicle_id: string | null;
  vehicle_nickname: string | null;
  vehicle_plate: string | null;
  start_odometer: number;
  started_at?: string | null;
};

const SUSPICIOUS_SESSION_MILES = 500;

export type MaterialJob = {
  id: string;
  job_id: string;
  title: string;
  client_name: string | null;
};

export type EndWarnings = {
  missingReceiptPhotos: number;
  jobsInProgress: number;
  draftInvoices: number;
  deposits: number;
};

type TabState = "start_day" | "work_day" | "end_day";

function fmtTime(iso: string | null): string {
  if (!iso) return "Today";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtOdo(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString();
}

function accentForTone(tone: CountAction["tone"]): string {
  if (tone === "danger") return "var(--color-danger)";
  if (tone === "warning") return "var(--color-warning)";
  return "var(--accent)";
}

const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--text-sm)", fontWeight: 600 };
const fieldStyle: React.CSSProperties = { minHeight: 40, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "0 var(--space-3)", background: "var(--bg-card)" };

// A pending vehicle selection awaiting explicit confirmation.
type VehicleConfirm = {
  title: string;
  vehicle: VehicleOption | null;
  lines: string[];
  warn: string | null;
  needsReason: boolean;
  confirmLabel: string;
  run: (reason: string | null) => Promise<void>;
};

// A vehicle has an open session from a prior day — we must capture its end odometer first
type PriorPrompt = {
  openSessionId: string;
  suggestedEnd: number;
  retry: () => Promise<void>;
};

const EMPTY_WARNINGS: EndWarnings = {
  missingReceiptPhotos: 0,
  jobsInProgress: 0,
  draftInvoices: 0,
  deposits: 0,
};

export function WorkdayPanel({
  todayLabel,
  openSession,
  vehicles,
  // surface: "owner" shows the full command center (business widgets included);
  // "my_day" renders the field workday only (EPIC-006 — My Day reuses this).
  surface = "owner",
  actionQueue = [],
  todayJobs = [],
  materialCount = 0,
  materialJobs = [],
  warnings = EMPTY_WARNINGS,
  tomorrowJobs = [],
  activityEntries,
  dayMileage,
  yesterdayMiles = 0,
  outstandingInvoicesCents = 0,
  pendingDepositsCents = 0,
  paidThisMonthCents = 0,
}: {
  todayLabel: string;
  openSession: OpenSession | null;
  vehicles: VehicleOption[];
  surface?: "owner" | "my_day";
  actionQueue?: CountAction[];
  todayJobs?: CommandVisit[];
  materialCount?: number;
  materialJobs?: MaterialJob[];
  warnings?: EndWarnings;
  tomorrowJobs?: CommandVisit[];
  activityEntries: ActivityEntryDto[];
  dayMileage: DayMileageSummary;
  yesterdayMiles?: number;
  outstandingInvoicesCents?: number;
  pendingDepositsCents?: number;
  paidThisMonthCents?: number;
}) {
  // Owner-only widgets (business action queue, revenue, tomorrow). Hidden on the
  // technician My Day surface, which is field-execution only.
  const showOwnerExtras = surface !== "my_day";
  const router = useRouter();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<TabState>(openSession ? "work_day" : "start_day");

  // Keep state synced with open session
  useEffect(() => {
    if (!openSession) {
      setActiveTab("start_day");
    } else if (activeTab === "start_day") {
      setActiveTab("work_day");
    }
  }, [openSession]);

  // Start Day form state
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const [startOdometer, setStartOdometer] = useState(String(selectedVehicle?.current_odometer ?? ""));
  const [showStartDetails, setShowStartDetails] = useState(false);

  // Sync odometer input when vehicle selection changes
  useEffect(() => {
    if (selectedVehicle) {
      setStartOdometer(String(selectedVehicle.current_odometer ?? ""));
    }
  }, [vehicleId, vehicles]);

  // Switch / Correct inline state
  const [vehicleMode, setVehicleMode] = useState<null | "switch" | "correct">(null);
  const [switchVehicleId, setSwitchVehicleId] = useState("");
  const [switchEnd, setSwitchEnd] = useState("");
  const [switchStart, setSwitchStart] = useState("");
  const [correctVehicleId, setCorrectVehicleId] = useState("");
  const [correctReason, setCorrectReason] = useState("");

  // Modals & triggers
  const [confirm, setConfirm] = useState<VehicleConfirm | null>(null);
  const [confirmReason, setConfirmReason] = useState("");
  const [prior, setPrior] = useState<PriorPrompt | null>(null);
  const [priorEnd, setPriorEnd] = useState("");
  const [pending, setPending] = useState(false);

  // End of Day Odometer Input state
  const [endOdometer, setEndOdometer] = useState("");

  const activeVehicle = openSession ? vehicles.find((v) => v.id === openSession.vehicle_id) ?? null : null;
  const activeEntry = activityEntries.find((e) => e.ended_at === null) ?? null;

  function vehicleLines(v: VehicleOption | null, start: number): string[] {
    return [
      `Vehicle: ${v?.nickname ?? "No vehicle"}`,
      `Plate: ${v?.plate ?? "—"}`,
      `Last known odometer: ${fmtOdo(v?.current_odometer ?? null)}`,
      `Starting at: ${fmtOdo(start)}`,
    ];
  }

  function odometerWarning(v: VehicleOption | null, start: number): string | null {
    const last = v?.current_odometer;
    if (last == null) return null;
    if (start < last) return `That is ${fmtOdo(last - start)} mi below the last known reading — a reason is required.`;
    if (start - last > SUSPICIOUS_SESSION_MILES) return `That jumps ${fmtOdo(start - last)} mi from the last reading — double-check the number.`;
    return null;
  }

  async function postStart(vId: string | null, start: number, reason: string | null) {
    const res = await fetch("/api/v1/sessions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicle_id: vId, start_odometer: start, correction: reason ? true : undefined, correction_reason: reason || undefined }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 409 && json.error?.code === "INCOMPLETE_PRIOR_SESSION") {
      setPrior({ openSessionId: json.error.open_session_id, suggestedEnd: json.error.suggested_end_odometer ?? start, retry: () => postStart(vId, start, reason) });
      setPriorEnd(String(json.error.suggested_end_odometer ?? start));
      return;
    }
    if (!res.ok) { toast.error(json.error?.message ?? "Could not start session"); return; }
    toast.success("Mileage session started");
    router.refresh();
  }

  function beginStart() {
    const odo = Number(startOdometer);
    if (!Number.isInteger(odo) || odo < 0) { toast.error("Enter a valid start odometer"); return; }
    if (vehicleId && !selectedVehicle) { toast.error("Pick a valid vehicle"); return; }
    const warn = odometerWarning(selectedVehicle ?? null, odo);
    setConfirmReason("");
    setConfirm({
      title: "Confirm vehicle",
      vehicle: selectedVehicle ?? null,
      lines: vehicleLines(selectedVehicle ?? null, odo),
      warn,
      needsReason: !!warn && (selectedVehicle?.current_odometer ?? 0) > odo,
      confirmLabel: "Yes, use this vehicle",
      run: (reason) => postStart(vehicleId || null, odo, reason),
    });
  }

  function beginSwitch() {
    if (!openSession) return;
    const end = Number(switchEnd);
    const newStart = Number(switchStart);
    const newVehicle = vehicles.find((v) => v.id === switchVehicleId) ?? null;
    if (!newVehicle) { toast.error("Pick the vehicle you're switching to"); return; }
    if (!Number.isInteger(end) || end <= openSession.start_odometer) { toast.error(`End odometer must be above ${fmtOdo(openSession.start_odometer)}`); return; }
    if (!Number.isInteger(newStart) || newStart < 0) { toast.error("Enter the new vehicle's start odometer"); return; }
    const warn = odometerWarning(newVehicle, newStart);
    setConfirmReason("");
    setConfirm({
      title: "Confirm vehicle switch",
      vehicle: newVehicle,
      lines: [`Closing ${activeVehicle?.nickname ?? "current vehicle"} at ${fmtOdo(end)}`, "", ...vehicleLines(newVehicle, newStart)],
      warn,
      needsReason: !!warn && (newVehicle.current_odometer ?? 0) > newStart,
      confirmLabel: "Yes, switch vehicle",
      run: async (reason) => {
        const res = await fetch("/api/v1/sessions/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ close_session_id: openSession.id, end_odometer: end, new_vehicle_id: switchVehicleId, new_start_odometer: newStart, correction: reason ? true : undefined, correction_reason: reason || undefined }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { toast.error(json.error?.message ?? "Could not switch vehicle"); return; }
        setVehicleMode(null);
        toast.success(`Switched to ${newVehicle.nickname}`);
        router.refresh();
      },
    });
  }

  function beginCorrect() {
    if (!openSession) return;
    const newVehicle = vehicles.find((v) => v.id === correctVehicleId) ?? null;
    if (!newVehicle) { toast.error("Pick the correct vehicle"); return; }
    setConfirmReason("");
    setConfirm({
      title: "Change vehicle for this session",
      vehicle: newVehicle,
      lines: [`Reassign this open session to:`, "", ...vehicleLines(newVehicle, openSession.start_odometer)],
      warn: odometerWarning(newVehicle, openSession.start_odometer),
      needsReason: false,
      confirmLabel: "Yes, change vehicle",
      run: async () => {
        const res = await fetch(`/api/v1/sessions/${openSession.id}/correct-vehicle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vehicle_id: correctVehicleId, correction_reason: correctReason.trim() || undefined }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { toast.error(json.error?.message ?? "Could not change vehicle"); return; }
        setVehicleMode(null);
        toast.success(`Session reassigned to ${newVehicle.nickname}`);
        router.refresh();
      },
    });
  }

  async function runConfirm() {
    if (!confirm) return;
    if (confirm.needsReason && !confirmReason.trim()) { toast.error("A correction reason is required"); return; }
    setPending(true);
    await confirm.run(confirm.needsReason ? confirmReason.trim() : null);
    setPending(false);
    setConfirm(null);
  }

  async function resolvePrior() {
    if (!prior) return;
    const end = Number(priorEnd);
    if (!Number.isInteger(end) || end < 1) { toast.error("Enter the end odometer for the open session"); return; }
    setPending(true);
    const res = await fetch(`/api/v1/sessions/${prior.openSessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ end_odometer: end }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setPending(false);
      toast.error(json.error?.message ?? "Could not close the open session");
      return;
    }
    const retry = prior.retry;
    setPrior(null);
    await retry();
    setPending(false);
    router.refresh();
  }

  async function closeSession() {
    if (!openSession) return;
    const odometer = Number(endOdometer);
    if (!Number.isInteger(odometer) || odometer <= openSession.start_odometer) {
      toast.error(`Ending odometer must be greater than start (${fmtOdo(openSession.start_odometer)})`);
      return;
    }
    setPending(true);
    const res = await fetch(`/api/v1/sessions/${openSession.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ end_odometer: odometer, end_day: true }),
    });
    setPending(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error?.message ?? "Could not close session");
      return;
    }
    toast.success("Day closed and mileage finalized");
    router.refresh();
  }

  // Discard a stuck/erroneous open session (e.g. a wrong start odometer that
  // can't be closed because the end must exceed it). Deletes the session, so the
  // vehicle's last-known odometer reverts to the prior good reading.
  async function discardSession() {
    if (!openSession) return;
    if (!window.confirm(
      `Discard the open session on ${openSession.vehicle_nickname} (started at ${fmtOdo(openSession.start_odometer)} mi)? ` +
      `No mileage is recorded and the vehicle's last reading reverts to the previous session.`,
    )) return;
    setPending(true);
    const res = await fetch(`/api/v1/sessions/${openSession.id}`, { method: "DELETE" });
    setPending(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error?.message ?? "Could not discard session");
      return;
    }
    toast.success("Open session discarded");
    router.refresh();
  }

  // Jobs Today transition helpers
  const [updatingVisitId, setUpdatingVisitId] = useState<string | null>(null);
  const [guardedVisit, setGuardedVisit] = useState<string | null>(null);

  async function transitionVisit(visitId: string, status: "arrived" | "completed") {
    setUpdatingVisitId(visitId);
    setGuardedVisit(null);
    const res = await fetch(`/api/v1/visits/${visitId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json().catch(() => ({}));
    setUpdatingVisitId(null);
    if (!res.ok) {
      if (status === "completed" && ["MISSING_PHOTO", "MISSING_SIGNATURE"].includes(json.error?.code)) {
        setGuardedVisit(visitId);
        return;
      }
      toast.error(json.error?.message ?? "Could not update visit");
      return;
    }
    toast.success(status === "completed" ? "Visit completed" : "Arrived on site");
    router.refresh();
  }

  async function markNeedsFollowUp(visitId: string) {
    setUpdatingVisitId(visitId);
    const res = await fetch(`/api/v1/visits/${visitId}/sub-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sub_status: "reschedule_requested" }),
    });
    setUpdatingVisitId(null);
    if (!res.ok) {
      toast.error("Could not mark visit for follow-up");
      return;
    }
    toast.success("Visit marked for reschedule");
    router.refresh();
  }

  // Stop current active activity tracking
  async function stopTracking() {
    setPending(true);
    const res = await fetch("/api/v1/activities/stop", { method: "POST" });
    setPending(false);
    if (!res.ok) {
      toast.error("Could not stop activity");
      return;
    }
    toast.success("Activity tracking stopped");
    router.refresh();
  }

  // Derived state calculations
  const totalWarnings = warnings.missingReceiptPhotos + warnings.jobsInProgress + warnings.draftInvoices + warnings.deposits;
  const isEndDayReady = !openSession || (Number(endOdometer) > (openSession?.start_odometer ?? 0));

  return (
    <>
      <style>{`
        .dc-container {
          display: grid;
          grid-template-columns: 1fr;
          gap: var(--space-4);
        }
        @media (min-width: 1024px) {
          .dc-container {
            grid-template-columns: 2.2fr 1fr;
          }
        }
        .quick-actions-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-2);
        }
        .workflow-stepper {
          display: flex;
          gap: var(--space-3);
          align-items: center;
          width: 100%;
          overflow-x: auto;
          padding-bottom: var(--space-2);
          border-bottom: 1px solid var(--border);
          margin-bottom: var(--space-4);
        }
        .chips-scroll {
          display: flex;
          gap: var(--space-2);
          overflow-x: auto;
          padding-bottom: 4px;
          -webkit-overflow-scrolling: touch;
        }
      `}</style>

      {/* Modern Horizontal Stepper */}
      <div className="workflow-stepper">
        {[
          { key: "start_day", label: "Start Day", desc: openSession ? (activeVehicle?.nickname ?? "Vehicle active") : "Pre-flight & Vehicle", icon: "🏁" },
          { key: "work_day", label: "Work Day", desc: openSession ? `${todayJobs.length} jobs scheduled` : "Track time & jobs", icon: "🛠️" },
          { key: "end_day", label: "End Day", desc: `${totalWarnings} tasks remaining`, icon: "🏁" },
        ].map((step, i) => {
          const isCurrent = activeTab === step.key;
          const isCompleted = step.key === "start_day" && openSession;
          const isDisabled = !openSession && step.key !== "start_day";

          return (
            <div
              key={step.key}
              onClick={() => { if (!isDisabled) setActiveTab(step.key as TabState); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                cursor: isDisabled ? "not-allowed" : "pointer",
                opacity: isDisabled ? 0.45 : 1,
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-md)",
                background: isCurrent ? "var(--accent-subtle)" : "transparent",
                border: isCurrent ? "1px solid var(--accent)" : "1px solid transparent",
                flex: 1,
                minWidth: 160,
                transition: "all var(--transition-base)"
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: isCompleted ? "var(--color-green-500)" : isCurrent ? "var(--accent)" : "var(--color-slate-200)",
                  color: isCompleted || isCurrent ? "#fff" : "var(--fg-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "bold",
                  fontSize: 14
                }}
              >
                {isCompleted ? "✓" : i + 1}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: isCurrent ? "var(--accent)" : "var(--fg)" }}>{step.label}</span>
                <span style={{ fontSize: 10, color: "var(--fg-muted)" }}>{step.desc}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="dc-container">
        
        {/* ---- LEFT COLUMN: MAIN WORKSPACE ---- */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          
          {/* STATE 1: Before Day Starts */}
          {activeTab === "start_day" && (
            <>
              {!openSession ? (
                <Card style={{ border: "2px solid var(--accent)", boxShadow: "var(--shadow-md)", padding: "var(--space-5)" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                    <div>
                      <div style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent)", fontWeight: 700, marginBottom: 4 }}>
                        Dovetails Handyman System
                      </div>
                      <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 800, margin: 0 }}>Start Your Workday</h2>
                      <p style={{ color: "var(--fg-muted)", margin: "var(--space-1) 0 0", fontSize: "var(--text-sm)" }}>
                        Welcome back, Nick! Log starting odometer to unlock day tracking.
                      </p>
                    </div>

                    {!showStartDetails ? (
                      <div style={{ padding: "var(--space-3)", background: "var(--color-slate-50)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <strong>{selectedVehicle?.nickname ?? "No vehicle"}</strong>
                          <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                            Last Odometer: {fmtOdo(selectedVehicle?.current_odometer)} mi {selectedVehicle?.plate ? `· ${selectedVehicle.plate}` : ""}
                          </div>
                        </div>
                        <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={() => setShowStartDetails(true)}>
                          ✏️ Change
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", padding: "var(--space-3)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                        <label style={labelStyle}>
                          Select Vehicle
                          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} style={fieldStyle}>
                            <option value="">No vehicle</option>
                            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nickname}</option>)}
                          </select>
                        </label>
                        <label style={labelStyle}>
                          Starting Odometer (mi)
                          <input value={startOdometer} onChange={(e) => setStartOdometer(e.target.value)} inputMode="numeric" style={fieldStyle} />
                        </label>
                        <div style={{ gridColumn: "1 / -1", textAlign: "right" }}>
                          <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={() => setShowStartDetails(false)}>
                            Hide Settings
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={beginStart}
                      className="p7-btn p7-btn-primary"
                      style={{ minHeight: 48, fontSize: "var(--text-base)", fontWeight: 700 }}
                    >
                      Start Day in {selectedVehicle?.nickname ?? "Default Vehicle"} ({fmtOdo(Number(startOdometer) || selectedVehicle?.current_odometer)} mi)
                    </button>
                  </div>
                </Card>
              ) : (
                <Card style={{ padding: "var(--space-4)", background: "var(--accent-subtle)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h3 style={{ margin: 0, fontWeight: 700, color: "var(--accent)" }}>✓ Odometer & Day Started</h3>
                      <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                        Logged {activeVehicle?.nickname} at {fmtOdo(openSession.start_odometer)} mi.
                      </span>
                    </div>
                    <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" onClick={() => setActiveTab("work_day")}>
                      Go to Work Day
                    </button>
                  </div>
                </Card>
              )}

              {/* Today's Schedule Card */}
              <JobsToday jobs={todayJobs} />
            </>
          )}

          {/* STATE 2: Active Day */}
          {activeTab === "work_day" && (
            <>
              {/* NowBar & Quick Switching */}
              <NowBar
                active={activeEntry}
                quickTypes={["travel", "job_work", "material_run", "admin", "personal"]}
              />

              {/* Active Vehicle Ribbon */}
              {openSession && (
                <Card padding="sm" style={{ background: "var(--bg-subtle)", borderLeft: "4px solid var(--color-success)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
                    <span>
                      <strong>Driving: {openSession.vehicle_nickname ?? "No vehicle"}</strong>
                      <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginLeft: 8 }}>
                        (Plate: {openSession.vehicle_plate ?? "—"}) · Started: {fmtOdo(openSession.start_odometer)} mi
                      </span>
                    </span>
                    <div style={{ display: "flex", gap: "var(--space-2)" }}>
                      <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={() => { setVehicleMode(vehicleMode === "switch" ? null : "switch"); setSwitchVehicleId(""); setSwitchEnd(""); setSwitchStart(""); }}>
                        Switch Vehicle
                      </button>
                      <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={() => { setVehicleMode(vehicleMode === "correct" ? null : "correct"); setCorrectVehicleId(""); setCorrectReason(""); }}>
                        Correct
                      </button>
                    </div>
                  </div>

                  {vehicleMode === "switch" && (
                    <div style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", alignItems: "end", marginTop: "var(--space-3)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
                      <label style={labelStyle}>
                        End odometer ({activeVehicle?.nickname})
                        <input value={switchEnd} onChange={(e) => setSwitchEnd(e.target.value)} inputMode="numeric" style={fieldStyle} />
                      </label>
                      <label style={labelStyle}>
                        Switch to
                        <select value={switchVehicleId} onChange={(e) => { const v = vehicles.find((x) => x.id === e.target.value); setSwitchVehicleId(e.target.value); setSwitchStart(String(v?.current_odometer ?? "")); }} style={fieldStyle}>
                          <option value="">Select vehicle</option>
                          {vehicles.filter((v) => v.id !== openSession.vehicle_id).map((v) => <option key={v.id} value={v.id}>{v.nickname}</option>)}
                        </select>
                      </label>
                      <label style={labelStyle}>
                        New start odometer
                        <input value={switchStart} onChange={(e) => setSwitchStart(e.target.value)} inputMode="numeric" style={fieldStyle} />
                      </label>
                      <button type="button" className="p7-btn p7-btn-primary p7-btn-sm" onClick={beginSwitch}>Review</button>
                    </div>
                  )}

                  {vehicleMode === "correct" && (
                    <div style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", alignItems: "end", marginTop: "var(--space-3)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
                      <label style={labelStyle}>
                        Correct vehicle
                        <select value={correctVehicleId} onChange={(e) => setCorrectVehicleId(e.target.value)} style={fieldStyle}>
                          <option value="">Select vehicle</option>
                          {vehicles.filter((v) => v.id !== openSession.vehicle_id).map((v) => <option key={v.id} value={v.id}>{v.nickname}</option>)}
                        </select>
                      </label>
                      <label style={labelStyle}>
                        Reason (optional)
                        <input value={correctReason} onChange={(e) => setCorrectReason(e.target.value)} placeholder="Wrong truck selected" style={fieldStyle} />
                      </label>
                      <button type="button" className="p7-btn p7-btn-primary p7-btn-sm" onClick={beginCorrect}>Review</button>
                    </div>
                  )}
                </Card>
              )}

              {/* Owner-only: today's schedule, action queue, materials. On My Day
                  the assigned visits come from the My Day visit list instead. */}
              {showOwnerExtras && (
                <>
                  <JobsToday jobs={todayJobs} />
                  <ActionQueue items={actionQueue} />
                  <Materials count={materialCount} jobs={materialJobs} />
                </>
              )}
            </>
          )}

          {/* STATE 3: End of Day */}
          {activeTab === "end_day" && (
            <>
              {/* Checklist Hero Card */}
              <Card style={{ padding: "var(--space-4)" }}>
                <SectionHeader title="End of Day Checklist" count={warnings.missingReceiptPhotos + (activeEntry ? 1 : 0) + (openSession ? 1 : 0)} />
                <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", margin: "-4px 0 var(--space-4)" }}>
                  Resolve blockers below to complete your checkout and close the day.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
                  
                  {/* Item 1: Mileage Session */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", padding: "var(--space-3)", background: "var(--color-slate-50)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 20 }}>{openSession ? "🔴" : "🟢"}</div>
                    <div style={{ flex: 1 }}>
                      <strong>Vehicle Session</strong>
                      <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                        {openSession ? (
                          <>
                            Active session open on <strong>{openSession.vehicle_nickname}</strong> (started at {fmtOdo(openSession.start_odometer)} mi).
                            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "end", marginTop: "var(--space-2)", flexWrap: "wrap" }}>
                              <label style={{ ...labelStyle, fontWeight: 500, fontSize: 12 }}>
                                Ending Odometer
                                <input value={endOdometer} onChange={(e) => setEndOdometer(e.target.value)} inputMode="numeric" placeholder="Odo reading" style={{ ...fieldStyle, minHeight: 34, width: 120 }} />
                              </label>
                              <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" style={{ minHeight: 34 }} onClick={closeSession} disabled={pending || !endOdometer}>
                                Close Mileage
                              </button>
                              <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" style={{ minHeight: 34 }} onClick={discardSession} disabled={pending}>
                                Discard session
                              </button>
                            </div>
                            <span style={{ display: "block", color: "var(--fg-muted)", fontSize: 11, marginTop: "var(--space-1)" }}>
                              Wrong start odometer? Use Discard to clear it without recording mileage.
                            </span>
                          </>
                        ) : (
                          "All mileage sessions closed successfully."
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Item 2: Unclosed Activity */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", padding: "var(--space-3)", background: "var(--color-slate-50)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 20 }}>{activeEntry ? "🔴" : "🟢"}</div>
                    <div style={{ flex: 1 }}>
                      <strong>Active Time Tracking</strong>
                      <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                        {activeEntry ? (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                            <span>Active tracker running: <strong>{ACTIVITY_TYPE_META[activeEntry.activity_type as ActivityType]?.emoji} {ACTIVITY_TYPE_META[activeEntry.activity_type as ActivityType]?.label}</strong>.</span>
                            <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" onClick={stopTracking}>Stop Tracking</button>
                          </div>
                        ) : (
                          "All activity trackers stopped."
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Item 3: Missing Receipt Photos */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", padding: "var(--space-3)", background: "var(--color-slate-50)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 20 }}>{warnings.missingReceiptPhotos > 0 ? "🔴" : "🟢"}</div>
                    <div style={{ flex: 1 }}>
                      <strong>Receipt Photos</strong>
                      <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)" }}>
                        <span>
                          {warnings.missingReceiptPhotos > 0 
                            ? `${warnings.missingReceiptPhotos} receipt expense records are missing attached photos.` 
                            : "All of today's receipts have photos attached."}
                        </span>
                        {warnings.missingReceiptPhotos > 0 && (
                          <Link href={"/app/expenses" as Route} className="p7-btn p7-btn-secondary p7-btn-sm">Attach Photos</Link>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Item 4: In-Progress Jobs */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", padding: "var(--space-3)", background: "var(--color-slate-50)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 20 }}>{warnings.jobsInProgress > 0 ? "🟡" : "🟢"}</div>
                    <div style={{ flex: 1 }}>
                      <strong>Unclosed Jobs</strong>
                      <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                        {warnings.jobsInProgress > 0 
                          ? `${warnings.jobsInProgress} job(s) are still active or in progress.` 
                          : "All of today's scheduled jobs are completed."}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  <button
                    type="button"
                    className="p7-btn p7-btn-primary"
                    style={{ minHeight: 48, fontWeight: 700, width: "100%" }}
                    disabled={openSession !== null || pending}
                    onClick={() => {
                      toast.success("Workday completed. See you tomorrow!");
                      router.push("/app" as Route);
                    }}
                  >
                    Complete & Close Day
                  </button>
                  {openSession && (
                    <span style={{ fontSize: 11, color: "var(--color-red-600)", textAlign: "center", display: "block" }}>
                      ⚠️ You must close your mileage session before you can finalize and close your day.
                    </span>
                  )}
                </div>
              </Card>

              {/* Tomorrow's Schedule (owner planning view) */}
              {showOwnerExtras && (
                <Card>
                  <SectionHeader title="Tomorrow's Plan" count={tomorrowJobs.length} />
                  {tomorrowJobs.length === 0 ? (
                    <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", margin: 0 }}>No visits scheduled tomorrow.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      {tomorrowJobs.map((job) => (
                        <Link key={job.id} href={(job.visit_id ? `/app/visits/${job.visit_id}` : `/app/jobs/${job.id}`) as Route} style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", textDecoration: "none", color: "inherit", background: "var(--bg-card)" }}>
                          <span><strong>{fmtTime(job.scheduled_start)}</strong> · {job.title}</span>
                          <small style={{ color: "var(--fg-muted)" }}>{job.client_name}</small>
                        </Link>
                      ))}
                    </div>
                  )}
                </Card>
              )}
            </>
          )}

        </div>

        {/* ---- RIGHT COLUMN: SIDEBAR DESKTOP ONLY ---- */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          
          {/* Financial Snapshot + Quick Actions — owner-only business sidebar */}
          {showOwnerExtras && (<>
          <Card style={{ padding: "var(--space-4)" }}>
            <SectionHeader title="Financial Snapshot" />
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
              <div>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", textTransform: "uppercase", fontWeight: 600 }}>Outstanding Invoices</span>
                <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--color-red-600)" }}>
                  ${(outstandingInvoicesCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", textTransform: "uppercase", fontWeight: 600 }}>Deposits Pending</span>
                <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--color-amber-600)" }}>
                  ${(pendingDepositsCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", textTransform: "uppercase", fontWeight: 600 }}>Collected This Month</span>
                <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--color-green-600)" }}>
                  ${(paidThisMonthCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
            <div style={{ marginTop: "var(--space-4)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
              <Link href={"/app/reports" as Route} style={{ color: "var(--accent)", fontSize: "var(--text-xs)", fontWeight: 600, textDecoration: "none" }}>
                View Full Reports →
              </Link>
            </div>
          </Card>

          {/* Quick Actions Card */}
          <Card style={{ padding: "var(--space-4)" }}>
            <SectionHeader title="Quick Actions" />
            <div className="quick-actions-grid" style={{ marginTop: "var(--space-3)" }}>
              {[
                { label: "New Estimate", href: "/app/estimates", icon: "📝" },
                { label: "New Job", href: "/app/jobs", icon: "🛠️" },
                { label: "Log Mileage", href: "/app/mileage", icon: "🚗" },
                { label: "Add Expense", href: "/app/expenses/new", icon: "🛒" },
                { label: "Upload Receipt", href: "/app/expenses/new", icon: "🧾" },
                { label: "New Request", href: "/app/intake/new", icon: "⚡" },
              ].map((act) => (
                <Link
                  key={act.label}
                  href={act.href as Route}
                  style={{
                    display: "flex", flexDirection: "column", gap: 4, alignItems: "center", justifyContent: "center",
                    padding: "var(--space-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
                    textDecoration: "none", color: "inherit", background: "var(--bg-card)", textAlign: "center",
                    minHeight: 74, fontSize: 11, fontWeight: 600, boxShadow: "var(--shadow-xs)"
                  }}
                  className="p7-card-hover"
                >
                  <span style={{ fontSize: 18 }}>{act.icon}</span>
                  <span>{act.label}</span>
                </Link>
              ))}
            </div>
          </Card>
          </>)}

          {/* Statistics at a Glance */}
          <Card style={{ padding: "var(--space-4)" }}>
            <SectionHeader title="Today's Stats" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
              <div style={{ background: "var(--color-slate-50)", padding: "var(--space-3)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                <span style={{ fontSize: 10, color: "var(--fg-muted)", textTransform: "uppercase" }}>Miles Today</span>
                <div style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>{dayMileage.totalMiles} mi</div>
              </div>
              <div style={{ background: "var(--color-slate-50)", padding: "var(--space-3)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                <span style={{ fontSize: 10, color: "var(--fg-muted)", textTransform: "uppercase" }}>Yesterday</span>
                <div style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>{yesterdayMiles} mi</div>
              </div>
            </div>
          </Card>

        </div>

      </div>

      {/* --- CONFIRM VEHICLE MODAL --- */}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? "Confirm vehicle"} data-testid="vehicle-confirm">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {confirm?.lines.map((line, i) => line === "" ? <div key={i} style={{ height: 4 }} /> : <div key={i}>{line}</div>)}
          {confirm?.warn ? <div style={{ marginTop: "var(--space-2)", color: "#b45309", fontWeight: 600 }}>⚠️ {confirm.warn}</div> : null}
          {confirm?.needsReason ? (
            <label style={{ ...labelStyle, marginTop: "var(--space-2)" }}>
              Correction reason
              <input value={confirmReason} onChange={(e) => setConfirmReason(e.target.value)} placeholder="Why is the odometer lower?" style={fieldStyle} />
            </label>
          ) : null}
          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", marginTop: "var(--space-3)" }}>
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={pending}>Cancel</Button>
            <Button variant="primary" onClick={runConfirm} loading={pending} disabled={pending}>{confirm?.confirmLabel ?? "Confirm"}</Button>
          </div>
        </div>
      </Modal>

      {/* --- RESOLVE PRIOR SESSION MODAL --- */}
      <Modal open={!!prior} onClose={() => setPrior(null)} title="Close the open session first" data-testid="prior-session-prompt">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <p style={{ margin: 0 }}>This vehicle still has an open mileage session. Enter its end odometer to close it before starting a new one.</p>
          <label style={labelStyle}>
            End odometer
            <input value={priorEnd} onChange={(e) => setPriorEnd(e.target.value)} inputMode="numeric" style={fieldStyle} />
          </label>
          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setPrior(null)} disabled={pending}>Cancel</Button>
            <Button variant="primary" onClick={resolvePrior} loading={pending} disabled={pending}>Close & continue</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function ActionQueue({ items }: { items: CountAction[] }) {
  return (
    <Card>
      <SectionHeader title="What needs you" count={items.length} />
      {items.length === 0 ? (
        <EmptyState title="Nothing is waiting" description="Follow-ups, deposits, and invoices show up here when they need action." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {items.map((item) => {
            const accent = accentForTone(item.tone);
            return (
              <Link key={item.label} href={item.href} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", padding: "var(--space-3)", borderRadius: "var(--radius)", border: "1px solid var(--border)", borderLeft: `4px solid ${accent}`, textDecoration: "none", color: "inherit", background: "var(--bg-card)" }}>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <strong>{item.label}</strong>
                  <small style={{ color: "var(--fg-muted)" }}>{item.detail}</small>
                </span>
                <b style={{ minWidth: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 8px", borderRadius: 99, background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}>{item.count}</b>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function JobsToday({ jobs }: { jobs: CommandVisit[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [guardedVisit, setGuardedVisit] = useState<string | null>(null);

  async function transition(visitId: string, status: "arrived" | "completed") {
    setPending(visitId);
    setGuardedVisit(null);
    const res = await fetch(`/api/v1/visits/${visitId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json().catch(() => ({}));
    setPending(null);
    if (!res.ok) {
      if (status === "completed" && ["MISSING_PHOTO", "MISSING_SIGNATURE"].includes(json.error?.code)) {
        setGuardedVisit(visitId);
        return;
      }
      toast.error(json.error?.message ?? "Could not update visit");
      return;
    }
    toast.success(status === "completed" ? "Visit completed" : "Arrived on site");
    router.refresh();
  }

  async function markNeedsFollowUp(visitId: string) {
    setPending(visitId);
    const res = await fetch(`/api/v1/visits/${visitId}/sub-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sub_status: "reschedule_requested" }),
    });
    setPending(null);
    if (!res.ok) {
      toast.error("Could not mark visit for follow-up");
      return;
    }
    toast.success("Visit marked for reschedule");
    router.refresh();
  }

  return (
    <Card>
      <SectionHeader title="Today's Jobs" count={jobs.length} action={<LinkButton href="/app/jobs" variant="ghost" size="sm">View all</LinkButton>} />
      {jobs.length === 0 ? <EmptyState title="No jobs scheduled today" description="Scheduled visits for today appear here." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {jobs.map((job) => {
            const visitId = job.visit_id;
            const canArrive = visitId && job.visit_status === "scheduled";
            const canComplete = visitId && (job.visit_status === "arrived" || job.visit_status === "in_progress");
            return (
              <div key={job.id} style={{ padding: "var(--space-3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg-card)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <Link href={(visitId ? `/app/visits/${visitId}` : `/app/jobs/${job.id}`) as Route} style={{ color: "inherit", textDecoration: "none", fontWeight: 700 }}>{job.title}</Link>
                    <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: 4 }}>{fmtTime(job.scheduled_start)} · {job.client_name ?? "Client"}{job.property_address ? ` · ${job.property_address}` : ""}</div>
                  </div>
                  <StatusBadge variant={(job.visit_status ?? job.status) as StatusVariant}>{(job.visit_status ?? job.status).replaceAll("_", " ")}</StatusBadge>
                </div>
                {(canArrive || canComplete) && (
                  <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
                    {canArrive && <button type="button" className="p7-btn p7-btn-primary p7-btn-sm" disabled={pending === visitId} onClick={() => transition(visitId, "arrived")}>{pending === visitId ? "Updating..." : "Arrive"}</button>}
                    {canComplete && <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" disabled={pending === visitId} onClick={() => transition(visitId, "completed")}>{pending === visitId ? "Updating..." : "Complete"}</button>}
                  </div>
                )}
                {visitId && guardedVisit === visitId && (
                  <div style={{ marginTop: "var(--space-3)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-warning)", background: "#fffbeb", color: "#92400e" }}>
                    <strong>Need a photo/signature before closing.</strong>
                    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
                      <Link className="p7-btn p7-btn-secondary p7-btn-sm" href={`/app/visits/${visitId}#visit-completion` as Route}>Open checklist</Link>
                      <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" disabled={pending === visitId} onClick={() => markNeedsFollowUp(visitId)}>Mark incomplete / needs follow-up</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function Materials({ count, jobs }: { count: number; jobs: MaterialJob[] }) {
  return (
    <Card>
      <SectionHeader title="Materials" count={count} action={<LinkButton href="/app/expenses/new?mode=run" variant="primary" size="sm">Material Run</LinkButton>} />
      {jobs.length === 0 ? <EmptyState title="No staged material lists" description="Approved active estimates with materials appear here." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {jobs.map((job) => (
            <div key={job.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
              <span><strong>{job.title}</strong>{job.client_name ? <small style={{ color: "var(--fg-muted)", marginLeft: 8 }}>{job.client_name}</small> : null}</span>
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <LinkButton href={`/app/estimates/${job.id}/shopping-list` as Route} variant="ghost" size="sm">Shopping List</LinkButton>
                <LinkButton href={`/app/expenses/new?mode=run&job=${job.job_id}` as Route} variant="secondary" size="sm">Run</LinkButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
