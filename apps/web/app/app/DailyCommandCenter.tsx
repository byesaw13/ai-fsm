"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, EmptyState, LinkButton, Modal, SectionHeader, StatusBadge, useToast } from "@/components/ui";
import { NowBar, DayTimeSummary, type ActivityEntryDto } from "./ActivityTracker";
import type { StatusVariant } from "@/components/ui";
import type { DayMileageSummary } from "@/lib/mileage/sessions";

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

function fmtTime(iso: string | null): string {
  if (!iso) return "Today";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function accentForTone(tone: CountAction["tone"]): string {
  if (tone === "danger") return "var(--color-danger)";
  if (tone === "warning") return "var(--color-warning)";
  return "var(--accent)";
}

function ActionQueue({ items }: { items: CountAction[] }) {
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

function fmtOdo(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString();
}

const fieldStyle: React.CSSProperties = { minHeight: 44, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0 var(--space-3)", background: "var(--bg-card)" };
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--text-sm)", fontWeight: 600 };

// A pending vehicle selection awaiting explicit confirmation. Every path that
// commits a vehicle (start / switch / correct) routes through this so an
// accidental pick can never silently log miles against the wrong truck.
type VehicleConfirm = {
  title: string;
  vehicle: VehicleOption | null;
  lines: string[];
  warn: string | null;
  needsReason: boolean;
  confirmLabel: string;
  run: (reason: string | null) => Promise<void>;
};

// A vehicle has an open session from a prior day — we must capture its end
// odometer before the requested action can proceed (requirement 4).
type PriorPrompt = {
  openSessionId: string;
  suggestedEnd: number;
  retry: () => Promise<void>;
};

function CurrentVehiclePanel({ initialSession, vehicles }: { initialSession: OpenSession | null; vehicles: VehicleOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const [openSession, setOpenSession] = useState(initialSession);

  // Start form
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const [startOdometer, setStartOdometer] = useState(String(selectedVehicle?.current_odometer ?? ""));

  // Switch / correct forms
  const [mode, setMode] = useState<null | "switch" | "correct">(null);
  const [switchVehicleId, setSwitchVehicleId] = useState("");
  const [switchEnd, setSwitchEnd] = useState("");
  const [switchStart, setSwitchStart] = useState("");
  const [correctVehicleId, setCorrectVehicleId] = useState("");
  const [correctReason, setCorrectReason] = useState("");

  // Shared modals
  const [confirm, setConfirm] = useState<VehicleConfirm | null>(null);
  const [confirmReason, setConfirmReason] = useState("");
  const [prior, setPrior] = useState<PriorPrompt | null>(null);
  const [priorEnd, setPriorEnd] = useState("");
  const [pending, setPending] = useState(false);

  const activeVehicle = openSession ? vehicles.find((v) => v.id === openSession.vehicle_id) ?? null : null;

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
    const v = vehicles.find((x) => x.id === vId) ?? null;
    setOpenSession({ ...json.data, vehicle_nickname: v?.nickname ?? null, vehicle_plate: v?.plate ?? null });
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
        setOpenSession({ ...json.data, vehicle_nickname: newVehicle.nickname, vehicle_plate: newVehicle.plate });
        setMode(null);
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
        setOpenSession({ ...openSession, vehicle_id: correctVehicleId, vehicle_nickname: newVehicle.nickname, vehicle_plate: newVehicle.plate });
        setMode(null);
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

  return (
    <>
      {openSession ? (
        <Card padding="sm" style={{ borderLeft: "4px solid var(--color-success)", background: "var(--bg-subtle)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <span>
              <strong>Current vehicle: {openSession.vehicle_nickname ?? "No vehicle"}</strong>
              {openSession.vehicle_plate ? <small style={{ color: "var(--fg-muted)", marginLeft: 6 }}>({openSession.vehicle_plate})</small> : null}
              <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: 2 }}>
                Started at {fmtOdo(openSession.start_odometer)}
                {activeVehicle?.current_odometer != null ? ` · last known ${fmtOdo(activeVehicle.current_odometer)}` : ""}
              </div>
            </span>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" onClick={() => { setMode(mode === "switch" ? null : "switch"); setSwitchVehicleId(""); setSwitchEnd(""); setSwitchStart(""); }}>Switch vehicle</button>
              <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={() => { setMode(mode === "correct" ? null : "correct"); setCorrectVehicleId(""); setCorrectReason(""); }}>Change vehicle for this session</button>
            </div>
          </div>

          {mode === "switch" && (
            <div style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", alignItems: "end", marginTop: "var(--space-3)" }}>
              <label style={labelStyle}>
                End odometer ({activeVehicle?.nickname ?? "current"})
                <input value={switchEnd} onChange={(e) => setSwitchEnd(e.target.value)} inputMode="numeric" style={fieldStyle} />
              </label>
              <label style={labelStyle}>
                Switch to
                <select value={switchVehicleId} onChange={(e) => { const v = vehicles.find((x) => x.id === e.target.value); setSwitchVehicleId(e.target.value); setSwitchStart(String(v?.current_odometer ?? "")); }} style={fieldStyle}>
                  <option value="">Select vehicle</option>
                  {vehicles.filter((v) => v.id !== openSession.vehicle_id).map((v) => <option key={v.id} value={v.id}>{v.nickname}{v.plate ? ` (${v.plate})` : ""}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                New start odometer
                <input value={switchStart} onChange={(e) => setSwitchStart(e.target.value)} inputMode="numeric" style={fieldStyle} />
              </label>
              <button type="button" className="p7-btn p7-btn-primary p7-btn-sm" onClick={beginSwitch}>Review switch</button>
            </div>
          )}

          {mode === "correct" && (
            <div style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", alignItems: "end", marginTop: "var(--space-3)" }}>
              <label style={labelStyle}>
                Correct vehicle
                <select value={correctVehicleId} onChange={(e) => setCorrectVehicleId(e.target.value)} style={fieldStyle}>
                  <option value="">Select vehicle</option>
                  {vehicles.filter((v) => v.id !== openSession.vehicle_id).map((v) => <option key={v.id} value={v.id}>{v.nickname}{v.plate ? ` (${v.plate})` : ""}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Reason (optional)
                <input value={correctReason} onChange={(e) => setCorrectReason(e.target.value)} placeholder="Wrong vehicle selected" style={fieldStyle} />
              </label>
              <button type="button" className="p7-btn p7-btn-primary p7-btn-sm" onClick={beginCorrect}>Review change</button>
            </div>
          )}
        </Card>
      ) : (
        <Card
          style={{ border: "2px solid var(--accent)", boxShadow: "var(--shadow-md, 0 6px 20px rgba(15, 23, 42, 0.12))", minHeight: "48vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", gap: "var(--space-5)" }}
        >
          <div>
            <h2 style={{ fontSize: "var(--text-3xl, 1.875rem)", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Start your day</h2>
            <p style={{ color: "var(--fg-muted)", margin: "var(--space-2) 0 0", maxWidth: 440 }}>
              Pick your vehicle and starting mileage. You can switch vehicles any time without ending the day.
            </p>
          </div>
          <div style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", alignItems: "end", width: "100%", maxWidth: 520, textAlign: "left" }}>
            <label style={labelStyle}>
              Vehicle
              <select value={vehicleId} onChange={(e) => { const next = vehicles.find((v) => v.id === e.target.value); setVehicleId(e.target.value); setStartOdometer(String(next?.current_odometer ?? "")); }} style={{ ...fieldStyle, minHeight: 44 }}>
                <option value="">No vehicle</option>
                {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.nickname}{vehicle.plate ? ` (${vehicle.plate})` : ""}</option>)}
              </select>
              {selectedVehicle ? <small style={{ color: "var(--fg-muted)" }}>{selectedVehicle.plate ? `${selectedVehicle.plate} · ` : ""}last known {fmtOdo(selectedVehicle.current_odometer)}</small> : null}
            </label>
            <label style={labelStyle}>
              Start odometer
              <input value={startOdometer} onChange={(e) => setStartOdometer(e.target.value)} inputMode="numeric" style={fieldStyle} />
            </label>
          </div>
          <button type="button" onClick={beginStart} className="p7-btn p7-btn-primary" style={{ minHeight: 52, fontSize: "var(--text-base)", fontWeight: 700, padding: "0 var(--space-10)", width: "100%", maxWidth: 520 }}>
            Start Day
          </button>
        </Card>
      )}

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

function JobsToday({ jobs }: { jobs: CommandVisit[] }) {
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
    toast.success("Visit marked for follow-up");
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

function Materials({ count, jobs }: { count: number; jobs: MaterialJob[] }) {
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

function DayMileagePanel({ data }: { data: DayMileageSummary }) {
  if (data.completedSessions === 0 && data.openSessions === 0) return null;
  const plural = (n: number) => (n === 1 ? "" : "s");
  return (
    <div style={{ marginBottom: "var(--space-4)" }}>
      <SectionHeader title="Today's mileage" as="h3" />
      <div style={{ fontSize: "var(--text-sm)" }}>
        <strong>{data.totalMiles.toLocaleString()} mi</strong> across {data.completedSessions} completed session{plural(data.completedSessions)}
        {data.openSessions > 0 ? ` · ${data.openSessions} still open` : ""}
      </div>
      {data.perVehicle.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: "var(--space-2)" }}>
          {data.perVehicle.map((v) => (
            <div key={v.vehicle_id ?? "none"} style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              {v.nickname ?? "No vehicle"}{v.plate ? ` (${v.plate})` : ""} — {v.miles.toLocaleString()} mi · {v.sessions} session{plural(v.sessions)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EndDay({ session, warnings, tomorrow, activityEntries, dayMileage }: { session: OpenSession | null; warnings: EndWarnings; tomorrow: CommandVisit[]; activityEntries: ActivityEntryDto[]; dayMileage: DayMileageSummary }) {
  const router = useRouter();
  const toast = useToast();
  const [endOdometer, setEndOdometer] = useState("");
  const [pending, setPending] = useState(false);
  const activeWarnings = useMemo(() => [
    session ? "mileage session still open" : null,
    warnings.missingReceiptPhotos > 0 ? `${warnings.missingReceiptPhotos} receipt${warnings.missingReceiptPhotos === 1 ? "" : "s"} missing photos` : null,
    warnings.jobsInProgress > 0 ? `${warnings.jobsInProgress} job${warnings.jobsInProgress === 1 ? "" : "s"} still in progress` : null,
    warnings.draftInvoices > 0 ? `${warnings.draftInvoices} draft invoice${warnings.draftInvoices === 1 ? "" : "s"} needing action` : null,
    warnings.deposits > 0 ? `${warnings.deposits} deposit${warnings.deposits === 1 ? "" : "s"} needing action` : null,
  ].filter(Boolean) as string[], [session, warnings]);

  async function closeSession() {
    if (!session) return;
    const odometer = Number(endOdometer);
    if (!Number.isInteger(odometer) || odometer <= session.start_odometer) {
      toast.error("End odometer must be greater than start");
      return;
    }
    setPending(true);
    const res = await fetch(`/api/v1/sessions/${session.id}`, {
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
    toast.success("Day closed");
    router.refresh();
  }

  return (
    <Card>
      <SectionHeader title="End Day" count={activeWarnings.length} />
      <DayMileagePanel data={dayMileage} />
      <DayTimeSummary entries={activityEntries} />
      <div style={{ marginBottom: "var(--space-4)" }}>
        <Link href={"/app/timeline" as Route} style={{ color: "var(--accent)", fontSize: "var(--text-sm)", fontWeight: 600, textDecoration: "none" }}>
          Edit timeline →
        </Link>
      </div>
      {activeWarnings.length === 0 ? <EmptyState title="No loose ends" description="Close mileage when the day is done, then preview tomorrow." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
          {activeWarnings.map((warning) => <div key={warning} style={{ color: "#b91c1c", fontWeight: 700 }}>🔴 {warning}</div>)}
        </div>
      )}
      {session && (
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "end", marginBottom: "var(--space-4)" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--text-sm)", fontWeight: 600 }}>
            End odometer
            <input value={endOdometer} onChange={(e) => setEndOdometer(e.target.value)} inputMode="numeric" style={{ minHeight: 38, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0 var(--space-3)", background: "var(--bg-card)" }} />
          </label>
          <button type="button" className="p7-btn p7-btn-primary p7-btn-sm" disabled={pending} onClick={closeSession}>{pending ? "Closing..." : "Close mileage"}</button>
        </div>
      )}
      <SectionHeader title="Tomorrow" count={tomorrow.length} as="h3" />
      {tomorrow.length === 0 ? <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", margin: 0 }}>No visits scheduled tomorrow.</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {tomorrow.slice(0, 3).map((job) => <Link key={job.id} href={(job.visit_id ? `/app/visits/${job.visit_id}` : `/app/jobs/${job.id}`) as Route} style={{ color: "inherit", textDecoration: "none", fontSize: "var(--text-sm)" }}>{fmtTime(job.scheduled_start)} · {job.title}</Link>)}
        </div>
      )}
    </Card>
  );
}

export function DailyCommandCenter({
  todayLabel,
  openSession,
  vehicles,
  actionQueue,
  todayJobs,
  materialCount,
  materialJobs,
  warnings,
  tomorrowJobs,
  activityEntries,
  dayMileage,
}: {
  todayLabel: string;
  openSession: OpenSession | null;
  vehicles: VehicleOption[];
  actionQueue: CountAction[];
  todayJobs: CommandVisit[];
  materialCount: number;
  materialJobs: MaterialJob[];
  warnings: EndWarnings;
  tomorrowJobs: CommandVisit[];
  activityEntries: ActivityEntryDto[];
  dayMileage: DayMileageSummary;
}) {
  const activeEntry = activityEntries.find((e) => e.ended_at === null) ?? null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <CurrentVehiclePanel initialSession={openSession} vehicles={vehicles} />
      <NowBar active={activeEntry} />
      <ActionQueue items={actionQueue} />
      <JobsToday jobs={todayJobs} />
      <Materials count={materialCount} jobs={materialJobs} />
      <EndDay session={openSession} warnings={warnings} tomorrow={tomorrowJobs} activityEntries={activityEntries} dayMileage={dayMileage} />
      <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>{todayLabel}</p>
    </div>
  );
}
