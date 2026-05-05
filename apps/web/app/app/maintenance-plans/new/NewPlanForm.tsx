"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  LinkButton,
  Select,
} from "@/components/ui";
import {
  MEMBERSHIP_INCLUDED_LABOR_MINUTES_PER_VISIT,
  MEMBERSHIP_TIER_VISITS_PER_YEAR,
} from "@ai-fsm/domain";

interface Option {
  value: string;
  label: string;
}

export default function NewPlanForm({
  clientOptions,
  propertyOptions,
  frequencyOptions,
  publishedPricing = {},
}: {
  clientOptions: Option[];
  propertyOptions: Option[];
  frequencyOptions: Option[];
  publishedPricing?: Record<string, { annual: number; monthly: number }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState("plus");
  const [annualPrice, setAnnualPrice] = useState(() => {
    const pricing = publishedPricing["plus"];
    return pricing ? (pricing.annual / 100).toFixed(2) : "";
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const annualVisitCount = parseInt(formData.get("annual_visit_count") as string, 10);
    const annualPriceCents = Math.round(parseFloat(formData.get("annual_price") as string) * 100);

    const data = {
      client_id: formData.get("client_id") as string,
      property_id: (formData.get("property_id") as string) || null,
      name: formData.get("name") as string,
      membership_tier: formData.get("membership_tier") as string,
      frequency: formData.get("frequency") as string,
      services: (formData.get("services") as string)
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      price_cents: Math.round(annualPriceCents / Math.max(annualVisitCount, 1)),
      annual_visit_count: annualVisitCount,
      included_labor_minutes_per_visit: parseInt(formData.get("included_labor_minutes_per_visit") as string, 10),
      billing_cadence: formData.get("billing_cadence") as string,
      annual_price_cents: annualPriceCents,
      status: "active" as const,
      next_scheduled_date: formData.get("start_date") as string,
      renewal_date: (formData.get("renewal_date") as string) || null,
      routing_zone: formData.get("routing_zone") as string,
      notes: (formData.get("notes") as string) || null,
      membership_terms: (formData.get("membership_terms") as string) || null,
      member_priority: formData.get("member_priority") as string,
    };

    try {
      const res = await fetch("/api/v1/maintenance-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        router.push("/app/maintenance-plans" as unknown as Route);
      } else {
        const json = await res.json();
        setError(json.error?.message ?? "Failed to create plan.");
      }
    } catch {
      setError("Network error — could not create plan.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
    >
      <Select
        id="client_id"
        name="client_id"
        label="Client"
        options={clientOptions}
        required
        placeholder="Select a client"
      />

      <Select
        id="property_id"
        name="property_id"
        label="Property (optional)"
        options={propertyOptions}
      />

      <div className="p7-field">
        <label htmlFor="name" className="p7-label p7-label-required">Plan Name</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="p7-input"
          placeholder="e.g., Quarterly Home Maintenance"
        />
      </div>

      <div className="p7-form-grid p7-form-grid-2">
        <Select
          id="membership_tier"
          name="membership_tier"
          label="Membership Tier"
          value={selectedTier}
          onChange={(e) => {
            const tier = e.target.value;
            setSelectedTier(tier);
            const pricing = publishedPricing[tier];
            if (pricing) setAnnualPrice((pricing.annual / 100).toFixed(2));
          }}
          options={[
            { value: "essential", label: "Essential" },
            { value: "plus", label: "Plus" },
            { value: "premier", label: "Premier" },
          ]}
          required
        />
        <Select
          id="member_priority"
          name="member_priority"
          label="Member Priority"
          defaultValue="standard"
          options={[
            { value: "standard", label: "Standard" },
            { value: "priority", label: "Priority" },
            { value: "vip", label: "VIP" },
          ]}
          required
        />
      </div>

      <Select
        id="frequency"
        name="frequency"
        label="Frequency"
        options={frequencyOptions}
        defaultValue="biannual"
        required
      />

      <div className="p7-form-grid p7-form-grid-2">
        <div className="p7-field">
          <label htmlFor="annual_visit_count" className="p7-label p7-label-required">Visits Per Year</label>
          <input
            id="annual_visit_count"
            name="annual_visit_count"
            type="number"
            min="1"
            required
            className="p7-input"
            defaultValue={MEMBERSHIP_TIER_VISITS_PER_YEAR.plus}
          />
        </div>

        <div className="p7-field">
          <label htmlFor="included_labor_minutes_per_visit" className="p7-label p7-label-required">Included Labor Cap / Visit</label>
          <input
            id="included_labor_minutes_per_visit"
            name="included_labor_minutes_per_visit"
            type="number"
            min="0"
            required
            className="p7-input"
            defaultValue={MEMBERSHIP_INCLUDED_LABOR_MINUTES_PER_VISIT}
          />
        </div>
      </div>

      <div className="p7-field">
        <label htmlFor="services" className="p7-label">Services Included</label>
        <textarea
          id="services"
          name="services"
          className="p7-textarea"
          rows={4}
          placeholder="Enter each service on a new line&#10;e.g., Gutter cleaning&#10;HVAC filter replacement&#10;Smoke detector test"
        />
      </div>

      <div className="p7-field">
        <label htmlFor="annual_price" className="p7-label p7-label-required">Annual Price</label>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: "var(--space-3)", top: "50%", transform: "translateY(-50%)", color: "var(--fg-muted)" }}>$</span>
          <input
            id="annual_price"
            name="annual_price"
            type="number"
            step="0.01"
            min="0"
            required
            className="p7-input"
            style={{ paddingLeft: "var(--space-6)" }}
            placeholder="0.00"
            value={annualPrice}
            onChange={(e) => setAnnualPrice(e.target.value)}
          />
        </div>
        {publishedPricing[selectedTier] && (
          <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
            Pre-filled from published pricing for this tier
          </p>
        )}
      </div>

      <Select
        id="billing_cadence"
        name="billing_cadence"
        label="Billing Cadence"
        defaultValue="annual"
        options={[
          { value: "annual", label: "Annual" },
          { value: "monthly", label: "Monthly" },
        ]}
        required
      />

      <div className="p7-field">
        <label htmlFor="start_date" className="p7-label p7-label-required">Start Date</label>
        <input
          id="start_date"
          name="start_date"
          type="date"
          required
          className="p7-input"
        />
      </div>

      <div className="p7-field">
        <label htmlFor="renewal_date" className="p7-label">Renewal Date</label>
        <input
          id="renewal_date"
          name="renewal_date"
          type="date"
          className="p7-input"
        />
      </div>

      <Select
        id="routing_zone"
        name="routing_zone"
        label="Routing Zone"
        defaultValue="core"
        options={[
          { value: "core", label: "Core Zone" },
          { value: "extended", label: "Extended Zone" },
          { value: "out_of_area", label: "Out of Area" },
        ]}
        required
      />

      <div className="p7-field">
        <label htmlFor="notes" className="p7-label">Notes</label>
        <textarea
          id="notes"
          name="notes"
          className="p7-textarea"
          rows={3}
          placeholder="Any additional notes about this plan"
        />
      </div>

      <div className="p7-field">
        <label htmlFor="membership_terms" className="p7-label">Membership Terms</label>
        <textarea
          id="membership_terms"
          name="membership_terms"
          className="p7-textarea"
          rows={4}
          placeholder="Visible/accesssible areas only, non-invasive service, unused visits do not roll over, excluded trades/scopes..."
        />
      </div>

      {error && (
        <div style={{ color: "var(--color-red-600)", fontSize: "var(--text-sm)" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
        <LinkButton href="/app/maintenance-plans" variant="ghost" size="default">
          Cancel
        </LinkButton>
        <button type="submit" className="p7-btn p7-btn-primary p7-btn-md" disabled={pending}>
          {pending ? "Creating..." : "Create Plan"}
        </button>
      </div>
    </form>
  );
}
