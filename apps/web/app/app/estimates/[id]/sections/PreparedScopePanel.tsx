"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_PREPARED_PRICING,
  modelPreparedProfit,
  summarizePreparedScope,
  type PreparedPricing,
  type PreparedScope,
  type PreparedTask,
} from "@ai-fsm/domain";
import { Button, useToast } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { hoursSourceLabel, kindLabel, quantityLabel, tmRangeLabel, workAreaFlags, workAreaRows } from "@/lib/estimates/prepared-scope-display";

interface Props {
  estimateId: string;
  initialScope: PreparedScope;
  roomNames: Record<string, string>;
  laborRateCents: number;
  /** Owner's internal cost per hour; profit is modeled with it, never the billing rate. */
  laborCostCents: number;
  editable: boolean;
  /** Owner/admin only: show modeled cost and remainder. */
  showInternal: boolean;
}

function fmtHours(n: number): string {
  return String(Math.round(n * 100) / 100);
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
export function PreparedScopePanel({ estimateId, initialScope, roomNames, laborRateCents, laborCostCents, editable, showInternal }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [scope, setScope] = useState(initialScope);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<"save" | "apply" | null>(null);
  const summary = useMemo(() => summarizePreparedScope(scope), [scope]);
  const pricing = scope.pricing ?? DEFAULT_PREPARED_PRICING;
  const profit = useMemo(
    () => modelPreparedProfit(scope, { laborRateCents, laborCostCents }),
    [scope, laborRateCents, laborCostCents],
  );
  const areas = useMemo(() => workAreaRows(scope, laborRateCents), [scope, laborRateCents]);
  // Work areas start collapsed (TASK-185); the owner opens one to edit its tasks.
  const [openAreas, setOpenAreas] = useState<Set<string>>(() => new Set());
  function toggleArea(key: string) {
    setOpenAreas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  const fixedTooLow =
    pricing.mode === "fixed" && pricing.fixed_price_cents !== null && pricing.fixed_price_cents < summary.materials_cents;

  function patchPricing(patch: Partial<PreparedPricing>) {
    setScope((s) => ({ ...s, pricing: { ...(s.pricing ?? DEFAULT_PREPARED_PRICING), ...patch } }));
    setDirty(true);
  }

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

      <div data-testid="work-area-table">
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "var(--space-3)", ...label, padding: "var(--space-1) 0" }}>
          <span>Work area</span>
          <span style={{ textAlign: "right" }}>Labor</span>
          <span style={{ textAlign: "right" }}>Materials</span>
          <span style={{ textAlign: "right" }}>Total</span>
        </div>
        {areas.rows.map((area) => {
          const tasks = scope.tasks.filter((t) => t.group_key === area.key);
          const open = openAreas.has(area.key);
          const flags = workAreaFlags(area);
          return (
            <div key={area.key} style={{ borderTop: "1px solid var(--border)" }} data-testid={`work-area-${area.key}`}>
              <button
                type="button"
               
                onClick={() => toggleArea(area.key)}
                aria-expanded={open}
                style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "var(--space-3)", width: "100%", padding: "var(--space-2) 0", background: "none", border: "none", textAlign: "left", cursor: "pointer", color: "inherit", font: "inherit" }}
              >
                <span>
                  <span style={{ fontWeight: 600 }}>{open ? "▾" : "▸"} {area.label}</span>
                  <span style={{ ...label, display: "block" }}>
                    {[
                      `${fmtHours(area.hours_low)}–${fmtHours(area.hours_high)} h`,
                      area.included_count === area.task_count ? `${area.task_count} task${area.task_count === 1 ? "" : "s"}` : `${area.included_count} of ${area.task_count} tasks included`,
                    ].join(" · ")}
                  </span>
                  {flags && <span style={{ ...label, display: "block", color: "var(--warning, var(--fg))" }}>{flags}</span>}
                </span>
                <span style={{ textAlign: "right" }}>{formatCents(area.labor_cents)}</span>
                <span style={{ textAlign: "right" }}>{formatCents(area.materials_cents)}</span>
                <span style={{ textAlign: "right", fontWeight: 600 }}>{formatCents(area.total_cents)}</span>
              </button>
              {open && (
                <div style={{ paddingBottom: "var(--space-2)" }}>
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
              )}
            </div>
          );
        })}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "var(--space-3)", borderTop: "2px solid var(--border)", padding: "var(--space-2) 0", fontWeight: 600 }}>
          <span>Total</span>
          <span style={{ textAlign: "right" }}>{formatCents(areas.labor_cents)}</span>
          <span style={{ textAlign: "right" }}>{formatCents(areas.materials_cents)}</span>
          <span style={{ textAlign: "right" }} data-testid="work-area-total">{formatCents(areas.total_cents)}</span>
        </div>
      </div>

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


      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)", marginTop: "var(--space-3)" }} data-testid="prepared-pricing">
        <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)" }}>Pricing</h3>
        <div role="radiogroup" aria-label="Pricing" style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: "var(--space-1)", alignItems: "center" }}>
            <input type="radio" name={`pricing-${estimateId}`} checked={pricing.mode === "tm"} disabled={!editable}
              onChange={() => patchPricing({ mode: "tm" })} />
            Time &amp; materials {tmRangeLabel(summary, laborRateCents)}
          </label>
          <label style={{ display: "flex", gap: "var(--space-1)", alignItems: "center" }}>
            <input type="radio" name={`pricing-${estimateId}`} checked={pricing.mode === "fixed"} disabled={!editable}
              onChange={() => patchPricing({ mode: "fixed" })} />
            Fixed price
          </label>
        </div>
        {pricing.mode === "fixed" && (
          <div style={{ marginTop: "var(--space-2)", maxWidth: 220 }}>
            <span style={label}>Fixed price $</span>
            <input className="p7-input" type="number" min="0" step="1" inputMode="decimal" value={dollarsValue(pricing.fixed_price_cents)}
              placeholder="Your price" disabled={!editable} data-testid="prepared-fixed-price"
              onChange={(e) => patchPricing({ fixed_price_cents: parseDollars(e.target.value) })} />
            {fixedTooLow && (
              <span style={{ ...label, color: "var(--danger, #b42318)", display: "block" }}>
                Below the ${Math.round(summary.materials_cents / 100).toLocaleString("en-US")} materials allowance.
              </span>
            )}
          </div>
        )}
        <p style={{ ...label, margin: "var(--space-2) 0 0" }}>
          {pricing.mode === "fixed"
            ? "The customer sees one price per room that adds up to your fixed price, with materials shown as allowances."
            : "The customer sees labor and materials per room at your T&M rate."}
        </p>

        {showInternal && (
          <div style={{ marginTop: "var(--space-3)" }} data-testid="prepared-profit">
            <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)" }}>Modeled profit (owner only)</h3>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 90px" }}>
                <span style={label}>Expected hours</span>
                <input className="p7-input" type="number" min="0" step="0.25" inputMode="decimal" value={hoursValue(pricing.expected_hours)}
                  placeholder={fmtHours(profit.expected_hours)} disabled={!editable}
                  onChange={(e) => patchPricing({ expected_hours: parseHours(e.target.value) })} />
              </div>
              <div style={{ flex: "1 1 90px" }}>
                <span style={label}>Overhead $</span>
                <input className="p7-input" type="number" min="0" step="1" inputMode="decimal" value={pricing.overhead_cents ? dollarsValue(pricing.overhead_cents) : ""}
                  placeholder="0" disabled={!editable}
                  onChange={(e) => patchPricing({ overhead_cents: parseDollars(e.target.value) ?? 0 })} />
              </div>
              <div style={{ flex: "1 1 90px" }}>
                <span style={label}>Reserve %</span>
                <input className="p7-input" type="number" min="0" max="100" step="1" inputMode="decimal" value={pricing.reserve_pct || ""}
                  placeholder="0" disabled={!editable}
                  onChange={(e) => patchPricing({ reserve_pct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
              </div>
            </div>
            <table style={{ width: "100%", marginTop: "var(--space-2)", fontSize: "var(--text-sm)" }}>
              <tbody>
                <tr><td>{pricing.mode === "fixed" ? "Fixed price" : `T&M at ${fmtHours(profit.expected_hours)} h`}</td><td style={{ textAlign: "right" }}>{profit.sell_cents === null ? "—" : formatCents(profit.sell_cents)}</td></tr>
                <tr><td>Labor cost ({fmtHours(profit.expected_hours)} h × {formatCents(laborCostCents)})</td><td style={{ textAlign: "right" }}>−{formatCents(profit.labor_cost_cents)}</td></tr>
                <tr><td>Materials</td><td style={{ textAlign: "right" }}>−{formatCents(profit.materials_cents)}</td></tr>
                <tr><td>Overhead</td><td style={{ textAlign: "right" }}>−{formatCents(profit.overhead_cents)}</td></tr>
                <tr><td>Reserve ({pricing.reserve_pct}% of {formatCents(profit.modeled_cost_cents)})</td><td style={{ textAlign: "right" }}>−{formatCents(profit.reserve_cents)}</td></tr>
                <tr style={{ fontWeight: 600 }}><td>Modeled remainder</td><td style={{ textAlign: "right" }}>{profit.remainder_cents === null ? "—" : formatCents(profit.remainder_cents)}{profit.margin_pct === null ? "" : ` (${profit.margin_pct}%)`}</td></tr>
              </tbody>
            </table>
            <p style={{ ...label, margin: "var(--space-1) 0 0" }}>
              Modeled from your expected hours and cost rate. Not net profit: taxes and unrecorded costs are not included.
            </p>
          </div>
        )}
      </div>
      {editable && (
        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", alignItems: "center", marginTop: "var(--space-4)", flexWrap: "wrap" }}>
          <a href={`/app/estimates/${estimateId}/print`} target="_blank" rel="noreferrer" style={{ fontSize: "var(--text-sm)" }}>
            Preview what the customer sees
          </a>
          <Button variant="secondary" onClick={() => save(false)} loading={saving === "save"} disabled={!dirty || saving !== null}>
            Save
          </Button>
          <Button onClick={() => save(true)} loading={saving === "apply"} disabled={saving !== null || fixedTooLow} data-testid="prepared-scope-apply">
            Apply to quote
          </Button>
        </div>
      )}
    </section>
  );
}
