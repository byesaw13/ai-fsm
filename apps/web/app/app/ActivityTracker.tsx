"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
  ACTIVITY_TYPE_META,
  ACTIVITY_CATEGORY_LABELS,
  type ActivityType,
  type ActivityCategory,
} from "@ai-fsm/domain";
import { summarizeDay, formatMinutes } from "@/lib/activities/summary";
import { formatBusinessTime } from "@/lib/time/business-tz";
import type { ActivityEntryDto } from "@/lib/my-work/field-day-types";

// ---------------------------------------------------------------------------
// Day time summary — breakdown + missing-time backfill (lives in End Day card)
// ---------------------------------------------------------------------------

const BACKFILL_TYPES: ActivityType[] = ["travel", "job_work", "admin", "personal"];

export function DayTimeSummary({ entries }: { entries: ActivityEntryDto[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const summary = useMemo(() => summarizeDay(entries), [entries]);

  async function backfill(type: ActivityType) {
    const gap = summary.largestGap;
    if (!gap) return;
    setPending(true);
    const res = await fetch("/api/v1/activities/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activity_type: type,
        started_at: gap.start,
        ended_at: gap.end,
        source: "backfill",
      }),
    });
    setPending(false);
    if (!res.ok) {
      toast.error("Could not log that time");
      return;
    }
    toast.success(`${formatMinutes(gap.minutes)} logged as ${ACTIVITY_TYPE_META[type].label}`);
    router.refresh();
  }

  if (entries.length === 0) {
    return (
      <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
        No activity tracked today yet — tap an activity on the bar above as you work.
      </p>
    );
  }

  const cats: Array<[ActivityCategory, string]> = [
    ["revenue", "var(--color-success)"],
    ["sales", "var(--color-primary, var(--accent))"],
    ["office", "var(--color-warning)"],
    ["growth", "#7c3aed"],
    ["personal", "var(--fg-muted)"],
  ];
  const total = summary.totalMinutes || 1;

  return (
    <div style={{ marginBottom: "var(--space-4)" }} data-testid="day-time-summary">
      {/* Missing time */}
      {summary.unaccountedMinutes > 0 && summary.largestGap && (
        <div style={{ padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-warning)", background: "#fffbeb", marginBottom: "var(--space-3)" }}>
          <strong style={{ color: "#92400e" }}>
            🔴 {formatMinutes(summary.unaccountedMinutes)} unaccounted
          </strong>
          <span style={{ color: "#92400e", fontSize: "var(--text-sm)", marginLeft: 8 }}>
            biggest gap {formatBusinessTime(summary.largestGap.start)}–{formatBusinessTime(summary.largestGap.end)}
          </span>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
            {BACKFILL_TYPES.map((t) => (
              <button key={t} type="button" className="p7-btn p7-btn-secondary p7-btn-sm" disabled={pending} onClick={() => backfill(t)}>
                {ACTIVITY_TYPE_META[t].emoji} {ACTIVITY_TYPE_META[t].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stacked bar + legend */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", marginBottom: 6 }}>
        <strong>Today: {formatMinutes(summary.totalMinutes)} tracked</strong>
      </div>
      <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", background: "var(--bg)", border: "1px solid var(--border-subtle)" }}>
        {cats.map(([cat, color]) => {
          const mins = summary.byCategory[cat] ?? 0;
          if (!mins) return null;
          return <div key={cat} style={{ width: `${(mins / total) * 100}%`, background: color }} title={`${ACTIVITY_CATEGORY_LABELS[cat]}: ${formatMinutes(mins)}`} />;
        })}
      </div>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginTop: 6, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
        {cats.map(([cat, color]) => {
          const mins = summary.byCategory[cat] ?? 0;
          if (!mins) return null;
          return (
            <span key={cat} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />
              {ACTIVITY_CATEGORY_LABELS[cat]} {formatMinutes(mins)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
