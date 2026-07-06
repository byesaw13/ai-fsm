"use client";
import { useState } from "react";

export type LocationDayValues = {
  dayReviewCutoffTime: string;
  minStopDwellMinutes: number;
  visitConfidenceThreshold: number;
  suppressWeekendStartPrompt: boolean;
  closeDayFollowupHours: number | null;
  trackingStartTime: string | null;
  trackingEndTime: string | null;
  locationRetentionDays: number;
};

export function LocationDaySettings(props: LocationDayValues) {
  const [cutoff, setCutoff] = useState(props.dayReviewCutoffTime.slice(0, 5));
  const [dwell, setDwell] = useState(props.minStopDwellMinutes);
  const [threshold, setThreshold] = useState(props.visitConfidenceThreshold);
  const [suppressWeekend, setSuppressWeekend] = useState(props.suppressWeekendStartPrompt);
  const [followup, setFollowup] = useState(props.closeDayFollowupHours?.toString() ?? "");
  const [trackStart, setTrackStart] = useState(props.trackingStartTime?.slice(0, 5) ?? "");
  const [trackEnd, setTrackEnd] = useState(props.trackingEndTime?.slice(0, 5) ?? "");
  const [retentionDays, setRetentionDays] = useState(props.locationRetentionDays);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    await fetch("/api/v1/location-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        day_review_cutoff_time: cutoff,
        min_stop_dwell_minutes: dwell,
        visit_confidence_threshold: threshold,
        suppress_weekend_start_prompt: suppressWeekend,
        close_day_followup_hours: followup === "" ? null : Number(followup),
        tracking_start_time: trackStart || null,
        tracking_end_time: trackEnd || null,
        location_retention_days: retentionDays,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const row = "display:flex;justify-content:space-between;align-items:center;padding:var(--space-3) 0;border-bottom:1px solid var(--border)";
  const label = { fontSize: "var(--text-sm)", color: "var(--fg-muted)" } as const;
  const input = "border rounded px-3 py-1.5 text-sm w-32";

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-3) 0", borderBottom: "1px solid var(--border)" }}>
          <div>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>End-of-day review cutoff</span>
            <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
              Home arrivals before this time won&apos;t trigger the review prompt.
            </span>
          </div>
          <input type="time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} className={input} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-3) 0", borderBottom: "1px solid var(--border)" }}>
          <div>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>Minimum stop dwell ({dwell} min)</span>
            <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
              Stops shorter than this won&apos;t create visit candidates.
            </span>
          </div>
          <input type="number" min={1} max={30} value={dwell} onChange={(e) => setDwell(Number(e.target.value))} className={input} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-3) 0", borderBottom: "1px solid var(--border)" }}>
          <div>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>Confirm All threshold ({threshold}%)</span>
            <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
              Visits above this confidence are pre-selected for bulk confirm.
            </span>
          </div>
          <input type="number" min={50} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className={input} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-3) 0", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>Suppress start-day prompt on weekends</span>
          <input type="checkbox" checked={suppressWeekend} onChange={(e) => setSuppressWeekend(e.target.checked)} style={{ width: 18, height: 18 }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-3) 0", borderBottom: "1px solid var(--border)" }}>
          <div>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>Follow-up reminder (hours)</span>
            <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
              Re-notify if day not closed after N hours. Leave blank to disable.
            </span>
          </div>
          <input type="number" min={1} max={24} value={followup} onChange={(e) => setFollowup(e.target.value)} placeholder="Off" className={input} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-3) 0", borderBottom: "1px solid var(--border)" }}>
          <div>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>GPS breadcrumb retention ({retentionDays} days)</span>
            <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
              Raw location events older than this are pruned; confirmed activity entries are kept.
            </span>
          </div>
          <input
            type="number"
            min={30}
            max={90}
            value={retentionDays}
            onChange={(e) => setRetentionDays(Number(e.target.value))}
            className={input}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-3) 0", borderBottom: "1px solid var(--border)" }}>
          <div>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>Tracking window</span>
            <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
              Hard start/end for location capture. Leave blank for no restriction.
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="time" value={trackStart} onChange={(e) => setTrackStart(e.target.value)} className={input} placeholder="Start" />
            <input type="time" value={trackEnd} onChange={(e) => setTrackEnd(e.target.value)} className={input} placeholder="End" />
          </div>
        </div>

      </div>

      <button
        onClick={save}
        disabled={saving}
        style={{ marginTop: "var(--space-4)", padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-sm)", fontWeight: 600, cursor: saving ? "default" : "pointer" }}
        className="bg-primary text-primary-foreground rounded"
      >
        {saving ? "Saving…" : saved ? "Saved!" : "Save"}
      </button>
    </div>
  );
}
