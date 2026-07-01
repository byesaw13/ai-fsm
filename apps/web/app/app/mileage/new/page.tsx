"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Card, PageContainer, PageHeader, SectionHeader } from "@/components/ui";

interface Vehicle { id: string; nickname: string; plate: string | null; make: string | null; model: string | null; }

type EntityType = "job" | "visit" | "estimate" | "supplier_run" | "other";

interface Activity {
  key: string; // local identifier
  entity_type: EntityType;
  entity_id: string | null;
  label: string | null;
}

interface Suggestion {
  entity_type: EntityType;
  entity_id: string;
  label: string;
}

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  job:          "Project",
  visit:        "Visit / Walkthrough",
  estimate:     "Estimate",
  supplier_run: "Supplier Run",
  other:        "Other",
};

const SUPPLIER_LABELS = ["Home Depot", "Lowe's", "Ace Hardware", "Fastenal", "Lumber Yard", "Other supplier"];

let keyCounter = 0;
function nextKey() { return `a-${++keyCounter}`; }

export default function NewSessionPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [startOdometer, setStartOdometer] = useState("");
  const [endOdometer, setEndOdometer] = useState("");
  const [notes, setNotes] = useState("");

  const [activities, setActivities] = useState<Activity[]>([]);
  const [suggestions, setSuggestions] = useState<{ jobs: Suggestion[]; visits: Suggestion[]; estimates: Suggestion[] }>({ jobs: [], visits: [], estimates: [] });
  const [suggestLoading, setSuggestLoading] = useState(false);

  const [showManual, setShowManual] = useState(false);
  const [manualType, setManualType] = useState<EntityType>("supplier_run");
  const [manualLabel, setManualLabel] = useState("");

  const computedMiles = (() => {
    const s = parseInt(startOdometer, 10);
    const e = parseInt(endOdometer, 10);
    if (!isNaN(s) && !isNaN(e) && e > s) return e - s;
    return null;
  })();

  const isLinked = useCallback((entityId: string) =>
    activities.some(a => a.entity_id === entityId), [activities]);

  function toggleSuggestion(s: Suggestion) {
    if (isLinked(s.entity_id)) {
      setActivities(prev => prev.filter(a => a.entity_id !== s.entity_id));
    } else {
      setActivities(prev => [...prev, { key: nextKey(), entity_type: s.entity_type, entity_id: s.entity_id, label: s.label }]);
    }
  }

  function addManual() {
    if ((manualType === "supplier_run" || manualType === "other") && !manualLabel.trim()) return;
    setActivities(prev => [...prev, {
      key: nextKey(),
      entity_type: manualType,
      entity_id: null,
      label: manualLabel.trim() || null,
    }]);
    setManualLabel("");
    setShowManual(false);
  }

  function removeActivity(key: string) {
    setActivities(prev => prev.filter(a => a.key !== key));
  }

  useEffect(() => {
    fetch("/api/v1/vehicles").then(r => r.json()).then(d => {
      const vs: Vehicle[] = d.data ?? [];
      setVehicles(vs);
      if (vs.length === 1) setVehicleId(vs[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sessionDate) return;
    setSuggestLoading(true);
    fetch(`/api/v1/sessions/suggestions?date=${sessionDate}`)
      .then(r => r.json())
      .then(d => setSuggestions(d.data ?? { jobs: [], visits: [], estimates: [] }))
      .catch(() => {})
      .finally(() => setSuggestLoading(false));
  }, [sessionDate]);

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
      const res = await fetch("/api/v1/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_date:    sessionDate,
          vehicle_id:      vehicleId,
          start_odometer:  s,
          end_odometer:    en,
          notes:           notes.trim() || null,
          activities:      activities.map(({ entity_type, entity_id, label }) => ({ entity_type, entity_id, label })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? "Failed to save session"); return; }
      router.push("/app/mileage");
      router.refresh();
    } catch {
      setError("Unexpected error");
    } finally {
      setPending(false);
    }
  }

  const allSuggestions = [...suggestions.visits, ...suggestions.jobs, ...suggestions.estimates];
  const hasAnySuggestions = allSuggestions.length > 0;

  return (
    <PageContainer>
      <PageHeader
        title="Log Vehicle Session"
        backHref="/app/mileage"
        backLabel="Mileage"
      />

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", maxWidth: 640 }}>
        {error && <div className="p7-alert p7-alert-danger" role="alert">{error}</div>}

        {/* Vehicle */}
        <Card>
          <SectionHeader title="Vehicle" />
          {vehicles.length === 0 ? (
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              No vehicles yet.{" "}
              <Link href={"/app/mileage/vehicles" as Route} style={{ color: "var(--accent)" }}>Add a vehicle →</Link>
            </p>
          ) : (
            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
              {vehicles.map((v) => (
                <button
                  key={v.id} type="button" onClick={() => setVehicleId(v.id)}
                  style={{
                    padding: "var(--space-3) var(--space-4)",
                    border: vehicleId === v.id ? "2px solid var(--accent)" : "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    background: vehicleId === v.id ? "var(--accent-subtle, #eff6ff)" : "var(--surface)",
                    cursor: "pointer", textAlign: "left", minWidth: 160,
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

        {/* Date + Odometer */}
        <Card>
          <SectionHeader title="Date & Odometer" />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div>
              <label htmlFor="session-date" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>Date</label>
              <input
                id="session-date" className="p7-input" type="date"
                value={sessionDate} onChange={e => setSessionDate(e.target.value)}
                disabled={pending} style={{ maxWidth: 200 }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
              <div>
                <label htmlFor="start-odo" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>Start odometer</label>
                <input
                  id="start-odo" className="p7-input" type="number" min="0" step="1"
                  value={startOdometer} onChange={e => setStartOdometer(e.target.value)}
                  placeholder="e.g. 105000" disabled={pending}
                  style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}
                />
              </div>
              <div>
                <label htmlFor="end-odo" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>End odometer</label>
                <input
                  id="end-odo" className="p7-input" type="number" min="1" step="1"
                  value={endOdometer} onChange={e => setEndOdometer(e.target.value)}
                  placeholder="e.g. 105115" disabled={pending}
                  style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}
                />
              </div>
            </div>
            {computedMiles !== null && (
              <div style={{
                padding: "var(--space-2) var(--space-3)",
                background: "var(--status-success-bg, #f0fdf4)",
                border: "1px solid var(--status-success-border, #bbf7d0)",
                borderRadius: "var(--radius)",
                fontSize: "var(--text-sm)", fontWeight: 700,
                color: "var(--status-success, #166534)",
              }}>
                {computedMiles} miles
              </div>
            )}
          </div>
        </Card>

        {/* Activities */}
        <Card>
          <SectionHeader title="What happened during this session?" />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>

            {/* Linked so far */}
            {activities.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {activities.map(a => (
                  <span key={a.key} style={{
                    display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
                    padding: "var(--space-1) var(--space-2)",
                    background: "var(--accent-subtle, #eff6ff)", border: "1px solid var(--accent)",
                    borderRadius: 99, fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--accent)",
                  }}>
                    {ENTITY_TYPE_LABELS[a.entity_type]}{a.label ? `: ${a.label}` : ""}
                    <button
                      type="button" onClick={() => removeActivity(a.key)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", lineHeight: 1, padding: 0, fontSize: "var(--text-sm)" }}
                    >×</button>
                  </span>
                ))}
              </div>
            )}

            {/* Suggestions from today's work */}
            {hasAnySuggestions && !suggestLoading && (
              <div>
                <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Suggested from {sessionDate === new Date().toISOString().slice(0, 10) ? "today" : sessionDate}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                  {allSuggestions.map(s => {
                    const linked = isLinked(s.entity_id);
                    return (
                      <button
                        key={s.entity_id} type="button" onClick={() => toggleSuggestion(s)}
                        style={{
                          padding: "var(--space-1) var(--space-3)",
                          border: linked ? "2px solid var(--accent)" : "1px solid var(--border)",
                          borderRadius: 99, fontSize: "var(--text-sm)", cursor: "pointer",
                          background: linked ? "var(--accent-subtle, #eff6ff)" : "var(--surface)",
                          color: linked ? "var(--accent)" : "var(--fg)",
                          fontWeight: linked ? 600 : 400,
                        }}
                      >
                        {linked ? "✓ " : ""}{ENTITY_TYPE_LABELS[s.entity_type]}: {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {suggestLoading && (
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Loading suggestions…</p>
            )}

            {/* Manual add */}
            {showManual ? (
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
                <div>
                  <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, marginBottom: "var(--space-1)" }}>Type</label>
                  <select className="p7-select" value={manualType} onChange={e => { setManualType(e.target.value as EntityType); setManualLabel(""); }} style={{ minWidth: 160 }}>
                    {(Object.keys(ENTITY_TYPE_LABELS) as EntityType[]).map(t => (
                      <option key={t} value={t}>{ENTITY_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                {(manualType === "supplier_run" || manualType === "other") && (
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, marginBottom: "var(--space-1)" }}>Label</label>
                    {manualType === "supplier_run" ? (
                      <select className="p7-select" value={manualLabel} onChange={e => setManualLabel(e.target.value)} style={{ width: "100%" }}>
                        <option value="">Select store…</option>
                        {SUPPLIER_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    ) : (
                      <input className="p7-input" value={manualLabel} onChange={e => setManualLabel(e.target.value)} placeholder="Describe the activity" style={{ width: "100%" }} />
                    )}
                  </div>
                )}
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <button type="button" className="p7-btn p7-btn-primary" style={{ fontSize: "var(--text-sm)" }} onClick={addManual}>Add</button>
                  <button type="button" className="p7-btn p7-btn-ghost" style={{ fontSize: "var(--text-sm)" }} onClick={() => setShowManual(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" className="p7-btn p7-btn-ghost" style={{ alignSelf: "flex-start", fontSize: "var(--text-sm)" }} onClick={() => setShowManual(true)}>
                + Add activity
              </button>
            )}
          </div>
        </Card>

        {/* Notes */}
        <Card>
          <SectionHeader title="Notes" />
          <input
            className="p7-input" type="text"
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Anything worth remembering about this outing"
            disabled={pending} maxLength={2000}
          />
        </Card>

        <div className="p7-form-actions">
          <button type="submit" className="p7-btn p7-btn-primary" disabled={pending || !vehicleId || computedMiles === null}>
            {pending ? "Saving…" : `Save session${computedMiles !== null ? ` · ${computedMiles} mi` : ""}`}
          </button>
          <Link href={"/app/mileage" as Route} className="p7-btn p7-btn-ghost">Cancel</Link>
        </div>
      </form>
    </PageContainer>
  );
}
