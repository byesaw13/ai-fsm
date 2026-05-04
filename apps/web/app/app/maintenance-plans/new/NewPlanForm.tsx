"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  LinkButton,
  Select,
} from "@/components/ui";

interface Option {
  value: string;
  label: string;
}

export default function NewPlanForm({
  clientOptions,
  propertyOptions,
  frequencyOptions,
}: {
  clientOptions: Option[];
  propertyOptions: Option[];
  frequencyOptions: Option[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    const data = {
      client_id: formData.get("client_id") as string,
      property_id: (formData.get("property_id") as string) || null,
      name: formData.get("name") as string,
      frequency: formData.get("frequency") as string,
      services: (formData.get("services") as string)
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      price_cents: Math.round(parseFloat(formData.get("price") as string) * 100),
      status: "active" as const,
      next_scheduled_date: formData.get("start_date") as string,
      notes: (formData.get("notes") as string) || null,
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
        label="Client"
        options={clientOptions}
        required
        placeholder="Select a client"
      />

      <Select
        id="property_id"
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

      <Select
        id="frequency"
        label="Frequency"
        options={frequencyOptions}
        required
      />

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
        <label htmlFor="price" className="p7-label p7-label-required">Price (per visit)</label>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: "var(--space-3)", top: "50%", transform: "translateY(-50%)", color: "var(--fg-muted)" }}>$</span>
          <input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0"
            required
            className="p7-input"
            style={{ paddingLeft: "var(--space-6)" }}
            placeholder="0.00"
          />
        </div>
      </div>

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
        <label htmlFor="notes" className="p7-label">Notes</label>
        <textarea
          id="notes"
          name="notes"
          className="p7-textarea"
          rows={3}
          placeholder="Any additional notes about this plan"
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
