"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_PREPARED_PRICING,
  materialLineCents,
  modelPreparedProfit,
  summarizePreparedScope,
  type PreparedMaterialLine,
  type PreparedMaterialList,
  type PreparedPricing,
  type PreparedScope,
  type PreparedTask,
} from "@ai-fsm/domain";
import { Button, useToast } from "@/components/ui";
import { formatCents } from "@/lib/money";
import type { RevisionChange } from "@/lib/estimates/revise-quote";
import { hoursSourceLabel, kindLabel, methodLabel, quantityLabel, tmRangeLabel, workAreaFlags, workAreaRows } from "@/lib/estimates/prepared-scope-display";

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

interface RevisionProposal {
  proposed_scope: PreparedScope;
  changes: RevisionChange[];
  summary: string;
  output: unknown;
}

function changeLine(c: RevisionChange): string {
  const h = (v: { hours_low: number | null; hours_high: number | null }) =>
    v.hours_low === null || v.hours_high === null ? "no hours" : `${fmtHours(v.hours_low)}–${fmtHours(v.hours_high)} h`;
  const m = (cents: number | null) => (cents === null ? "not priced" : formatCents(cents));
  if (c.action === "add") return `Added: ${c.description} (${h(c.after)}, ${m(c.after.materials_cents)})`;
  if (c.action === "exclude") return `Taken out: ${c.description}`;
  if (c.action === "include") return `Put back: ${c.description}`;
  const parts: string[] = [];
  if (c.before && (c.before.hours_low !== c.after.hours_low || c.before.hours_high !== c.after.hours_high)) parts.push(`${h(c.before)} → ${h(c.after)}`);
  if (c.before && c.before.materials_cents !== c.after.materials_cents) parts.push(`materials ${m(c.before.materials_cents)} → ${m(c.after.materials_cents)}`);
  return `Changed: ${c.description}${parts.length ? ` (${parts.join(", ")})` : ""}`;
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

  // Itemized materials (TASK-187): which area is generating, "all" for every area.
  const [itemizing, setItemizing] = useState<string | null>(null);

  function patchMaterialLine(groupKey: string, lineId: string, patch: Partial<PreparedMaterialLine>) {
    setScope((s) => {
      const list = s.materials?.[groupKey];
      if (!list) return s;
      return { ...s, materials: { ...s.materials, [groupKey]: { ...list, lines: list.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) } } };
    });
    setDirty(true);
  }

  function removeMaterialLine(groupKey: string, lineId: string) {
    setScope((s) => {
      const list = s.materials?.[groupKey];
      if (!list) return s;
      return { ...s, materials: { ...s.materials, [groupKey]: { ...list, lines: list.lines.filter((l) => l.id !== lineId) } } };
    });
    setDirty(true);
  }

  async function itemize(groupKeys: string[], clear: string[] = []) {
    setItemizing(groupKeys.length === 1 ? groupKeys[0] : groupKeys.length > 1 ? "all" : clear[0] ?? "all");
    try {
      const res = await fetch(`/api/v1/estimates/${estimateId}/prepared-scope/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepared_scope: scope, group_keys: groupKeys, clear }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error?.message ?? "Materials could not be listed");
        return;
      }
      setScope(data.prepared_scope);
      setDirty(false);
      const failed = (data.failed ?? []) as Array<{ group_key: string }>;
      if (failed.length > 0) toast.error(`${failed.length} area(s) could not be listed and keep their allowance.`);
      else if (groupKeys.length > 0) toast.success("Materials listed. Apply to quote to update the lines and buy list.");
    } catch {
      toast.error("Materials could not be listed. Your edits are still on this page.");
    } finally {
      setItemizing(null);
    }
  }

  // Revise with a note (TASK-186): proposal held here until the owner keeps or discards it.
  const [note, setNote] = useState("");
  const [revising, setRevising] = useState(false);
  const [proposal, setProposal] = useState<RevisionProposal | null>(null);
  const proposedAreas = useMemo(
    () => (proposal ? workAreaRows(proposal.proposed_scope, laborRateCents) : null),
    [proposal, laborRateCents],
  );

  async function revise(accept: boolean) {
    setRevising(true);
    try {
      const res = await fetch(`/api/v1/estimates/${estimateId}/prepared-scope/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepared_scope: scope,
          instruction: note,
          ...(accept && proposal ? { accept: { output: proposal.output } } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error?.message ?? "Revision failed");
        return;
      }
      setScope(data.prepared_scope);
      setDirty(false);
      if (accept) {
        setProposal(null);
        setNote("");
        toast.success("Changes kept. Apply to quote to update the lines.");
      } else {
        setProposal(data as RevisionProposal);
      }
    } catch {
      toast.error("Revision failed. Your edits are still on this page.");
    } finally {
      setRevising(false);
    }
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

  const openQuestionList = scope.questions.filter((q) => !q.answer?.trim());
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
        {areas.rows.length === 0 && (
          <p style={{ margin: "var(--space-2) 0" }} data-testid="prepared-scope-empty">
            No work is listed on this draft
            {scope.groups.length > 0 ? ` for ${scope.groups.map((g) => g.label).join(", ")}` : ""}. It was prepared
            without the AI. Delete this draft and press Prepare Quote on the assessment again once the AI is available.
          </p>
        )}
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
                <span style={{ textAlign: "right" }}>
                  {formatCents(area.materials_cents)}
                  <span style={{ ...label, display: "block" }}>{area.materials_itemized ? "itemized" : "allowance"}</span>
                </span>
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
                        {[t.room_id ? roomNames[t.room_id] ?? null : "Whole job", methodLabel(t.method), kindLabel(t.kind), t.quantity ? quantityLabel(t.quantity) : null, t.confirmed ? null : "not included"]
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
                    {(t.estimate_notes ?? []).map((n, i) => (
                      <span key={i} style={{ ...label, flex: "1 1 100%", color: n.kind === "missing" ? "var(--warning, var(--fg))" : undefined }}>
                        {n.kind === "missing" ? "Missing: " : n.kind === "limitation" ? "Limitation: " : "Assumed: "}{n.text}
                      </span>
                    ))}
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
                  <MaterialsList
                    list={scope.materials?.[area.key] ?? null}
                    stale={area.materials_stale}
                    editable={editable}
                    busy={itemizing !== null}
                    itemizingThis={itemizing === area.key}
                    onItemize={() => itemize([area.key])}
                    onClear={() => itemize([], [area.key])}
                    onEditLine={(lineId, patch) => patchMaterialLine(area.key, lineId, patch)}
                    onRemoveLine={(lineId) => removeMaterialLine(area.key, lineId)}
                  />
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
        {editable && areas.rows.some((r) => !r.materials_itemized) && (
          <Button variant="secondary" onClick={() => itemize(areas.rows.filter((r) => !r.materials_itemized).map((r) => r.key))} disabled={itemizing !== null || revising}>
            {itemizing === "all" ? "Listing materials…" : "Itemize materials for every area"}
          </Button>
        )}
      </div>

      {editable && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)", marginTop: "var(--space-3)" }} data-testid="revise-box">
          <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)" }}>Revise with a note</h3>
          {openQuestionList.map((q) => (
            <div key={q.id} style={{ marginBottom: "var(--space-2)" }}>
              <span style={label}>{q.text}</span>
              <input className="p7-input" type="text" value={q.answer ?? ""} placeholder="Answer" disabled={revising || !!proposal}
                onChange={(e) => answer(q.id, e.target.value)} />
            </div>
          ))}
          <textarea
            className="p7-input"
            rows={3}
            maxLength={2000}
            value={note}
            disabled={revising || !!proposal}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For example: the vanity comes out easily, keep the subfloor allowance, and show sheet vinyl against LVP."
            style={{ width: "100%" }}
          />
          {!proposal && (
            <Button variant="secondary" onClick={() => revise(false)} disabled={revising || saving !== null}>
              {revising ? "Revising…" : "Revise"}
            </Button>
          )}
          {proposal && (
            <div style={{ marginTop: "var(--space-2)" }} data-testid="revision-proposal">
              <p style={{ margin: "0 0 var(--space-2)" }}>{proposal.summary}</p>
              {proposal.changes.length === 0 ? (
                <p style={label}>No task changes.</p>
              ) : (
                <ul style={{ margin: "0 0 var(--space-2)", paddingLeft: "var(--space-4)" }}>
                  {proposal.changes.map((c) => (
                    <li key={`${c.action}-${c.task_id}`} style={{ marginBottom: "var(--space-1)" }}>
                      {changeLine(c)}
                      {c.reason && <span style={{ ...label, display: "block" }}>{c.reason}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {proposedAreas && (
                <p style={{ margin: "0 0 var(--space-2)", fontWeight: 600 }}>
                  Total {formatCents(areas.total_cents)} → {formatCents(proposedAreas.total_cents)}
                </p>
              )}
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <Button onClick={() => revise(true)} disabled={revising}>{revising ? "Saving…" : "Keep changes"}</Button>
                <Button variant="secondary" onClick={() => setProposal(null)} disabled={revising}>Discard</Button>
              </div>
            </div>
          )}
        </div>
      )}

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

const SOURCE_LABEL: Record<PreparedMaterialLine["source"], string> = {
  your_price: "your price",
  ai_estimate: "AI estimate",
  owner: "yours",
};

/** One work area's itemized materials (TASK-187), or the button to list them. */
function MaterialsList({
  list, stale, editable, busy, itemizingThis, onItemize, onClear, onEditLine, onRemoveLine,
}: {
  list: PreparedMaterialList | null;
  stale: boolean;
  editable: boolean;
  busy: boolean;
  itemizingThis: boolean;
  onItemize: () => void;
  onClear: () => void;
  onEditLine: (lineId: string, patch: Partial<PreparedMaterialLine>) => void;
  onRemoveLine: (lineId: string) => void;
}) {
  if (!list) {
    return editable ? (
      <div style={{ paddingLeft: "var(--space-5)", marginTop: "var(--space-2)" }}>
        <Button variant="secondary" size="sm" onClick={onItemize} disabled={busy}>
          {itemizingThis ? "Listing materials…" : "Itemize materials"}
        </Button>
        <span style={{ ...label, display: "block" }}>Lists what to buy, priced from your saved materials first. Replaces the allowance.</span>
      </div>
    ) : null;
  }
  const total = list.lines.reduce((s, l) => s + (materialLineCents(l) ?? 0), 0);
  return (
    <div style={{ paddingLeft: "var(--space-5)", marginTop: "var(--space-2)" }} data-testid="materials-list">
      <span style={{ ...label, fontWeight: 600 }}>Materials · {formatCents(total)}</span>
      {stale && <span style={{ ...label, display: "block" }}>Made before the tasks changed. Itemize again to update it.</span>}
      {list.lines.map((l) => (
        <div key={l.id} style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end", flexWrap: "wrap", marginTop: "var(--space-1)" }}>
          <span style={{ flex: "2 1 160px" }}>
            {l.name}
            <span style={{ ...label, display: "block" }}>{l.unit_cost_cents === null ? "not priced" : SOURCE_LABEL[l.source]}{l.notes ? ` · ${l.notes}` : ""}</span>
          </span>
          <label style={{ flex: "0 1 80px" }}>
            <span style={label}>Qty ({l.unit})</span>
            <input className="p7-input" type="number" min="0" step="any" inputMode="decimal" value={l.quantity} disabled={!editable}
              onChange={(e) => onEditLine(l.id, { quantity: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label style={{ flex: "0 1 90px" }}>
            <span style={label}>Each $</span>
            <input className="p7-input" type="number" min="0" step="0.01" inputMode="decimal" value={dollarsValue(l.unit_cost_cents)} placeholder="Price" disabled={!editable}
              onChange={(e) => onEditLine(l.id, { unit_cost_cents: parseDollars(e.target.value) })} />
          </label>
          {editable && (
            <button type="button" onClick={() => onRemoveLine(l.id)} aria-label={`Remove ${l.name}`}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)" }}>✕</button>
          )}
        </div>
      ))}
      {list.customer_supplied.length > 0 && <span style={{ ...label, display: "block", marginTop: "var(--space-1)" }}>Customer supplies: {list.customer_supplied.join(", ")}</span>}
      {list.assumptions.length > 0 && <span style={{ ...label, display: "block" }}>Assumed: {list.assumptions.join("; ")}</span>}
      {editable && (
        <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)", flexWrap: "wrap" }}>
          <Button variant="secondary" size="sm" onClick={onItemize} disabled={busy}>{itemizingThis ? "Listing materials…" : "Itemize again"}</Button>
          <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>Use the allowance instead</Button>
        </div>
      )}
    </div>
  );
}
