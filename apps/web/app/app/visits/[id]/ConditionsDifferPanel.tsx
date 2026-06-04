"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildVisitChangeOrderDraft } from "@/lib/change-orders/draft";

interface Props {
  visitId: string;
  jobId: string;
  approvedEstimateId: string;
  scopeAssumptions: string | null;
  currentTechNotes: string | null;
}

const CONDITION_FLAGS = [
  { key: "seized_shutoffs",      label: "Seized shutoff valves" },
  { key: "corroded_lines",       label: "Corroded supply lines or fittings" },
  { key: "damaged_drain",        label: "Damaged drain or trap" },
  { key: "cracked_valve",        label: "Cracked or failed valve body" },
  { key: "hidden_damage",        label: "Hidden damage behind walls or fixtures" },
  { key: "previous_poor_work",   label: "Previous poor workmanship found" },
  { key: "other",                label: "Other (describe below)" },
] as const;

export function ConditionsDifferPanel({ visitId, jobId, approvedEstimateId, scopeAssumptions, currentTechNotes }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState<"note_only" | "change_order">("change_order");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const draft = buildVisitChangeOrderDraft({
    visitId,
    jobId,
    estimateId: approvedEstimateId,
    conditionLabels: selected.map((k) => CONDITION_FLAGS.find((f) => f.key === k)?.label ?? k),
    notes,
    scopeAssumptions,
    currentTechNotes,
  });

  function toggleFlag(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0 && !notes.trim()) {
      setError("Select at least one condition or add a note.");
      return;
    }
    setSaving(true);
    setError("");
    const changeOrderDraft = draft;

    try {
      if (action === "note_only") {
        const timestamp = new Date().toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
        const appendedNotes = currentTechNotes?.trim()
          ? `${currentTechNotes.trim()}\n\n[${timestamp}] ${changeOrderDraft.description}`
          : changeOrderDraft.description;
        const r = await fetch(`/api/v1/visits/${visitId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tech_notes: appendedNotes }),
        });
        if (!r.ok) throw new Error("Failed to save note");
      } else {
        const r = await fetch("/api/v1/change-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            estimate_id: approvedEstimateId,
            title: changeOrderDraft.title,
            description: changeOrderDraft.description,
            notes: changeOrderDraft.notes,
            tax_rate: 0,
            line_items: [
              {
                description: changeOrderDraft.lineItemDescription,
                quantity: 1,
                unit_price_cents: 0,
              },
            ],
          }),
        });
        if (!r.ok) throw new Error("Failed to create change order");
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div style={{ padding: "var(--space-3) 0" }}>
        <p style={{ color: "var(--fg-success)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
          {action === "change_order" ? "Change order created." : "Note saved."}
        </p>
        {action === "change_order" && (
          <a
            href={`/app/estimates/${approvedEstimateId}#change-orders`}
            style={{ fontSize: "var(--text-sm)", color: "var(--accent)" }}
          >
            Review change order on estimate →
          </a>
        )}
      </div>
    );
  }

  return (
    <div>
      {!open ? (
        <button
          type="button"
          className="p7-btn p7-btn-secondary p7-btn-sm"
          onClick={() => setOpen(true)}
        >
          Conditions Differ from Estimate
        </button>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {scopeAssumptions && (
            <div style={{
              padding: "var(--space-2) var(--space-3)",
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--text-xs)",
              color: "var(--fg-muted)",
            }}>
              <strong style={{ display: "block", marginBottom: 4, color: "var(--fg)" }}>Based on this estimate, we assumed:</strong>
              <span style={{ whiteSpace: "pre-wrap" }}>{scopeAssumptions}</span>
            </div>
          )}

          <div style={{ padding: "var(--space-2) var(--space-3)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", fontSize: "var(--text-xs)" }}>
            <strong style={{ display: "block", marginBottom: 4, color: "var(--fg)" }}>Change order draft preview</strong>
            <div style={{ display: "grid", gap: 4, color: "var(--fg-muted)" }}>
              <div><span style={{ color: "var(--fg)", fontWeight: 600 }}>Title:</span> {draft.title}</div>
              <div><span style={{ color: "var(--fg)", fontWeight: 600 }}>Line item:</span> {draft.lineItemDescription}</div>
              <div><span style={{ color: "var(--fg)", fontWeight: 600 }}>Source:</span> visit {visitId} · job {jobId} · estimate {approvedEstimateId}</div>
            </div>
          </div>

          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
              What was found?
            </legend>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              {CONDITION_FLAGS.map((f) => (
                <label key={f.key} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(f.key)}
                    onChange={() => toggleFlag(f.key)}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label style={{ display: "block", fontWeight: 600, fontSize: "var(--text-sm)", marginBottom: "var(--space-1)" }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Describe what was found..."
              style={{
                width: "100%",
                padding: "var(--space-2) var(--space-3)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--text-sm)",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>

          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, fontSize: "var(--text-sm)", marginBottom: "var(--space-1)" }}>
              Action
            </legend>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="action"
                  checked={action === "change_order"}
                  onChange={() => setAction("change_order")}
                />
                Create change order (customer approval required before proceeding)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="action"
                  checked={action === "note_only"}
                  onChange={() => setAction("note_only")}
                />
                Note only (log finding, proceed as-is)
              </label>
            </div>
          </fieldset>

          {error && (
            <p style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>{error}</p>
          )}

          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button type="submit" className="p7-btn p7-btn-primary p7-btn-sm" disabled={saving}>
              {saving ? "Saving…" : action === "change_order" ? "Create Change Order" : "Save Note"}
            </button>
            <button
              type="button"
              className="p7-btn p7-btn-secondary p7-btn-sm"
              onClick={() => { setOpen(false); setSelected([]); setNotes(""); setError(""); }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
