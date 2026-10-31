"use client";

import { useEffect, useState } from "react";
import { Button, Input, useToast } from "@/components/ui";
import { modifierLabel, rateConversionLabel } from "@/lib/estimates/production-rate-display";
import type { ProductionRateRow } from "@/lib/db/production-rates";

const muted: React.CSSProperties = { color: "var(--fg-muted)", fontSize: "var(--text-xs)" };

/**
 * Production rates and their modifiers (TASK-193). Owner and admin edit the
 * pace and mark each one calibrated once real jobs back it up. Saved quotes
 * keep their hours; only new calculations use a changed rate.
 */
export function ProductionRatesPanel({ initialRates, initialHoursPerDay }: { initialRates?: ProductionRateRow[]; initialHoursPerDay?: number }) {
  const toast = useToast();
  const [rates, setRates] = useState<ProductionRateRow[] | null>(initialRates ?? null);
  const [hoursPerDay, setHoursPerDay] = useState(initialHoursPerDay ?? 8);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (initialRates) return;
    void (async () => {
      const res = await fetch("/api/v1/production-rates");
      const json = (await res.json().catch(() => ({}))) as { data?: { rates: ProductionRateRow[]; hours_per_day: number } };
      if (res.ok && json.data) {
        setRates(json.data.rates);
        setHoursPerDay(json.data.hours_per_day);
      } else {
        toast.error("Could not load production rates");
      }
    })();
  }, [initialRates, toast]);

  async function save(path: string, key: string, body: Record<string, unknown>, apply: (after: Record<string, unknown>) => void) {
    setBusy(key);
    try {
      const res = await fetch(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>; error?: { message?: string } };
      if (!res.ok || !json.data) {
        toast.error(json.error?.message ?? "Save failed");
        return;
      }
      apply(json.data);
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
    } finally {
      setBusy(null);
    }
  }

  function patchRate(id: string, after: Record<string, unknown>) {
    setRates((rs) => rs?.map((r) => (r.id === id ? { ...r, ...after } : r)) ?? rs);
  }

  function patchModifier(rateId: string, modId: string, after: Record<string, unknown>) {
    setRates(
      (rs) =>
        rs?.map((r) =>
          r.id === rateId ? { ...r, modifiers: r.modifiers.map((m) => (m.id === modId ? { ...m, ...after } : m)) } : r,
        ) ?? rs,
    );
  }

  if (!rates) return <p style={muted}>Loading production rates…</p>;

  return (
    <div data-testid="production-rates" style={{ display: "grid", gap: "var(--space-4)" }}>
      <p style={{ ...muted, margin: 0 }}>
        How fast each kind of work goes. Prepare Quote turns measurements into hours with these. Mark a rate calibrated
        once your own jobs back it up. Changing a rate never changes hours on quotes already saved.
      </p>
      {rates.map((r) => {
        const draft = drafts[r.id];
        return (
          <div key={r.id} style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)", display: "grid", gap: "var(--space-2)" }}>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "baseline" }}>
              <strong>{r.service_code}</strong>
              <span>{r.service_name ?? r.scope_component_key}</span>
              <span style={muted}>{rateConversionLabel(r, hoursPerDay)}</span>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ display: "grid", gap: 2, flex: "0 1 160px" }}>
                <span style={muted}>Rate ({r.rate_unit.replace(/_/g, " ")})</span>
                <Input
                  id={`rate-${r.id}`}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={draft ?? String(r.base_rate)}
                  onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                />
              </label>
              {draft !== undefined && Number(draft) > 0 && Number(draft) !== r.base_rate && (
                <Button
                  variant="secondary"
                  loading={busy === r.id}
                  onClick={() => save(`/api/v1/production-rates/${r.id}`, r.id, { base_rate: Number(draft) }, (a) => patchRate(r.id, a))}
                >
                  Save rate
                </Button>
              )}
              <label style={{ display: "flex", gap: "var(--space-1)", alignItems: "center", fontSize: "var(--text-sm)" }}>
                <input
                  type="checkbox"
                  checked={r.calibrated}
                  disabled={busy !== null}
                  onChange={(e) => save(`/api/v1/production-rates/${r.id}`, `${r.id}:cal`, { calibrated: e.target.checked }, (a) => patchRate(r.id, a))}
                />
                Calibrated{r.calibrated && r.calibrated_at ? ` (${new Date(r.calibrated_at).toLocaleDateString()})` : ""}
              </label>
            </div>
            {r.notes && <p style={{ ...muted, margin: 0 }}>{r.notes}</p>}
            {r.modifiers.length > 0 && (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-1)", paddingLeft: "var(--space-3)" }}>
                {r.modifiers.map((m) => {
                  const key = `mod:${m.id}`;
                  const mDraft = drafts[key];
                  return (
                    <li key={m.id} style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ minWidth: 150 }}>{m.complexity_factor_key.replace(/_/g, " ")}</span>
                      <Input
                        id={`modifier-${m.id}`}
                        type="number"
                        step="1"
                        aria-label={`${m.complexity_factor_key} percent`}
                        style={{ width: 90 }}
                        value={mDraft ?? String(Math.round(m.modifier_pct * 1000) / 10)}
                        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                      />
                      <span style={muted}>% {modifierLabel(m.modifier_pct)}</span>
                      {mDraft !== undefined && mDraft.trim() !== "" && Number(mDraft) / 100 !== m.modifier_pct && (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={busy === key}
                          onClick={() =>
                            save(`/api/v1/production-rates/modifiers/${m.id}`, key, { modifier_pct: Number(mDraft) / 100 }, (a) => patchModifier(r.id, m.id, a))
                          }
                        >
                          Save
                        </Button>
                      )}
                      <label style={{ display: "flex", gap: "var(--space-1)", alignItems: "center", fontSize: "var(--text-sm)" }}>
                        <input
                          type="checkbox"
                          checked={m.calibrated}
                          disabled={busy !== null}
                          onChange={(e) =>
                            save(`/api/v1/production-rates/modifiers/${m.id}`, `${key}:cal`, { calibrated: e.target.checked }, (a) => patchModifier(r.id, m.id, a))
                          }
                        />
                        Calibrated
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
