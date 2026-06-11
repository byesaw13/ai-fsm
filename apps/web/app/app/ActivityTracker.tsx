"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_META,
  ACTIVITY_CATEGORY_LABELS,
  type ActivityType,
  type ActivityCategory,
} from "@ai-fsm/domain";
import { summarizeDay, formatMinutes, type DayEntry } from "@/lib/activities/summary";

export type ActivityEntryDto = DayEntry & {
  id: string;
  entity_type: string | null;
  entity_id: string | null;
  note: string | null;
};

// ---------------------------------------------------------------------------
// Now bar — what am I doing right now, with one-tap switching
// ---------------------------------------------------------------------------

function elapsedLabel(startedAt: string, nowMs: number): string {
  const mins = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `0:${String(m).padStart(2, "0")}`;
}

export function NowBar({ active }: { active: ActivityEntryDto | null }) {
  const router = useRouter();
  const toast = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Tick the elapsed label once a minute while something is active.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [active]);

  async function switchTo(type: ActivityType) {
    setPending(true);
    const res = await fetch("/api/v1/activities/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activity_type: type }),
    });
    setPending(false);
    setSheetOpen(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error?.message ?? "Could not switch activity");
      return;
    }
    toast.success(`${ACTIVITY_TYPE_META[type].label} started`);
    router.refresh();
  }

  async function stop() {
    setPending(true);
    const res = await fetch("/api/v1/activities/stop", { method: "POST" });
    setPending(false);
    setSheetOpen(false);
    if (!res.ok) {
      toast.error("Could not stop activity");
      return;
    }
    router.refresh();
  }

  const meta = active ? ACTIVITY_TYPE_META[active.activity_type as ActivityType] : null;

  return (
    <>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)",
          padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          borderLeft: `4px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
          background: "var(--bg-card)",
        }}
        data-testid="now-bar"
      >
        {active && meta ? (
          <span style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)", minWidth: 0 }}>
            <strong style={{ whiteSpace: "nowrap" }}>{meta.emoji} {meta.label}</strong>
            {active.note && (
              <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {active.note}
              </span>
            )}
            <span style={{ color: "var(--accent)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {elapsedLabel(active.started_at, nowMs)}
            </span>
          </span>
        ) : (
          <span style={{ color: "var(--fg-muted)" }}>Not tracking — what are you doing?</span>
        )}
        <button
          type="button"
          className="p7-btn p7-btn-primary p7-btn-sm"
          disabled={pending}
          onClick={() => setSheetOpen(true)}
          data-testid="switch-activity-btn"
        >
          {active ? "Switch" : "Start"}
        </button>
      </div>

      {sheetOpen && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setSheetOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", zIndex: 450 }}
          />
          <div
            role="dialog"
            aria-label="Switch activity"
            style={{
              position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 460,
              background: "var(--bg-card)", borderTop: "1px solid var(--border)",
              borderRadius: "16px 16px 0 0", padding: "var(--space-4)",
              maxHeight: "75vh", overflowY: "auto",
              boxShadow: "0 -8px 30px rgba(15,23,42,0.18)",
            }}
            data-testid="activity-sheet"
          >
            <p style={{ margin: "0 0 var(--space-3)", fontWeight: 800, fontSize: "var(--text-lg)" }}>
              What are you doing now?
            </p>
            {(["revenue", "sales", "office", "growth", "personal"] as ActivityCategory[]).map((cat) => {
              const types = ACTIVITY_TYPES.filter((t) => ACTIVITY_TYPE_META[t].category === cat);
              return (
                <div key={cat} style={{ marginBottom: "var(--space-3)" }}>
                  <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)", marginBottom: "var(--space-2)" }}>
                    {ACTIVITY_CATEGORY_LABELS[cat]}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "var(--space-2)" }}>
                    {types.map((t) => {
                      const m = ACTIVITY_TYPE_META[t];
                      const isActive = active?.activity_type === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          disabled={pending}
                          onClick={() => switchTo(t)}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "12px", borderRadius: "var(--radius)",
                            border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                            background: isActive ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "var(--bg-card)",
                            color: isActive ? "var(--accent)" : "var(--fg)",
                            fontWeight: 600, fontSize: "var(--text-sm)", cursor: "pointer", textAlign: "left",
                          }}
                          data-testid={`activity-${t}`}
                        >
                          <span aria-hidden="true">{m.emoji}</span>{m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {active && (
              <button type="button" className="p7-btn p7-btn-ghost" disabled={pending} onClick={stop} style={{ width: "100%", marginTop: "var(--space-2)" }}>
                ⏹ Stop tracking
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

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
            biggest gap {new Date(summary.largestGap.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}–{new Date(summary.largestGap.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
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
