"use client";
import { useState } from "react";
import type { DayReviewPayload } from "@/lib/day-review/queries";
import { groupVisitsByProperty } from "@/lib/day-review/group-visits";

type Visit = DayReviewPayload["visits"][number];

const CLASSIFICATIONS = ["job_work", "estimate", "warranty", "material_drop", "ignore"] as const;

function fmtMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function VisitsSection({ visits }: { visits: Visit[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());

  const pending = visits.filter((v) => !done.has(v.id));
  // TASK-079: one row per property, not one per stop.
  const groups = groupVisitsByProperty(pending);
  const preSelectedGroups = groups.filter((g) => g.preSelected);

  async function confirmIds(ids: string[], classification: string) {
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/v1/visit-candidates/${id}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classification }),
        }),
      ),
    );
    setDone((s) => new Set([...s, ...ids]));
  }

  async function confirmAll() {
    await Promise.all(
      preSelectedGroups.map((g) => confirmIds(g.ids, g.preSelectedClassification)),
    );
  }

  if (visits.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Visits</h2>
        {preSelectedGroups.length > 0 && (
          <button
            onClick={confirmAll}
            className="text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-md"
          >
            Confirm All ({preSelectedGroups.length})
          </button>
        )}
      </div>
      {groups.map((g) => (
        <div key={g.key} className="border rounded-lg p-4 mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">{g.clientName}</span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {g.maxConfidence}%
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {g.propertyName} ·{" "}
            {g.visitCount > 1 ? `${g.visitCount} visits · ` : ""}
            {fmtMinutes(g.totalMinutes)} on site
          </p>
          <div className="flex flex-wrap gap-2">
            {CLASSIFICATIONS.map((cls) => (
              <button
                key={cls}
                onClick={() =>
                  cls === "ignore"
                    ? setDone((s) => new Set([...s, ...g.ids]))
                    : confirmIds(g.ids, cls)
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
