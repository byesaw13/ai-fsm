"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
  JOB_ACCEPTANCE_CATEGORIES,
  JOB_ACCEPTANCE_CATEGORY_LABELS,
  JOB_INTAKE_DECISIONS,
  JOB_INTAKE_DECISION_LABELS,
} from "@ai-fsm/domain";
import type { JobAcceptanceCategory, JobIntakeDecision } from "@ai-fsm/domain";

interface Props {
  jobId: string;
  initialCategory: JobAcceptanceCategory | null;
  initialDecision: JobIntakeDecision | null;
  initialNotes: string | null;
}

const DECISION_COLORS: Record<JobIntakeDecision, string> = {
  accept:  "var(--color-success)",
  decline: "var(--color-error, #dc2626)",
  defer:   "var(--color-warning, #f59e0b)",
  reframe: "var(--color-primary)",
};

export function JobIntakePanel({
  jobId,
  initialCategory,
  initialDecision,
  initialNotes,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<JobAcceptanceCategory | null>(initialCategory);
  const [decision, setDecision] = useState<JobIntakeDecision | null>(initialDecision);
  const [notes, setNotes] = useState(initialNotes ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_category: category,
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

      {/* Decision */}
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
