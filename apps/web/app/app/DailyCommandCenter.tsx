"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, LinkButton, SectionHeader, StatusBadge, useToast } from "@/components/ui";
import type { StatusVariant } from "@/components/ui";

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
};

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

function StartDayCard({ initialSession, vehicles }: { initialSession: OpenSession | null; vehicles: VehicleOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const [openSession, setOpenSession] = useState(initialSession);
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const [startOdometer, setStartOdometer] = useState(String(selectedVehicle?.current_odometer ?? ""));
  const [pending, setPending] = useState(false);

  async function startDay() {
    const odometer = Number(startOdometer);
    if (!Number.isInteger(odometer) || odometer < 0) {
      toast.error("Enter a valid start odometer");
      return;
    }
    setPending(true);
    const res = await fetch("/api/v1/sessions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicle_id: vehicleId || null, start_odometer: odometer }),
    });
    const json = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      toast.error(json.error?.message ?? "Could not start day");
      return;
    }
    setOpenSession({ ...json.data, vehicle_nickname: selectedVehicle?.nickname ?? null, vehicle_plate: selectedVehicle?.plate ?? null });
    toast.success("Day started");
    router.refresh();
  }

  if (openSession) {
    return (
      <Card padding="sm" style={{ borderLeft: "4px solid var(--color-success)", background: "var(--bg-subtle)" }}>
        <strong>Day started</strong>
        <span style={{ color: "var(--fg-muted)", marginLeft: "var(--space-2)" }}>
          {openSession.vehicle_nickname ?? "Vehicle"} @ {openSession.start_odometer.toLocaleString()}
        </span>
      </Card>
    );
  }

  return (
    <Card style={{ border: "2px solid var(--accent)", boxShadow: "var(--shadow-md, 0 6px 20px rgba(15, 23, 42, 0.12))" }}>
      <SectionHeader title="Start Day" />
      <div style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", alignItems: "end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--text-sm)", fontWeight: 600 }}>
          Vehicle
          <select value={vehicleId} onChange={(e) => { const next = vehicles.find((v) => v.id === e.target.value); setVehicleId(e.target.value); setStartOdometer(String(next?.current_odometer ?? "")); }} style={{ minHeight: 40, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0 var(--space-3)", background: "var(--bg-card)" }}>
            <option value="">No vehicle</option>
            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.nickname}{vehicle.plate ? ` (${vehicle.plate})` : ""}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--text-sm)", fontWeight: 600 }}>
          Start odometer
          <input value={startOdometer} onChange={(e) => setStartOdometer(e.target.value)} inputMode="numeric" style={{ minHeight: 40, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0 var(--space-3)", background: "var(--bg-card)" }} />
        </label>
        <button type="button" onClick={startDay} disabled={pending} className="p7-btn p7-btn-primary" style={{ minHeight: 42 }}>{pending ? "Starting..." : "Start Day"}</button>
      </div>
    </Card>
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

function EndDay({ session, warnings, tomorrow }: { session: OpenSession | null; warnings: EndWarnings; tomorrow: CommandVisit[] }) {
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
      body: JSON.stringify({ end_odometer: odometer }),
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
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <StartDayCard initialSession={openSession} vehicles={vehicles} />
      <ActionQueue items={actionQueue} />
      <JobsToday jobs={todayJobs} />
      <Materials count={materialCount} jobs={materialJobs} />
      <EndDay session={openSession} warnings={warnings} tomorrow={tomorrowJobs} />
      <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>{todayLabel}</p>
    </div>
  );
}
