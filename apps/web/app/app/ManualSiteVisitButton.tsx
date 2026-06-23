"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";
import { VISIT_CLASSIFICATIONS, type VisitClassification } from "@ai-fsm/domain";

// EPIC-007 TASK-045: "I'm at customer site" — manually record a visit when GPS
// missed or the address is new. Posts a confirmed visit_candidate (ledger entry)
// and optionally learns the property's coordinates from the current GPS fix.

interface ClientResult { id: string; name: string }
interface PropertyResult { id: string; address: string }

const CLASSIFY: { value: Exclude<VisitClassification, "ignore">; label: string }[] = [
  { value: "job_work", label: "Job Work" },
  { value: "warranty_callback", label: "Warranty" },
  { value: "estimate_visit", label: "Estimate" },
  { value: "walkthrough", label: "Walkthrough" },
  { value: "material_drop", label: "Material" },
  { value: "realtor", label: "Realtor" },
];

export function ManualSiteVisitButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        📍 I&apos;m at customer site
      </Button>
      {open && <ManualSiteVisitModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ManualSiteVisitModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientResult[]>([]);
  const [client, setClient] = useState<ClientResult | null>(null);
  const [properties, setProperties] = useState<PropertyResult[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [classification, setClassification] = useState<Exclude<VisitClassification, "ignore">>("job_work");
  const [minutes, setMinutes] = useState(30);
  const [useGps, setUseGps] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Client search.
  useEffect(() => {
    const q = query.trim();
    if (!q || client) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/clients?q=${encodeURIComponent(q)}&limit=8`);
        const data = await res.json();
        setResults(data.data ?? []);
      } catch { setResults([]); }
    }, 200);
    return () => clearTimeout(t);
  }, [query, client]);

  const selectClient = useCallback(async (c: ClientResult) => {
    setClient(c);
    setResults([]);
    setQuery(c.name);
    try {
      const res = await fetch(`/api/v1/properties?client_id=${c.id}&limit=50`);
      const data = await res.json();
      const props: PropertyResult[] = (data.data ?? []).map((p: { id: string; address: string }) => ({ id: p.id, address: p.address }));
      setProperties(props);
      if (props.length === 1) setPropertyId(props[0].id);
    } catch { setProperties([]); }
  }, []);

  async function submit() {
    if (!client) { toast.error("Pick a customer first"); return; }
    setSubmitting(true);
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;
      if (useGps && propertyId && "geolocation" in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 }),
          );
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        } catch { /* GPS optional — proceed without */ }
      }
      const res = await fetch(`/api/v1/visit-candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: client.id,
          property_id: propertyId || null,
          classification,
          duration_minutes: minutes,
          latitude,
          longitude,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error?.message ?? "Could not record visit");
        return;
      }
      toast.success("Visit recorded");
      onClose();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "var(--space-3)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", padding: "var(--space-4)", width: "min(440px, 100%)", maxHeight: "90vh", overflow: "auto", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
      >
        <strong style={{ fontSize: "1rem" }}>I&apos;m at customer site</strong>

        {/* Customer */}
        <div style={{ position: "relative" }}>
          <input
            placeholder="Search customer…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setClient(null); setProperties([]); setPropertyId(""); }}
            style={{ width: "100%", padding: "var(--space-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}
          />
          {results.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", zIndex: 1, maxHeight: 180, overflow: "auto" }}>
              {results.map((c) => (
                <button key={c.id} type="button" onClick={() => selectClient(c)} style={{ display: "block", width: "100%", textAlign: "left", padding: "var(--space-2)", border: "none", background: "none", cursor: "pointer" }}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Property (optional) */}
        {client && properties.length > 0 && (
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} style={{ padding: "var(--space-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
            <option value="">No specific property</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}
          </select>
        )}

        {/* Classification */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
          {CLASSIFY.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setClassification(c.value)}
              style={{
                padding: "4px 10px", borderRadius: "var(--radius-md)", cursor: "pointer",
                border: `1px solid ${classification === c.value ? "var(--accent)" : "var(--border)"}`,
                background: classification === c.value ? "var(--accent)" : "transparent",
                color: classification === c.value ? "#fff" : "var(--fg)",
                fontSize: "var(--text-sm)",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
          Duration (min)
          <input type="number" min={1} max={720} value={minutes} onChange={(e) => setMinutes(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: 80, padding: "4px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }} />
        </label>

        {propertyId && (
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            <input type="checkbox" checked={useGps} onChange={(e) => setUseGps(e.target.checked)} />
            Save my current location as this property&apos;s pin
          </label>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button size="sm" variant="primary" onClick={submit} loading={submitting} disabled={!client}>Record visit</Button>
        </div>
      </div>
    </div>
  );
}
