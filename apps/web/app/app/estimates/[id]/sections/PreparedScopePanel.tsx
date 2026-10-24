"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { summarizePreparedScope, type PreparedScope, type PreparedTask } from "@ai-fsm/domain";
import { Button, useToast } from "@/components/ui";
import { hoursSourceLabel, kindLabel, quantityLabel, tmRangeLabel } from "@/lib/estimates/prepared-scope-display";

interface Props {
  estimateId: string;
  initialScope: PreparedScope;
  roomNames: Record<string, string>;
  laborRateCents: number;
  editable: boolean;
}

function hoursValue(n: number | null): string {
  return n === null ? "" : String(n);
}

function parseHours(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 4) / 4 : null;
}

function dollarsValue(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

function parseDollars(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

const label: React.CSSProperties = { fontSize: "var(--text-xs)", color: "var(--fg-muted)" };

/**
 * The structured draft Prepare Quote built from the assessment (TASK-179).
 * Owner edits hours, materials, which tasks are included, and answers; Apply
 * to quote rebuilds only the lines this scope produced.
 */
export function PreparedScopePanel({ estimateId, initialScope, roomNames, laborRateCents, editable }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [scope, setScope] = useState(initialScope);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<"save" | "apply" | null>(null);
  const summary = useMemo(() => summarizePreparedScope(scope), [scope]);

  function patchTask(id: string, patch: Partial<PreparedTask>) {
    setScope((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
    setDirty(true);
  }

  function answer(id: string, value: string) {
    setScope((s) => ({ ...s, questions: s.questions.map((q) => (q.id === id ? { ...q, answer: value } : q)) }));
    setDirty(true);
  }

  async function save(apply: boolean) {
    setSaving(apply ? "apply" : "save");
    try {
      const res = await fetch(`/api/v1/estimates/${estimateId}/prepared-scope`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepared_scope: scope, apply }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error?.message ?? "Save failed");
        return;
      }
      setScope(data.prepared_scope);
      setDirty(false);
      toast.success(apply ? "Quote rebuilt from the prepared scope" : "Prepared scope saved");
      if (apply) router.refresh();
    } catch {
      toast.error("Save failed. Your edits are still on this page.");
    } finally {
      setSaving(null);
    }
  }

  const groupOrder = [...scope.groups.map((g) => g.key), ...scope.tasks.map((t) => t.group_key)].filter(
    (k, i, all) => all.indexOf(k) === i,
  );
  const groupLabel = new Map(scope.groups.map((g) => [g.key, g.label]));
  const looseQuestions = scope.questions.filter((q) => q.task_ids.length === 0);
  const openQuestions = scope.questions.filter((q) => !q.answer).length;

  return (
    <section className="card" style={{ marginBottom: "var(--space-4)" }} data-testid="prepared-scope-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Prepared scope</h2>
        <span style={label}>From the site assessment</span>
      </div>
      <p style={{ margin: "var(--space-2) 0", fontWeight: 600 }} data-testid="prepared-scope-total">
        T&amp;M estimate {tmRangeLabel(summary, laborRateCents)}
        <span style={{ fontWeight: 400, color: "var(--fg-muted)" }}>
          {" "}· {summary.hours_low}–{summary.hours_high} h at ${Math.round(laborRateCents / 100)}/h + ${Math.round(summary.materials_cents / 100).toLocaleString("en-US")} materials
        </span>
      </p>
      <p style={{ ...label, margin: "0 0 var(--space-3)" }}>
        {[
          summary.tasks_without_hours > 0 ? `${summary.tasks_without_hours} included task(s) without hours` : null,
          summary.tasks_without_materials_price > 0 ? `${summary.tasks_without_materials_price} without a materials price` : null,
          summary.unconfirmed_suggestions > 0 ? `${summary.unconfirmed_suggestions} suggestion(s) not included` : null,
          openQuestions > 0 ? `${openQuestions} open question(s)` : null,
        ].filter(Boolean).join(" · ") || "Everything has hours and an answer."}
      </p>

      {looseQuestions.map((q) => (
        <p key={q.id} className="muted" style={{ margin: "0 0 var(--space-3)" }}>{q.text}</p>
      ))}

      {groupOrder.map((key) => {
        const tasks = scope.tasks.filter((t) => t.group_key === key);
        if (tasks.length === 0) return null;
        const g = summary.groups.find((x) => x.key === key);
        return (
          <div key={key} style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)", marginTop: "var(--space-3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: "var(--text-sm)" }}>{groupLabel.get(key) ?? key}</h3>
              {g && <span style={label}>{g.hours_low}–{g.hours_high} h · ${Math.round(g.materials_cents / 100).toLocaleString("en-US")} materials</span>}
            </div>
            {tasks.map((t) => {
              const questions = scope.questions.filter((q) => q.task_ids.includes(t.id));
              return (
                <div key={t.id} style={{ padding: "var(--space-2) 0", opacity: t.confirmed ? 1 : 0.7 }} data-testid={`prepared-task-${t.id}`}>
                  <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
                    <input
                      type="checkbox"
                      checked={t.confirmed}
                      disabled={!editable}
                      onChange={(e) => patchTask(t.id, { confirmed: e.target.checked })}
                      aria-label={`Include ${t.description}`}
                    />
                    <span>
                      {t.description}
                      <span style={{ ...label, display: "block" }}>
                        {[t.room_id ? roomNames[t.room_id] ?? null : "Whole job", kindLabel(t.kind), t.quantity ? quantityLabel(t.quantity) : null, t.confirmed ? null : "not included"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </label>
                  <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-1)", paddingLeft: "var(--space-5)" }}>
                    <div style={{ flex: "1 1 70px" }}>
                      <span style={label}>Hours low</span>
                      <input className="p7-input" type="number" min="0" step="0.25" inputMode="decimal" value={hoursValue(t.hours_low)} disabled={!editable}
                        onChange={(e) => patchTask(t.id, { hours_low: parseHours(e.target.value) })} />
                    </div>
                    <div style={{ flex: "1 1 70px" }}>
                      <span style={label}>Hours high</span>
                      <input className="p7-input" type="number" min="0" step="0.25" inputMode="decimal" value={hoursValue(t.hours_high)} disabled={!editable}
                        onChange={(e) => patchTask(t.id, { hours_high: parseHours(e.target.value) })} />
                    </div>
                    <div style={{ flex: "1 1 90px" }}>
                      <span style={label}>Materials $</span>
                      <input className="p7-input" type="number" min="0" step="1" inputMode="decimal" value={dollarsValue(t.materials_cents)} placeholder="Not priced" disabled={!editable}
                        onChange={(e) => patchTask(t.id, { materials_cents: parseDollars(e.target.value) })} />
                    </div>
                    <span style={{ ...label, alignSelf: "flex-end", flex: "1 1 100%" }}>Hours: {hoursSourceLabel(t.hours_source)}</span>
                  </div>
                  {questions.map((q) => (
                    <div key={q.id} style={{ paddingLeft: "var(--space-5)", marginTop: "var(--space-2)" }}>
                      <span style={label}>Question: {q.text}</span>
                      <input className="p7-input" type="text" value={q.answer ?? ""} placeholder="Answer" disabled={!editable}
                        onChange={(e) => answer(q.id, e.target.value)} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}

      {scope.alternatives.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <h3 style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-sm)" }}>Options</h3>
          <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
            {scope.alternatives.map((a) => <li key={a.id}>{a.label}{a.note ? ` — ${a.note}` : ""}</li>)}
          </ul>
        </div>
      )}
      {scope.exclusions.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <h3 style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-sm)" }}>Not included</h3>
          <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
            {scope.exclusions.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

      {editable && (
        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", marginTop: "var(--space-4)", flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => save(false)} loading={saving === "save"} disabled={!dirty || saving !== null}>
            Save
          </Button>
          <Button onClick={() => save(true)} loading={saving === "apply"} disabled={saving !== null} data-testid="prepared-scope-apply">
            Apply to quote
          </Button>
        </div>
      )}
    </section>
  );
}
