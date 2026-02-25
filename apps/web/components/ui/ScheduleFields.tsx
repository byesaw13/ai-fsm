"use client";

import type { ChangeEvent } from "react";

// ---------------------------------------------------------------------------
// ScheduleFields — date picker + time dropdown + duration selector
//
// Replaces datetime-local inputs with friendly controls that match how
// field service scheduling actually works: pick a date, pick a start
// time (on the hour / half-hour), pick a duration.  End time is computed
// automatically so the user never has to type it.
// ---------------------------------------------------------------------------

export interface ScheduleValue {
  date: string;       // "YYYY-MM-DD" or ""
  startTime: string;  // "HH:MM" 24 h or ""
  duration: number;   // minutes
}

/** Convert a ScheduleValue to ISO start/end pair for API submission. */
export function scheduleToISOPair(v: ScheduleValue): {
  start: string | undefined;
  end: string | undefined;
} {
  if (!v.date || !v.startTime) return { start: undefined, end: undefined };
  const start = new Date(`${v.date}T${v.startTime}:00`);
  const end = new Date(start.getTime() + v.duration * 60_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

// 6:00 AM – 8:00 PM in 30-minute increments
function buildTimeOptions() {
  const opts: { value: string; label: string }[] = [];
  for (let h = 6; h <= 20; h++) {
    for (let m = 0; m < 60; m += 30) {
      if (h === 20 && m > 0) break;
      const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const period = h < 12 ? "AM" : "PM";
      const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
      opts.push({ value: val, label: `${dh}:${String(m).padStart(2, "0")} ${period}` });
    }
  }
  return opts;
}

const TIME_OPTIONS = buildTimeOptions();

const DURATION_OPTIONS = [
  { value: 30,  label: "30 min" },
  { value: 60,  label: "1 hr" },
  { value: 90,  label: "1.5 hrs" },
  { value: 120, label: "2 hrs" },
  { value: 180, label: "3 hrs" },
  { value: 240, label: "4 hrs" },
  { value: 480, label: "All day (8 hrs)" },
];

function formatEndTime(v: ScheduleValue): string | null {
  if (!v.date || !v.startTime) return null;
  const start = new Date(`${v.date}T${v.startTime}:00`);
  const end = new Date(start.getTime() + v.duration * 60_000);
  return end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

interface ScheduleFieldsProps {
  value: ScheduleValue;
  onChange: (v: ScheduleValue) => void;
  required?: boolean;
  disabled?: boolean;
  dateError?: string;
  timeError?: string;
}

export function ScheduleFields({
  value,
  onChange,
  required,
  disabled,
  dateError,
  timeError,
}: ScheduleFieldsProps) {
  const endTime = formatEndTime(value);

  return (
    <div className="p7-form-grid-span-2">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "var(--space-3)",
        }}
      >
        {/* Date */}
        <div className="p7-field">
          <label className={`p7-label${required ? " p7-label-required" : ""}`}>
            Date
          </label>
          <input
            type="date"
            className={`p7-input${dateError ? " p7-input-error" : ""}`}
            value={value.date}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange({ ...value, date: e.target.value })
            }
            required={required}
            disabled={disabled}
          />
          {dateError && (
            <span className="p7-field-error" role="alert">
              {dateError}
            </span>
          )}
        </div>

        {/* Start time */}
        <div className="p7-field">
          <label className={`p7-label${required ? " p7-label-required" : ""}`}>
            Start Time
          </label>
          <select
            className={`p7-select${timeError ? " p7-select-error" : ""}`}
            value={value.startTime}
            onChange={(e) => onChange({ ...value, startTime: e.target.value })}
            required={required}
            disabled={disabled}
          >
            <option value="">Select time</option>
            {TIME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {timeError && (
            <span className="p7-field-error" role="alert">
              {timeError}
            </span>
          )}
        </div>

        {/* Duration */}
        <div className="p7-field">
          <label className="p7-label">Duration</label>
          <select
            className="p7-select"
            value={String(value.duration)}
            onChange={(e) =>
              onChange({ ...value, duration: parseInt(e.target.value) })
            }
            disabled={disabled || !value.startTime}
          >
            {DURATION_OPTIONS.map((o) => (
              <option key={o.value} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
          {endTime && (
            <span className="p7-field-hint">Ends at {endTime}</span>
          )}
        </div>
      </div>
    </div>
  );
}
