"use client";
import { useState } from "react";
import type { DayReviewPayload } from "@/lib/day-review/queries";

type Visit = DayReviewPayload["visits"][number];

const CLASSIFICATIONS = ["job_work", "estimate", "warranty", "material_drop", "ignore"] as const;

export function VisitsSection({ visits }: { visits: Visit[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());

  const pending = visits.filter((v) => !done.has(v.id));
  const preSelected = pending.filter((v) => v.preSelected);

  async function confirm(id: string, classification: string) {
    await fetch(`/api/v1/visit-candidates/${id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classification }),
    });
    setDone((s) => new Set([...s, id]));
  }

  async function confirmAll() {
    await Promise.all(preSelected.map((v) => confirm(v.id, v.classification ?? "job_work")));
  }

  if (visits.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Visits</h2>
        {preSelected.length > 0 && (
          <button
            onClick={confirmAll}
            className="text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-md"
          >
            Confirm All ({preSelected.length})
          </button>
        )}
      </div>
      {pending.map((v) => (
        <div key={v.id} className="border rounded-lg p-4 mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">{v.clientName}</span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {v.confidenceScore}%
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {v.propertyName} · {v.durationMinutes} min
          </p>
          <div className="flex flex-wrap gap-2">
            {CLASSIFICATIONS.map((cls) => (
              <button
                key={cls}
                onClick={() =>
                  cls === "ignore" ? setDone((s) => new Set([...s, v.id])) : confirm(v.id, cls)
                }
                className="text-xs border rounded px-2 py-1 hover:bg-muted capitalize"
              >
                {cls.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
