"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { LinkButton, Select } from "@/components/ui";

interface EditPlanFormProps {
  id: string;
  initialName: string;
  initialMembershipTier: "essential" | "plus" | "premier";
  initialFrequency: "monthly" | "quarterly" | "biannual" | "annual";
  initialServices: string[];
  initialAnnualVisitCount: number;
  initialIncludedLaborMinutes: number;
  initialAnnualPrice: string;
  initialBillingCadence: "annual" | "monthly";
  initialStatus: "active" | "paused" | "cancelled";
  initialStartDate: string;
  initialRenewalDate: string;
  initialRoutingZone: "core" | "extended" | "out_of_area";
  initialNotes: string;
  initialMembershipTerms: string;
  initialMemberPriority: "standard" | "priority" | "vip";
}

export default function EditPlanForm({
  id,
  initialName,
  initialMembershipTier,
  initialFrequency,
  initialServices,
  initialAnnualVisitCount,
  initialIncludedLaborMinutes,
  initialAnnualPrice,
  initialBillingCadence,
  initialStatus,
  initialStartDate,
  initialRenewalDate,
  initialRoutingZone,
  initialNotes,
  initialMembershipTerms,
  initialMemberPriority,
}: EditPlanFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const annualVisitCount = parseInt(formData.get("annual_visit_count") as string, 10);
    const annualPriceCents = Math.round(parseFloat(formData.get("annual_price") as string) * 100);
    const payload = {
      name: formData.get("name") as string,
      membership_tier: formData.get("membership_tier") as string,
      frequency: formData.get("frequency") as string,
      services: (formData.get("services") as string)
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      price_cents: Math.round(annualPriceCents / Math.max(annualVisitCount, 1)),
      annual_visit_count: annualVisitCount,
      included_labor_minutes_per_visit: parseInt(formData.get("included_labor_minutes_per_visit") as string, 10),
      billing_cadence: formData.get("billing_cadence") as string,
      annual_price_cents: annualPriceCents,
      status: formData.get("status") as string,
      next_scheduled_date: (formData.get("start_date") as string) || null,
      renewal_date: (formData.get("renewal_date") as string) || null,
      routing_zone: formData.get("routing_zone") as string,
      notes: (formData.get("notes") as string) || null,
      membership_terms: (formData.get("membership_terms") as string) || null,
      member_priority: formData.get("member_priority") as string,
    };

    try {
      const response = await fetch(`/api/v1/maintenance-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        setError(json?.error?.message ?? "Failed to update plan.");
        return;
      }

      router.push(`/app/maintenance-plans/${id}` as unknown as Route);
      router.refresh();
    } catch {
      setError("Network error — could not update plan.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div className="p7-field">
        <label htmlFor="name" className="p7-label p7-label-required">Plan Name</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={initialName}
          className="p7-input"
        />
      </div>

      <div className="p7-form-grid p7-form-grid-2">
        <Select
          id="membership_tier"
          name="membership_tier"
          label="Membership Tier"
          defaultValue={initialMembershipTier}
          required
          options={[
            { value: "essential", label: "Essential" },
            { value: "plus", label: "Plus" },
            { value: "premier", label: "Premier" },
          ]}
        />
        <Select
          id="member_priority"
          name="member_priority"
          label="Member Priority"
          defaultValue={initialMemberPriority}
          required
          options={[
            { value: "standard", label: "Standard" },
            { value: "priority", label: "Priority" },
            { value: "vip", label: "VIP" },
          ]}
        />
      </div>

      <Select
        id="frequency"
        name="frequency"
        label="Frequency"
        defaultValue={initialFrequency}
        required
        options={[
          { value: "monthly", label: "Monthly" },
          { value: "quarterly", label: "Quarterly" },
          { value: "biannual", label: "Bi-annual" },
          { value: "annual", label: "Annual" },
        ]}
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
            defaultValue={initialAnnualVisitCount}
            className="p7-input"
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
            defaultValue={initialIncludedLaborMinutes}
            className="p7-input"
          />
        </div>
      </div>

      <div className="p7-field">
        <label htmlFor="services" className="p7-label">Services Included</label>
        <textarea
          id="services"
          name="services"
          rows={5}
          defaultValue={initialServices.join("\n")}
          className="p7-textarea"
        />
      </div>

      <div className="p7-field">
        <label htmlFor="annual_price" className="p7-label p7-label-required">Annual Price</label>
        <input
          id="annual_price"
          name="annual_price"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={initialAnnualPrice}
          className="p7-input"
        />
      </div>

      <Select
        id="billing_cadence"
        name="billing_cadence"
        label="Billing Cadence"
        defaultValue={initialBillingCadence}
        required
        options={[
          { value: "annual", label: "Annual" },
          { value: "monthly", label: "Monthly" },
        ]}
      />

      <Select
        id="status"
        name="status"
        label="Status"
        defaultValue={initialStatus}
        required
        options={[
          { value: "active", label: "Active" },
          { value: "paused", label: "Paused" },
          { value: "cancelled", label: "Cancelled" },
        ]}
      />

      <div className="p7-field">
        <label htmlFor="start_date" className="p7-label">Next Scheduled Date</label>
        <input
          id="start_date"
          name="start_date"
          type="date"
          defaultValue={initialStartDate}
          className="p7-input"
        />
      </div>

      <div className="p7-field">
        <label htmlFor="renewal_date" className="p7-label">Renewal Date</label>
        <input
          id="renewal_date"
          name="renewal_date"
          type="date"
          defaultValue={initialRenewalDate}
          className="p7-input"
        />
      </div>

      <Select
        id="routing_zone"
        name="routing_zone"
        label="Routing Zone"
        defaultValue={initialRoutingZone}
        required
        options={[
          { value: "core", label: "Core Zone" },
          { value: "extended", label: "Extended Zone" },
          { value: "out_of_area", label: "Out of Area" },
        ]}
      />

      <div className="p7-field">
        <label htmlFor="notes" className="p7-label">Notes</label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={initialNotes}
          className="p7-textarea"
        />
      </div>

      <div className="p7-field">
        <label htmlFor="membership_terms" className="p7-label">Membership Terms</label>
        <textarea
          id="membership_terms"
          name="membership_terms"
          rows={4}
          defaultValue={initialMembershipTerms}
          className="p7-textarea"
        />
      </div>

      {error && (
        <div style={{ color: "var(--color-red-600)", fontSize: "var(--text-sm)" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <LinkButton href={`/app/maintenance-plans/${id}` as unknown as Route} variant="ghost" size="default">
          Cancel
        </LinkButton>
        <button type="submit" className="p7-btn p7-btn-primary p7-btn-md" disabled={pending}>
          {pending ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
