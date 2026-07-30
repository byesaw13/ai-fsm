"use client";
import { useState } from "react";
import type { DayReviewPayload } from "@/lib/day-review/queries";
import { groupVisitsByProperty } from "@/lib/day-review/group-visits";
import { WorkOrderPicker } from "@/components/field/WorkOrderPicker";

type Visit = DayReviewPayload["visits"][number];

const CLASSIFICATIONS = ["job_work", "estimate", "warranty", "material_drop", "ignore"] as const;

function fmtMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** Map UI classification chips to API VisitClassification values. */
function toApiClassification(cls: string): string {
  if (cls === "estimate") return "estimate_visit";
  if (cls === "warranty") return "warranty_callback";
  return cls;
}

export function VisitsSection({
  visits,
  openWorkOrdersByProperty = {},
}: {
  visits: Visit[];
  openWorkOrdersByProperty?: DayReviewPayload["openWorkOrdersByProperty"];
}) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [woByGroup, setWoByGroup] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const pending = visits.filter((v) => !done.has(v.id));
  const groups = groupVisitsByProperty(pending);
  const preSelectedGroups = groups.filter((g) => g.preSelected);

  async function confirmIds(ids: string[], classification: string, workOrderId?: string) {
    setError(null);
    const results = await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`/api/v1/visit-candidates/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: classification === "ignore" ? "ignore" : "confirm",
            classification:
              classification === "ignore" ? undefined : toApiClassification(classification),
            work_order_id: workOrderId || undefined,
            // Day Review is usually closed sessions — do not force-switch/backdate open activities.
            switch_activity: false,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { ok: false as const, body };
        }
        return { ok: true as const };
      }),
    );
    const failed = results.find((r) => !r.ok);
    if (failed && !failed.ok) {
      const code = failed.body?.error?.code;
      if (code === "ambiguous_work_order") {
        setError("Choose a work order before confirming job work.");
      } else {
        setError(failed.body?.error?.message ?? "Confirm failed");
      }
      return;
    }
    setDone((s) => new Set([...s, ...ids]));
  }

  async function confirmAll() {
    await Promise.all(
      preSelectedGroups.map((g) => {
        const wo =
          woByGroup[g.key] ||
          g.workOrderId ||
          undefined;
        if (g.woResolution === "ambiguous" && !wo) return Promise.resolve();
        return confirmIds(g.ids, g.preSelectedClassification, wo ?? undefined);
      }),
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
      {error && (
        <p className="text-sm text-destructive mb-2" role="alert">
          {error}
        </p>
      )}
      {groups.map((g) => {
        const options = g.propertyId
          ? openWorkOrdersByProperty[g.propertyId] ?? []
          : [];
        const ambiguous = g.woResolution === "ambiguous" || (!g.workOrderId && options.length > 1);
        const selectedWo = woByGroup[g.key] || g.workOrderId || null;

        return (
          <div key={g.key} className="border rounded-lg p-4 mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">{g.clientName}</span>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {g.maxConfidence}%
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              {g.propertyName} ·{" "}
              {g.visitCount > 1 ? `${g.visitCount} visits · ` : ""}
              {fmtMinutes(g.totalMinutes)} on site
              {g.workOrderTitle ? ` · ${g.workOrderTitle}` : ""}
            </p>
            {ambiguous && options.length > 0 && (
              <WorkOrderPicker
                options={options}
                value={selectedWo}
                onChange={(id) => setWoByGroup((m) => ({ ...m, [g.key]: id }))}
              />
            )}
            <div className="flex flex-wrap gap-2">
              {CLASSIFICATIONS.map((cls) => {
                const needsWo = cls === "job_work" && ambiguous && !selectedWo;
                return (
                  <button
                    key={cls}
                    disabled={needsWo}
                    onClick={() =>
                      confirmIds(
                        g.ids,
                        cls,
                        selectedWo ?? undefined,
                      )
                    }
                    className="text-xs border rounded px-2 py-1 hover:bg-muted capitalize disabled:opacity-40"
                  >
                    {cls.replace(/_/g, " ")}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
