"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
  JOB_ACCEPTANCE_CATEGORIES,
  JOB_ACCEPTANCE_CATEGORY_LABELS,
  JOB_INTAKE_DECISIONS,
  JOB_INTAKE_DECISION_LABELS,
  JOB_INTAKE_RATING_FIELDS,
  JOB_INTAKE_RATING_LABELS,
} from "@ai-fsm/domain";
import type { JobAcceptanceCategory, JobIntakeDecision, JobIntakeRatingField } from "@ai-fsm/domain";

interface Props {
  jobId: string;
  initialCategory: JobAcceptanceCategory | null;
  initialRatings: Record<JobIntakeRatingField, number | null>;
  initialDecision: JobIntakeDecision | null;
  initialNotes: string | null;
}

const DECISION_COLORS: Record<JobIntakeDecision, string> = {
  accept:  "var(--color-success)",
  decline: "var(--color-error, #dc2626)",
  defer:   "var(--color-warning, #f59e0b)",
  reframe: "var(--color-primary)",
};

function acceptanceScore(ratings: Record<JobIntakeRatingField, number | null>): number | null {
  const filled = JOB_INTAKE_RATING_FIELDS.map((f) => ratings[f]).filter((v): v is number => v !== null);
  if (filled.length === 0) return null;
  return filled.reduce((a, b) => a + b, 0) / filled.length;
}

function RatingButtons({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: "var(--space-1)" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          disabled={disabled}
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${value === n ? "var(--color-primary)" : "var(--color-border)"}`,
            background: value === n ? "var(--color-primary)" : "var(--color-surface)",
            color: value === n ? "#fff" : "var(--color-text-primary)",
            fontWeight: value === n ? 700 : 400,
            fontSize: "var(--font-size-sm)",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function JobIntakePanel({
  jobId,
  initialCategory,
  initialRatings,
  initialDecision,
  initialNotes,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<JobAcceptanceCategory | null>(initialCategory);
  const [ratings, setRatings] = useState<Record<JobIntakeRatingField, number | null>>(initialRatings);
  const [decision, setDecision] = useState<JobIntakeDecision | null>(initialDecision);
  const [notes, setNotes] = useState(initialNotes ?? "");

  const score = acceptanceScore(ratings);
  const scoreColor =
    score === null
      ? "var(--color-text-secondary)"
      : score >= 4
      ? "var(--color-success)"
      : score >= 2.5
      ? "var(--color-warning, #f59e0b)"
      : "var(--color-error, #dc2626)";

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_category: category,
          ...Object.fromEntries(JOB_INTAKE_RATING_FIELDS.map((f) => [f, ratings[f]])),
          intake_decision: decision,
          intake_notes: notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error?.message ?? "Failed to save intake");
        return;
      }
      toast.success("Intake saved");
      router.refresh();
    } catch {
      toast.error("Unexpected error saving intake");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="job-intake-panel">
      {/* Acceptance score summary */}
      {score !== null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            marginBottom: "var(--space-4)",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <span style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: scoreColor }}>
            {score.toFixed(1)}<span style={{ fontSize: "var(--font-size-sm)", fontWeight: 400, color: "var(--color-text-secondary)" }}> / 5</span>
          </span>
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
            {score >= 4 ? "Strong candidate" : score >= 2.5 ? "Marginal — review carefully" : "Low score — consider declining"}
          </span>
          {decision && (
            <span
              style={{
                marginLeft: "auto",
                fontWeight: 600,
                fontSize: "var(--font-size-sm)",
                color: DECISION_COLORS[decision],
              }}
            >
              {JOB_INTAKE_DECISION_LABELS[decision]}
            </span>
          )}
        </div>
      )}

      {/* Category */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <label className="p7-label">Job Category</label>
        <select
          className="p7-select"
          style={{ width: "100%" }}
          value={category ?? ""}
          onChange={(e) => setCategory((e.target.value as JobAcceptanceCategory) || null)}
          disabled={saving}
        >
          <option value="">— Select category —</option>
          {JOB_ACCEPTANCE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{JOB_ACCEPTANCE_CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </div>

      {/* Rating fields */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <label className="p7-label" style={{ marginBottom: "var(--space-2)", display: "block" }}>
          Intake Ratings <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>(1 = poor · 5 = excellent)</span>
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {JOB_INTAKE_RATING_FIELDS.map((field) => (
            <div key={field} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)" }}>
              <span style={{ fontSize: "var(--font-size-sm)", minWidth: 140 }}>
                {JOB_INTAKE_RATING_LABELS[field]}
              </span>
              <RatingButtons
                value={ratings[field]}
                onChange={(v) => setRatings((prev) => ({ ...prev, [field]: v }))}
                disabled={saving}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Intake decision */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <label className="p7-label">Decision</label>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {JOB_INTAKE_DECISIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDecision(decision === d ? null : d)}
              disabled={saving}
              style={{
                padding: "var(--space-1) var(--space-3)",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${decision === d ? DECISION_COLORS[d] : "var(--color-border)"}`,
                background: decision === d ? DECISION_COLORS[d] : "var(--color-surface)",
                color: decision === d ? "#fff" : "var(--color-text-primary)",
                fontWeight: decision === d ? 600 : 400,
                fontSize: "var(--font-size-sm)",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {JOB_INTAKE_DECISION_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <label className="p7-label">Intake Notes</label>
        <textarea
          className="p7-textarea"
          style={{ width: "100%" }}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={saving}
          placeholder="Reasons for decision, follow-up context…"
        />
      </div>

      <button
        className="p7-btn p7-btn-primary"
        onClick={handleSave}
        disabled={saving}
        data-testid="save-intake-btn"
      >
        {saving ? "Saving…" : "Save Intake"}
      </button>
    </div>
  );
}
