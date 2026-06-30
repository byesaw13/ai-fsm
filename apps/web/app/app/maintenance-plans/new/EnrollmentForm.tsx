"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { LinkButton, Select } from "@/components/ui";
import { formatCentsShort } from "@ai-fsm/money";

interface Template {
  id: string;
  name: string;
  tier: string;
  description: string | null;
  visit_count_per_year: number;
  included_labor_minutes_per_visit: number;
  base_price_cents: number;
  included_features: string[];
}

interface Addon {
  id: string;
  name: string;
  description: string | null;
  annual_price_cents: number;
}

interface Option { value: string; label: string; }

interface Props {
  clientOptions: Option[];
  propertyOptions: Option[];
  templates: Template[];
  addons: Addon[];
  defaultClientId?: string;
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string; selectedBg: string }> = {
  essential: { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0", selectedBg: "#dcfce7" },
  plus:      { bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe", selectedBg: "#dbeafe" },
  premier:   { bg: "#faf5ff", text: "#6b21a8", border: "#e9d5ff", selectedBg: "#f3e8ff" },
};

export function EnrollmentForm({ clientOptions, propertyOptions, templates, addons, defaultClientId }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? "");
  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(new Set());
  const [clientId, setClientId] = useState(defaultClientId ?? clientOptions[0]?.value ?? "");
  const [propertyId, setPropertyId] = useState("");
  const [frequency, setFrequency] = useState("biannual");
  const [billingCadence, setBillingCadence] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [routingZone, setRoutingZone] = useState("core");
  const [memberPriority, setMemberPriority] = useState("standard");
  const [notes, setNotes] = useState("");

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const selectedAddons = addons.filter((a) => selectedAddonIds.has(a.id));
  const addonTotal = selectedAddons.reduce((sum, a) => sum + a.annual_price_cents, 0);
  const totalAnnual = (selectedTemplate?.base_price_cents ?? 0) + addonTotal;

  function toggleAddon(id: string) {
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTemplate) { setError("Select a plan template"); return; }
    setSaving(true);
    setError(null);

    const clientName = clientOptions.find((c) => c.value === clientId)?.label ?? "";
    const payload = {
      client_id: clientId,
      property_id: propertyId || null,
      name: `${selectedTemplate.name} — ${clientName}`,
      plan_template_id: selectedTemplate.id,
      membership_tier: selectedTemplate.tier,
      frequency,
      services: selectedTemplate.included_features,
      annual_visit_count: selectedTemplate.visit_count_per_year,
      included_labor_minutes_per_visit: selectedTemplate.included_labor_minutes_per_visit,
      price_cents: selectedTemplate.visit_count_per_year > 0
        ? Math.round(totalAnnual / selectedTemplate.visit_count_per_year)
        : 0,
      billing_cadence: billingCadence,
      annual_price_cents: totalAnnual,
      status: "active",
      next_scheduled_date: startDate || null,
      renewal_date: renewalDate || null,
      routing_zone: routingZone,
      notes: notes.trim() || null,
      member_priority: memberPriority,
      addon_ids: Array.from(selectedAddonIds),
    };

    try {
      const res = await fetch("/api/v1/maintenance-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.push("/app/maintenance-plans" as unknown as Route);
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error?.message ?? "Failed to enroll client");
      }
    } catch {
      setError("Network error — could not save enrollment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>

      {/* Step 1: Choose template */}
      <div>
        <div className="p7-label" style={{ marginBottom: "var(--space-3)", display: "block" }}>
          1. Select Membership Template
        </div>
        {templates.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>
            No active membership templates. <Link href="/app/maintenance-plans/templates" style={{ color: "var(--color-primary)" }}>Create one first →</Link>
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--space-3)" }}>
            {templates.map((t) => {
              const colors = TIER_COLORS[t.tier] ?? TIER_COLORS.plus;
              const selected = t.id === selectedTemplateId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(t.id)}
                  style={{
                    textAlign: "left",
                    padding: "var(--space-4)",
                    border: `2px solid ${selected ? colors.text : colors.border}`,
                    borderRadius: "var(--radius-lg)",
                    background: selected ? colors.selectedBg : colors.bg,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: colors.text, marginBottom: 4 }}>
                    {t.tier}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: "var(--font-size-base)", marginBottom: "var(--space-1)" }}>{t.name}</div>
                  <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: "var(--space-2)" }}>
                    {t.visit_count_per_year} visit{t.visit_count_per_year !== 1 ? "s" : ""}/yr · {t.included_labor_minutes_per_visit} min cap
                  </div>
                  <div style={{ fontWeight: 700, fontSize: "var(--font-size-lg)", color: colors.text }}>
                    {t.base_price_cents > 0 ? `${formatCentsShort(t.base_price_cents)}/yr` : "Price TBD"}
                  </div>
                  {t.included_features.slice(0, 3).map((f, i) => (
                    <div key={i} style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 2 }}>✓ {f}</div>
                  ))}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Step 2: Add-ons */}
      {addons.length > 0 && (
        <div>
          <div className="p7-label" style={{ marginBottom: "var(--space-3)", display: "block" }}>
            2. Add-ons <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>(optional — flat annual price each)</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {addons.map((a) => {
              const checked = selectedAddonIds.has(a.id);
              return (
                <label
                  key={a.id}
                  style={{
                    display: "flex", alignItems: "center", gap: "var(--space-3)",
                    padding: "var(--space-3)", borderRadius: "var(--radius-md)",
                    border: `1px solid ${checked ? "var(--color-primary)" : "var(--color-border)"}`,
                    background: checked ? "var(--color-primary-subtle, #eff6ff)" : "var(--color-surface)",
                    cursor: "pointer",
                  }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleAddon(a.id)} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>{a.name}</span>
                    {a.description && (
                      <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginLeft: "var(--space-2)" }}>{a.description}</span>
                    )}
                  </div>
                  <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, flexShrink: 0 }}>
                    +{formatCentsShort(a.annual_price_cents)}/yr
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Pricing summary */}
      {selectedTemplate && (
        <div style={{ background: "var(--color-surface-raised, #f9fafb)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-4)" }}>
          <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>Pricing Summary</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-sm)", marginBottom: "var(--space-1)" }}>
            <span>{selectedTemplate.name} (base)</span>
            <span>{formatCentsShort(selectedTemplate.base_price_cents)}/yr</span>
          </div>
          {selectedAddons.map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-sm)", marginBottom: "var(--space-1)", color: "var(--color-text-secondary)" }}>
              <span>+ {a.name}</span>
              <span>{formatCentsShort(a.annual_price_cents)}/yr</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--color-border)", marginTop: "var(--space-2)", paddingTop: "var(--space-2)", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "var(--font-size-base)" }}>
            <span>Total</span>
            <span>{formatCentsShort(totalAnnual)}/yr</span>
          </div>
        </div>
      )}

      {/* Step 3: Client & Details */}
      <div>
        <div className="p7-label" style={{ marginBottom: "var(--space-3)", display: "block" }}>
          {addons.length > 0 ? "3." : "2."} Client & Details
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <Select id="client_id" name="client_id" label="Client" options={clientOptions} required value={clientId} onChange={(e) => setClientId(e.target.value)} />
          <Select id="property_id" name="property_id" label="Property (optional)" options={propertyOptions} value={propertyId} onChange={(e) => setPropertyId(e.target.value)} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
            <Select
              id="frequency" name="frequency" label="Visit Frequency"
              value={frequency} onChange={(e) => setFrequency(e.target.value)}
              options={[
                { value: "monthly", label: "Monthly" },
                { value: "quarterly", label: "Quarterly" },
                { value: "biannual", label: "Bi-annual" },
                { value: "annual", label: "Annual" },
              ]}
            />
            <Select
              id="billing_cadence" name="billing_cadence" label="Billing Cadence"
              value={billingCadence} onChange={(e) => setBillingCadence(e.target.value)}
              options={[
                { value: "annual", label: "Annual" },
                { value: "monthly", label: "Monthly" },
              ]}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
            <div className="p7-field">
              <label htmlFor="start_date" className="p7-label">Start Date</label>
              <input id="start_date" className="p7-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="p7-field">
              <label htmlFor="renewal_date" className="p7-label">Renewal Date</label>
              <input id="renewal_date" className="p7-input" type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
            <Select
              id="routing_zone" name="routing_zone" label="Routing Zone"
              value={routingZone} onChange={(e) => setRoutingZone(e.target.value)}
              options={[
                { value: "core", label: "Core Zone" },
                { value: "extended", label: "Extended Zone" },
                { value: "out_of_area", label: "Out of Area" },
              ]}
            />
            <Select
              id="member_priority" name="member_priority" label="Member Priority"
              value={memberPriority} onChange={(e) => setMemberPriority(e.target.value)}
              options={[
                { value: "standard", label: "Standard" },
                { value: "priority", label: "Priority" },
                { value: "vip", label: "VIP" },
              ]}
            />
          </div>

          <div className="p7-field">
            <label htmlFor="notes" className="p7-label">Notes</label>
            <textarea id="notes" className="p7-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes about this enrollment" />
          </div>
        </div>
      </div>

      {error && (
        <div style={{ color: "var(--color-error, #dc2626)", fontSize: "var(--font-size-sm)" }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <LinkButton href="/app/maintenance-plans" variant="ghost" size="default">Cancel</LinkButton>
        <button type="submit" className="p7-btn p7-btn-primary p7-btn-md" disabled={saving || !selectedTemplateId}>
          {saving ? "Enrolling…" : "Enroll Client"}
        </button>
      </div>
    </form>
  );
}
