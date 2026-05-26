"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Card, SectionHeader } from "@/components/ui";

const TRIP_TYPE_LABELS: Record<string, string> = {
  job:              "Job",
  estimate:         "Estimate",
  walkthrough:      "Walkthrough",
  material_pickup:  "Material Pickup",
  personal:         "Personal",
  mixed:            "Mixed Day",
};

interface Vehicle { id: string; nickname: string; plate: string | null; make: string | null; model: string | null; }
interface Job      { id: string; title: string; }
interface Visit    { id: string; title: string | null; scheduled_start: string | null; }
interface Estimate { id: string; id_short: string; client_name: string | null; }

export default function NewMileagePage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const [vehicles, setVehicles]   = useState<Vehicle[]>([]);
  const [jobs, setJobs]           = useState<Job[]>([]);
  const [visits, setVisits]       = useState<Visit[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);

  const [vehicleId,      setVehicleId]      = useState("");
  const [startOdometer,  setStartOdometer]  = useState("");
  const [endOdometer,    setEndOdometer]    = useState("");
  const [tripType,       setTripType]       = useState("job");
  const [tripDate,       setTripDate]       = useState(new Date().toISOString().slice(0, 10));
  const [jobId,          setJobId]          = useState("");
  const [visitId,        setVisitId]        = useState("");
  const [estimateId,     setEstimateId]     = useState("");
  const [notes,          setNotes]          = useState("");

  const computedMiles = (() => {
    const s = parseInt(startOdometer, 10);
    const e = parseInt(endOdometer, 10);
    if (!isNaN(s) && !isNaN(e) && e > s) return e - s;
    return null;
  })();

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/vehicles").then(r => r.json()).catch(() => ({ data: [] })),
      fetch("/api/v1/jobs?limit=200&status=scheduled,in_progress,completed").then(r => r.json()).catch(() => ({ data: [] })),
      fetch("/api/v1/visits?limit=100").then(r => r.json()).catch(() => ({ data: [] })),
      fetch("/api/v1/estimates?limit=100&status=draft,sent,approved").then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([v, j, vis, est]) => {
      setVehicles(v.data ?? []);
      setJobs(j.data ?? []);
      setVisits(vis.data ?? []);
      setEstimates(est.data ?? []);
      if ((v.data ?? []).length === 1) setVehicleId(v.data[0].id);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const s = parseInt(startOdometer, 10);
    const en = parseInt(endOdometer, 10);
    if (isNaN(s) || isNaN(en)) { setError("Enter start and end odometer readings"); return; }
    if (en <= s) { setError("End odometer must be greater than start"); return; }
    if (!vehicleId) { setError("Select a vehicle"); return; }
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/v1/mileage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_date:      tripDate,
          vehicle_id:     vehicleId,
          start_odometer: s,
          end_odometer:   en,
          trip_type:      tripType,
          notes:          notes.trim() || null,
          job_id:         jobId      || null,
          visit_id:       visitId    || null,
          estimate_id:    estimateId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? "Failed to log trip"); return; }
      router.push("/app/mileage");
      router.refresh();
    } catch {
      setError("Unexpected error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <Link href={"/app/mileage" as Route} className="back-link">← Mileage</Link>
          <h1 className="page-title">Log Trip</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", maxWidth: 640 }}>
        {error && <div className="p7-alert p7-alert-danger" role="alert">{error}</div>}

        {/* Vehicle picker */}
        <Card>
          <SectionHeader title="Vehicle" />
          {vehicles.length === 0 ? (
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              No vehicles set up yet.{" "}
              <Link href={"/app/mileage/vehicles" as Route} style={{ color: "var(--accent)" }}>Add a vehicle →</Link>
            </p>
          ) : (
            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
              {vehicles.filter(v => v).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVehicleId(v.id)}
                  style={{
                    padding: "var(--space-3) var(--space-4)",
                    border: vehicleId === v.id ? "2px solid var(--accent)" : "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    background: vehicleId === v.id ? "var(--accent-subtle, #eff6ff)" : "var(--surface)",
                    cursor: "pointer",
                    textAlign: "left",
                    minWidth: 160,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{v.nickname}</div>
                  {v.make && <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{[v.make, v.model].filter(Boolean).join(" ")}</div>}
                  {v.plate && <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontFamily: "monospace", letterSpacing: 1 }}>{v.plate}</div>}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Odometer readings */}
        <Card>
          <SectionHeader title="Odometer" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", alignItems: "start" }}>
            <div>
              <label htmlFor="start-odo" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>Start</label>
              <input
                id="start-odo"
                className="p7-input"
                type="number"
                min="0"
                step="1"
                value={startOdometer}
                onChange={e => setStartOdometer(e.target.value)}
                placeholder="e.g. 105000"
                disabled={pending}
                style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}
              />
            </div>
            <div>
              <label htmlFor="end-odo" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>End</label>
              <input
                id="end-odo"
                className="p7-input"
                type="number"
                min="1"
                step="1"
                value={endOdometer}
                onChange={e => setEndOdometer(e.target.value)}
                placeholder="e.g. 105115"
                disabled={pending}
                style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}
              />
            </div>
          </div>
          {computedMiles !== null && (
            <div style={{
              marginTop: "var(--space-3)",
              padding: "var(--space-2) var(--space-3)",
              background: "var(--status-success-bg, #f0fdf4)",
              border: "1px solid var(--status-success-border, #bbf7d0)",
              borderRadius: "var(--radius)",
              fontSize: "var(--text-sm)",
              fontWeight: 700,
              color: "var(--status-success, #166534)",
            }}>
              {computedMiles} miles
            </div>
          )}
        </Card>

        {/* Trip type */}
        <Card>
          <SectionHeader title="Trip Type" />
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {Object.entries(TRIP_TYPE_LABELS).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setTripType(val)}
                style={{
                  padding: "var(--space-1) var(--space-3)",
                  border: tripType === val ? "2px solid var(--accent)" : "1px solid var(--border)",
                  borderRadius: 99,
                  background: tripType === val ? "var(--accent)" : "transparent",
                  color: tripType === val ? "#fff" : "var(--fg)",
                  fontSize: "var(--text-sm)",
                  fontWeight: tripType === val ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Card>

        {/* Date + optional links */}
        <Card>
          <SectionHeader title="Details" />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div>
              <label htmlFor="trip-date" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>Date</label>
              <input
                id="trip-date"
                className="p7-input"
                type="date"
                value={tripDate}
                onChange={e => setTripDate(e.target.value)}
                disabled={pending}
                style={{ maxWidth: 200 }}
              />
            </div>

            {(tripType === "job" || tripType === "mixed") && jobs.length > 0 && (
              <div>
                <label htmlFor="trip-job" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>Job (optional)</label>
                <select id="trip-job" className="p7-select" value={jobId} onChange={e => setJobId(e.target.value)} disabled={pending}>
                  <option value="">None</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
            )}

            {(tripType === "walkthrough" || tripType === "mixed") && visits.length > 0 && (
              <div>
                <label htmlFor="trip-visit" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>Visit (optional)</label>
                <select id="trip-visit" className="p7-select" value={visitId} onChange={e => setVisitId(e.target.value)} disabled={pending}>
                  <option value="">None</option>
                  {visits.map(v => <option key={v.id} value={v.id}>{v.title ?? v.id.slice(0, 8)}</option>)}
                </select>
              </div>
            )}

            {tripType === "estimate" && estimates.length > 0 && (
              <div>
                <label htmlFor="trip-estimate" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>Estimate (optional)</label>
                <select id="trip-estimate" className="p7-select" value={estimateId} onChange={e => setEstimateId(e.target.value)} disabled={pending}>
                  <option value="">None</option>
                  {estimates.map(est => <option key={est.id} value={est.id}>{est.client_name ?? est.id_short}</option>)}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="trip-notes" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>Notes (optional)</label>
              <input
                id="trip-notes"
                className="p7-input"
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any additional details"
                disabled={pending}
                maxLength={1000}
              />
            </div>
          </div>
        </Card>

        <div className="p7-form-actions">
          <button type="submit" className="p7-btn p7-btn-primary" disabled={pending || !vehicleId || computedMiles === null}>
            {pending ? "Logging…" : `Log ${computedMiles !== null ? `${computedMiles} miles` : "Trip"}`}
          </button>
          <Link href={"/app/mileage" as Route} className="p7-btn p7-btn-ghost">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
