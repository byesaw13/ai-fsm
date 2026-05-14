"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { LinkButton, Select } from "@/components/ui";

interface Template {
  id: string;
  name: string;
  tier: string;
  visit_count_per_year: number;
  included_labor_minutes_per_visit: number;
  base_price_cents: number;
}

interface Addon {
  id: string;
  name: string;
  description: string | null;
  annual_price_cents: number;
}

interface Subscription {
  id: string;
  name: string;
  frequency: string;
  billing_cadence: string;
  annual_price_cents: number;
  status: string;
  next_scheduled_date: string | null;
  renewal_date: string | null;
  routing_zone: string;
  member_priority: string;
  notes: string | null;
  membership_tier: string;
  annual_visit_count: number;
}

interface Props {
  id: string;
  subscription: Subscription;
  template: Template | null;
  allAddons: Addon[];
  currentAddonIds: string[];
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  essential: { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
  plus:      { bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe" },
  premier:   { bg: "#faf5ff", text: "#6b21a8", border: "#e9d5ff" },
};

function dollars(cents: number) {
  return (cents / 100).toFixed(0);
}

export function SubscriptionEditForm({ id, subscription, template, allAddons, currentAddonIds }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(new Set(currentAddonIds));
  const [frequency, setFrequency] = useState(subscription.frequency);
  const [billingCadence, setBillingCadence] = useState(subscription.billing_cadence);
  const [status, setStatus] = useState(subscription.status);
  const [nextScheduledDate, setNextScheduledDate] = useState(subscription.next_scheduled_date ?? "");
  const [renewalDate, setRenewalDate] = useState(subscription.renewal_date ?? "");
  const [routingZone, setRoutingZone] = useState(subscription.routing_zone);
  const [memberPriority, setMemberPriority] = useState(subscription.member_priority);
  const [notes, setNotes] = useState(subscription.notes ?? "");

  const selectedAddons = allAddons.filter((a) => selectedAddonIds.has(a.id));
  const addonTotal = selectedAddons.reduce((s, a) => s + a.annual_price_cents, 0);
  const basePrice = template?.base_price_cents ?? subscription.annual_price_cents;
  const totalAnnual = basePrice + addonTotal;

  function toggleAddon(addonId: string) {
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(addonId)) next.delete(addonId); else next.add(addonId);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      frequency,
      billing_cadence: billingCadence,
      status,
      next_scheduled_date: nextScheduledDate || null,
      renewal_date: renewalDate || null,
      routing_zone: routingZone,
      member_priority: memberPriority,
      notes: notes.trim() || null,
      annual_price_cents: totalAnnual,
      price_cents: template
        ? Math.round(totalAnnual / Math.max(template.visit_count_per_year, 1))
        : subscription.annual_price_cents,
      addon_ids: Array.from(selectedAddonIds),
    };

    try {
      const res = await fetch(`/api/v1/maintenance-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error?.message ?? "Failed to save changes");
        return;
      }
      router.push(`/app/maintenance-plans/${id}` as unknown as Route);
      router.refresh();
    } catch {
      setError("Network error — could not save changes");
    } finally {
      setSaving(false);
    }
  }

  const tier = template?.tier ?? subscription.membership_tier;
  const colors = TIER_COLORS[tier] ?? TIER_COLORS.plus;

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>

      {/* Template info — read only */}
      <div>
        <div className="p7-label" style={{ display: "block", marginBottom: "var(--space-2)" }}>Membership Template</div>
        {template ? (
          <div style={{
            background: colors.bg, border: `1px solid ${colors.border}`,
            borderRadius: "var(--radius-lg)", padding: "var(--space-4)",
            display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-4)",
          }}>
            <div>
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: colors.text }}>
                {template.tier}
              </span>
              <div style={{ fontWeight: 700, fontSize: "var(--font-size-base)", marginTop: 2 }}>{template.name}</div>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
                {template.visit_count_per_year} visit{template.visit_count_per_year !== 1 ? "s" : ""}/yr
                {" · "}
                {template.included_labor_minutes_per_visit} min labor cap/visit
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: "var(--font-size-lg)" }}>
                {template.base_price_cents > 0 ? `$${dollars(template.base_price_cents)}/yr` : "Price TBD"}
              </div>
              <Link
                href={`/app/maintenance-plans/templates/${template.id}/edit` as unknown as Route}
                style={{ fontSize: "var(--font-size-xs)", color: colors.text }}
              >
                Edit template →
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ padding: "var(--space-3)", background: "var(--color-surface-raised, #f9fafb)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
            No membership template linked — this membership was created before templates were introduced.
            Visit count: {subscription.annual_visit_count} · Tier: {subscription.membership_tier}
          </div>
        )}
      </div>

      {/* Add-ons */}
      {allAddons.length > 0 && (
        <div>
          <div className="p7-label" style={{ display: "block", marginBottom: "var(--space-2)" }}>
            Add-ons <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>(flat annual price each)</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {allAddons.map((a) => {
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
                    +${dollars(a.annual_price_cents)}/yr
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Pricing summary */}
      <div style={{ background: "var(--color-surface-raised, #f9fafb)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-4)" }}>
        <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>Pricing Summary</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-sm)", marginBottom: "var(--space-1)" }}>
          <span>{template?.name ?? "Base"}</span>
          <span>${dollars(basePrice)}/yr</span>
        </div>
        {selectedAddons.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-sm)", marginBottom: "var(--space-1)", color: "var(--color-text-secondary)" }}>
            <span>+ {a.name}</span>
            <span>${dollars(a.annual_price_cents)}/yr</span>
          </div>
        ))}
        <div style={{ borderTop: "1px solid var(--color-border)", marginTop: "var(--space-2)", paddingTop: "var(--space-2)", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "var(--font-size-base)" }}>
          <span>Total</span>
          <span>${dollars(totalAnnual)}/yr</span>
        </div>
      </div>

      {/* Operational fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          <Select
            id="status" name="status" label="Status"
            value={status} onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
              { value: "cancelled", label: "Cancelled" },
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
            <label htmlFor="next_scheduled_date" className="p7-label">Next Scheduled Date</label>
            <input id="next_scheduled_date" className="p7-input" type="date" value={nextScheduledDate} onChange={(e) => setNextScheduledDate(e.target.value)} />
          </div>
          <div className="p7-field">
            <label htmlFor="renewal_date" className="p7-label">Renewal Date</label>
            <input id="renewal_date" className="p7-input" type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} />
          </div>
        </div>

        <Select
          id="routing_zone" name="routing_zone" label="Routing Zone"
          value={routingZone} onChange={(e) => setRoutingZone(e.target.value)}
          options={[
            { value: "core", label: "Core Zone" },
            { value: "extended", label: "Extended Zone" },
            { value: "out_of_area", label: "Out of Area" },
          ]}
        />

        <div className="p7-field">
          <label htmlFor="notes" className="p7-label">Notes</label>
          <textarea id="notes" className="p7-textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes about this membership" />
        </div>
      </div>

      {error && (
        <div style={{ color: "var(--color-error, #dc2626)", fontSize: "var(--font-size-sm)" }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <LinkButton href={`/app/maintenance-plans/${id}` as unknown as Route} variant="ghost" size="default">Cancel</LinkButton>
        <button type="submit" className="p7-btn p7-btn-primary p7-btn-md" disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
