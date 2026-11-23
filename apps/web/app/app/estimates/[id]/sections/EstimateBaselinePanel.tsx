"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BaselineResult } from "@ai-fsm/domain";
import { useQuoteVersion, rememberQuoteVersion } from "@/components/QuoteVersion";
import { OPTION_BASELINE_NOTE } from "@/lib/estimates/stored-hours";
import { Button } from "@/components/ui";

const HOURS_NOT_RECORDED = "Hours not recorded";

const SOURCE_LABELS: Record<string, string> = {
  owner: "you",
  price_book: "price book",
  production_rate: "production rate",
  ai_allowance: "AI estimate",
  revision: "revision",
  travel_calc: "travel calculation",
};

function dollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hoursFmt(h: number): string {
  return h.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export type BaselinePanelProps =
  | { mode: "option" }
  | { mode: "not_recorded" }
  | {
      mode: "live" | "frozen";
      estimateId: string;
      result: BaselineResult;
      quotedCents: number;
      sellRateCents: number;
      costFloorCents: number;
      handlingPct: number;
      handlingOn: boolean;
      otherDirectCents: number | null;
      confirmed: boolean;
      sources: string[];
      parts: { materialsCostCents: number | null; equipmentCostCents: number | null; handlingCents: number | null };
      frozenAt?: string | null;
    };

const flag: React.CSSProperties = { fontSize: "var(--text-xs)", fontWeight: 600, padding: "2px 8px", borderRadius: 99, color: "var(--color-warning)", border: "1px solid color-mix(in srgb, var(--color-warning) 40%, transparent)" };

const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "var(--space-3)", fontSize: "var(--text-sm)" };

export function EstimateBaselinePanel(props: BaselinePanelProps) {
  if (props.mode === "option") {
    return (
      <div className="card" data-testid="baseline-panel">
        <h2>Hourly baseline</h2>
        <p className="muted" data-testid="baseline-option-note">{OPTION_BASELINE_NOTE}</p>
      </div>
    );
  }
  if (props.mode === "not_recorded") {
    return (
      <div className="card" data-testid="baseline-panel">
        <h2>Hourly baseline</h2>
        <p className="muted" data-testid="baseline-not-recorded">{HOURS_NOT_RECORDED}</p>
      </div>
    );
  }
  return <LiveBaseline {...props} />;
}

function LiveBaseline(props: Extract<BaselinePanelProps, { mode: "live" | "frozen" }>) {
  const { result, mode } = props;
  const editable = mode === "live";
  const router = useRouter();
  const { updatedAt, setUpdatedAt } = useQuoteVersion();
  const [otherDirect, setOtherDirect] = useState(
    props.otherDirectCents == null ? "" : String(props.otherDirectCents / 100),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoursMissing = result.missing.some((m) => m.kind === "hours");
  const costsMissing = result.missing.some((m) => m.kind !== "hours");

  async function save(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/estimates/${props.estimateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // The loaded version, so a save from a stale tab is refused (STALE_QUOTE) and asks for a reload.
        body: JSON.stringify(updatedAt ? { ...body, updated_at: updatedAt } : body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error?.message ?? "Could not save.");
        return;
      }
      rememberQuoteVersion(data, setUpdatedAt);
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function confirmCosts() {
    const raw = otherDirect.trim();
    const n = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      setError("Enter other direct costs in dollars, or 0.");
      return;
    }
    void save({ other_direct_cost_cents: Math.round(n * 100), direct_costs_confirmed: true });
  }

  return (
    <div className="card" data-testid="baseline-panel" id="baseline-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Hourly baseline</h2>
        <span style={{ display: "flex", gap: "var(--space-2)" }}>
          {hoursMissing && <span style={flag} data-testid="baseline-hours-incomplete">Hours incomplete</span>}
          {costsMissing && <span style={flag} data-testid="baseline-costs-unconfirmed">Costs not confirmed</span>}
        </span>
      </div>
      <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>
        {mode === "frozen"
          ? `Frozen when sent${props.frozenAt ? ` on ${new Date(props.frozenAt).toLocaleDateString()}` : ""}. Later changes in Settings do not change it.`
          : "A reference only. It never changes your price. Only you and admins see it."}
      </p>

      <div style={{ display: "grid", gap: "var(--space-1)", marginTop: "var(--space-3)" }}>
        <div style={row}>
          <span>Person-hours</span>
          <strong data-testid="baseline-hours">
            {result.hours
              ? `${hoursFmt(result.hours.low)}–${hoursFmt(result.hours.high)} h (mid ${hoursFmt(result.hours.mid)})`
              : "Hours incomplete"}
          </strong>
        </div>
        {result.hours && props.sources.length > 0 && (
          <div className="muted" style={{ fontSize: "var(--text-xs)", textAlign: "right" }}>
            From {props.sources.map((s) => SOURCE_LABELS[s] ?? s).join(", ")}
          </div>
        )}
        {result.baseline && (
          <div style={row}>
            <span>Baseline at {dollars(props.sellRateCents)}/h</span>
            <span data-testid="baseline-range">
              {dollars(result.baseline.low)} · <strong>{dollars(result.baseline.mid)}</strong> · {dollars(result.baseline.high)}
            </span>
          </div>
        )}
        <div style={row}>
          <span>Quoted (before tax)</span>
          <strong data-testid="baseline-quoted">{dollars(props.quotedCents)}</strong>
        </div>
        {result.gapCents != null && result.gapPct != null && (
          <div style={row}>
            <span>Gap to the midpoint</span>
            <strong
              data-testid="baseline-gap"
              style={{ color: result.warning === "strong" ? "var(--color-danger)" : result.warning === "below" ? "var(--color-warning)" : undefined }}
            >
              {result.gapCents >= 0 ? "+" : ""}{dollars(result.gapCents)} ({result.gapPct >= 0 ? "+" : ""}{result.gapPct.toFixed(2)}%)
            </strong>
          </div>
        )}
        {result.warning !== "none" && (
          <p
            data-testid={`baseline-warning-${result.warning}`}
            style={{ margin: 0, fontSize: "var(--text-sm)", color: result.warning === "strong" ? "var(--color-danger)" : "var(--color-warning)" }}
          >
            {result.warning === "strong"
              ? "Well below the baseline. Sending is still allowed."
              : "Below the baseline. Sending is still allowed."}
          </p>
        )}
        <div style={row}>
          <span>Labor rate after costs</span>
          <strong
            data-testid="baseline-effective-rate"
            style={{ color: result.belowCostFloor ? "var(--color-danger)" : undefined }}
          >
            {result.effectiveRateCents != null
              ? `${dollars(result.effectiveRateCents)}/h vs ${dollars(props.costFloorCents)}/h cost floor`
              : "Shown when hours and costs are complete"}
          </strong>
        </div>
        <div style={row}>
          <span>Materials cost</span>
          <span>{props.parts.materialsCostCents != null ? dollars(props.parts.materialsCostCents) : "Cost missing"}</span>
        </div>
        {props.parts.equipmentCostCents != null && props.parts.equipmentCostCents > 0 && (
          <div style={row}>
            <span>Equipment cost</span>
            <span>{dollars(props.parts.equipmentCostCents)}</span>
          </div>
        )}
        <div style={row}>
          <span>Handling ({props.handlingPct}%)</span>
          <span>
            {props.handlingOn
              ? props.parts.handlingCents != null ? `${dollars(props.parts.handlingCents)} in baseline` : "Cost missing"
              : "Not in baseline"}
          </span>
        </div>
      </div>

      {editable && (
        <div style={{ display: "grid", gap: "var(--space-3)", marginTop: "var(--space-4)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
          <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontSize: "var(--text-sm)" }}>
            <input
              type="checkbox"
              checked={props.handlingOn}
              disabled={saving}
              onChange={(e) => void save({ handling_in_baseline: e.target.checked })}
              data-testid="baseline-handling-toggle"
            />
            Include handling ({props.handlingPct}% of materials not marked up) in the baseline
          </label>
          <div style={{ display: "grid", gap: "var(--space-1)" }}>
            <label htmlFor="baseline-other-direct" style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
              Other direct costs ($)
            </label>
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
              Mileage cost, tolls, parking, disposal, permits. $0 is a fine answer.
            </span>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
              <input
                id="baseline-other-direct"
                className="p7-input"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={otherDirect}
                placeholder="0.00"
                disabled={saving}
                onChange={(e) => setOtherDirect(e.target.value)}
                style={{ maxWidth: 160 }}
                data-testid="baseline-other-direct"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={saving}
                onClick={confirmCosts}
                data-testid="baseline-confirm-costs"
              >
                {props.confirmed ? "Update and confirm" : "Confirm direct costs"}
              </Button>
              {props.confirmed && (
                <span className="muted" style={{ fontSize: "var(--text-xs)" }} data-testid="baseline-costs-confirmed">
                  Confirmed
                </span>
              )}
            </div>
          </div>
          {error && <p style={{ color: "var(--color-danger)", margin: 0, fontSize: "var(--text-sm)" }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
