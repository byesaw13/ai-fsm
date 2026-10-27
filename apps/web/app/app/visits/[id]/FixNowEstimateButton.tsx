"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import { PersonHoursFields } from "@/app/app/estimates/components/PersonHoursFields";
import { formHourColumns } from "@/lib/estimates/stored-hours";

interface Props {
  label: string;
  note: string | null;
  jobId: string;
  clientId: string;
  propertyId: string | null;
  visitDate: string;
}

export function FixNowEstimateButton({
  label,
  note,
  jobId,
  clientId,
  propertyId,
  visitDate,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [hoursLow, setHoursLow] = useState("");
  const [hoursHigh, setHoursHigh] = useState("");

  async function handleCreate() {
    setCreating(true);
    try {
      const description = note ? `${label} — ${note}` : label;
      const hours = formHourColumns({
        hours_low: hoursLow,
        hours_high: hoursHigh,
        hours_source: hoursLow.trim() || hoursHigh.trim() ? "owner" : null,
      });
      const dateStr = new Date(visitDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const res = await fetch("/api/v1/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          job_id: jobId,
          property_id: propertyId,
          notes: `Follow-up from visit on ${dateStr}: ${label}`,
          line_items: [
            {
              description,
              quantity: 1,
              unit_price_cents: 0,
              line_item_type: "labor",
              hours_low: hours.hours_low,
              hours_high: hours.hours_high,
              hours_source: hours.hours_source,
            },
          ],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error?.message ?? "Failed to create estimate");
        return;
      }
      const { id } = await res.json();
      router.push(`/app/estimates/${id}`);
    } catch {
      toast.error("Unexpected error creating estimate");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", alignItems: "flex-start" }}>
      <PersonHoursFields
        low={hoursLow}
        high={hoursHigh}
        onLow={setHoursLow}
        onHigh={setHoursHigh}
        disabled={creating}
        idPrefix="fix-now-hours"
      />
      <button
        className="p7-btn p7-btn-secondary p7-btn-sm"
        onClick={handleCreate}
        disabled={creating}
        data-testid="create-estimate-btn"
      >
        {creating ? "Creating…" : "Create Estimate"}
      </button>
    </div>
  );
}
