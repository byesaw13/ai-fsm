"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { LinkButton, Select } from "@/components/ui";

interface EditPlanFormProps {
  id: string;
  initialName: string;
  initialFrequency: "monthly" | "quarterly" | "biannual" | "annual";
  initialServices: string[];
  initialPrice: string;
  initialStatus: "active" | "paused" | "cancelled";
  initialStartDate: string;
  initialNotes: string;
}

export default function EditPlanForm({
  id,
  initialName,
  initialFrequency,
  initialServices,
  initialPrice,
  initialStatus,
  initialStartDate,
  initialNotes,
}: EditPlanFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get("name") as string,
      frequency: formData.get("frequency") as string,
      services: (formData.get("services") as string)
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      price_cents: Math.round(parseFloat(formData.get("price") as string) * 100),
      status: formData.get("status") as string,
      next_scheduled_date: (formData.get("start_date") as string) || null,
      notes: (formData.get("notes") as string) || null,
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
        <label htmlFor="price" className="p7-label p7-label-required">Price (per visit)</label>
        <input
          id="price"
          name="price"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={initialPrice}
          className="p7-input"
        />
      </div>

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
        <label htmlFor="notes" className="p7-label">Notes</label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={initialNotes}
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
