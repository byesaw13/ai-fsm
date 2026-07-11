"use client";

/**
 * Compact travel recommendation for wizards / create forms.
 * Auto-calculates when property (or destination) + client change.
 * Does not persist — parent applies after entity create or via onAccept.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TRAVEL_CHARGE_MODE_LABELS,
  TRAVEL_POLICY_TIER_LABELS,
  type TravelChargeMode,
  type TravelPolicyTier,
  type TripDirectionMode,
} from "@ai-fsm/domain";
import { formatCents } from "@ai-fsm/money";

export interface TravelRecommendationValue {
  charge_mode: TravelChargeMode;
  total_travel_charge_cents: number;
  recommended_total_cents: number;
  one_way_miles: number;
  one_way_minutes: number;
  policy_tier: TravelPolicyTier;
  trip_count: number;
  trip_direction: TripDirectionMode;
  override_reason: string | null;
  custom_total_cents: number | null;
  manual_one_way_miles: number | null;
  manual_one_way_minutes: number | null;
  accepted: boolean;
}

export interface TravelRecommendationProps {
  propertyId?: string | null;
  clientId?: string | null;
  projectValueCents?: number | null;
  /** When true, auto-fetch as soon as property is set. Default true. */
  autoCalculate?: boolean;
  /** Compact banner mode for property-assign prompts. */
  variant?: "full" | "banner";
  disabled?: boolean;
  /** Called when owner accepts / updates travel choice. */
  onChange?: (value: TravelRecommendationValue | null) => void;
  /** Called only when a non-local tier is first detected (for toast/prompt). */
  onNonLocalDetected?: (tier: TravelPolicyTier, totalCents: number) => void;
  className?: string;
}

interface CalcPayload {
  calculation: {
    one_way_miles: number;
    round_trip_miles: number;
    one_way_minutes: number;
    round_trip_minutes: number;
    billable_miles: number;
    included_miles: number;
    mileage_rate_cents: number;
    mileage_charge_cents: number;
    billable_travel_minutes: number;
    travel_time_rate_cents: number;
    travel_time_charge_cents: number;
    recommended_total_cents: number;
    total_travel_charge_cents: number;
    policy_tier: TravelPolicyTier;
    policy_tier_label: string;
    trip_count: number;
    trip_direction: TripDirectionMode;
    client_rule: string;
    relationship_type: string;
    owner_review_required: boolean;
    warnings: Array<{ code: string; message: string; severity: string }>;
  };
  origin_address: string;
  destination_address: string;
  geocode_failed: boolean;
  distance_error?: string;
}

const TIER_COLORS: Record<string, string> = {
  local: "var(--color-success, #15803d)",
  extended: "var(--color-warning, #b45309)",
  distant: "var(--color-warning, #b45309)",
  long_distance: "var(--color-danger, #b91c1c)",
};

function dollarsFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function TravelRecommendation({
  propertyId,
  clientId,
  projectValueCents,
  autoCalculate = true,
  variant = "full",
  disabled = false,
  onChange,
  onNonLocalDetected,
  className,
}: TravelRecommendationProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<CalcPayload | null>(null);
  const [chargeMode, setChargeMode] = useState<TravelChargeMode>("separate_line");
  const [customDollars, setCustomDollars] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [manualMiles, setManualMiles] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastPropertyRef = useRef<string | null>(null);
  const nonLocalFiredRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onNonLocalRef = useRef(onNonLocalDetected);
  onNonLocalRef.current = onNonLocalDetected;

  const emit = useCallback(
    (
      calc: CalcPayload["calculation"] | null,
      mode: TravelChargeMode,
      acceptedFlag: boolean,
      custom: string,
      reason: string,
      miles: string,
      minutes: string
    ) => {
      if (!calc || !acceptedFlag) {
        onChangeRef.current?.(null);
        return;
      }
      const customCents =
        mode === "custom" && custom
          ? Math.round(parseFloat(custom) * 100)
          : null;
      const total =
        mode === "waive"
          ? 0
          : mode === "custom" && customCents != null
            ? customCents
            : calc.recommended_total_cents;
      onChangeRef.current?.({
        charge_mode: mode,
        total_travel_charge_cents: total,
        recommended_total_cents: calc.recommended_total_cents,
        one_way_miles: calc.one_way_miles,
        one_way_minutes: calc.one_way_minutes,
        policy_tier: calc.policy_tier,
        trip_count: calc.trip_count,
        trip_direction: calc.trip_direction,
        override_reason: reason.trim() || null,
        custom_total_cents: customCents,
        manual_one_way_miles: miles ? parseFloat(miles) : null,
        manual_one_way_minutes: minutes ? parseInt(minutes, 10) : null,
        accepted: true,
      });
    },
    []
  );

  const calculate = useCallback(async () => {
    if (!propertyId) {
      setData(null);
      setAccepted(false);
      onChangeRef.current?.(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/travel/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: propertyId,
          client_id: clientId || null,
          project_value_cents: projectValueCents ?? null,
          charge_mode: chargeMode,
          custom_total_cents:
            chargeMode === "custom" && customDollars
              ? Math.round(parseFloat(customDollars) * 100)
              : null,
          manual_one_way_miles: manualMiles ? parseFloat(manualMiles) : null,
          manual_one_way_minutes: manualMinutes ? parseInt(manualMinutes, 10) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Travel calculation failed");
        setData(null);
        return;
      }
      const payload = json.data as CalcPayload;
      setData(payload);
      setDismissed(false);

      const tier = payload.calculation.policy_tier;
      const key = `${propertyId}:${tier}`;
      if (tier !== "local" && nonLocalFiredRef.current !== key) {
        nonLocalFiredRef.current = key;
        onNonLocalRef.current?.(tier, payload.calculation.recommended_total_cents);
      }

      // Auto-accept local (zero) so owner is not blocked; non-local needs explicit accept
      if (tier === "local" || payload.calculation.recommended_total_cents === 0) {
        setAccepted(true);
        setChargeMode("separate_line");
        emit(payload.calculation, "separate_line", true, customDollars, overrideReason, manualMiles, manualMinutes);
      } else if (accepted) {
        emit(payload.calculation, chargeMode, true, customDollars, overrideReason, manualMiles, manualMinutes);
      }
    } catch {
      setError("Network error calculating travel");
    } finally {
      setLoading(false);
    }
  }, [
    propertyId,
    clientId,
    projectValueCents,
    chargeMode,
    customDollars,
    manualMiles,
    manualMinutes,
    accepted,
    emit,
    overrideReason,
  ]);

  // Auto-calc when property changes
  useEffect(() => {
    if (!autoCalculate) return;
    if (!propertyId) {
      lastPropertyRef.current = null;
      setData(null);
      setAccepted(false);
      onChangeRef.current?.(null);
      return;
    }
    if (lastPropertyRef.current === propertyId) return;
    lastPropertyRef.current = propertyId;
    setAccepted(false);
    void calculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on property change
  }, [propertyId, autoCalculate]);

  // Recalc when client changes with same property
  useEffect(() => {
    if (!autoCalculate || !propertyId || !clientId) return;
    if (lastPropertyRef.current !== propertyId) return;
    void calculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function accept(mode: TravelChargeMode = chargeMode) {
    if (!data) return;
    if ((mode === "waive" || mode === "custom") && !overrideReason.trim()) {
      setError("Add a reason for waive or custom amount");
      return;
    }
    setChargeMode(mode);
    setAccepted(true);
    setError("");
    emit(
      data.calculation,
      mode,
      true,
      customDollars,
      overrideReason,
      manualMiles,
      manualMinutes
    );
  }

  function clear() {
    setAccepted(false);
    setChargeMode("separate_line");
    setOverrideReason("");
    setCustomDollars("");
    onChangeRef.current?.(null);
  }

  if (!propertyId) {
    if (variant === "banner") return null;
    return (
      <div
        className={className}
        data-testid="travel-recommendation-empty"
        style={{
          padding: "var(--space-3)",
          border: "1px dashed var(--border)",
          borderRadius: "var(--radius-md)",
          fontSize: "var(--text-sm)",
          color: "var(--fg-muted)",
        }}
      >
        Select a property to calculate travel automatically.
      </div>
    );
  }

  if (dismissed && variant === "banner") return null;

  const calc = data?.calculation;
  const tier = calc?.policy_tier;
  const isLocal = tier === "local" || (calc?.recommended_total_cents ?? 0) === 0;

  if (variant === "banner") {
    if (loading) {
      return (
        <div
          data-testid="travel-recommendation-banner"
          style={{
            padding: "var(--space-2) var(--space-3)",
            background: "var(--color-slate-50, #f8fafc)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--text-sm)",
            color: "var(--fg-muted)",
          }}
        >
          Calculating travel…
        </div>
      );
    }
    if (!calc || isLocal) return null;
    return (
      <div
        data-testid="travel-recommendation-banner"
        className={className}
        style={{
          padding: "var(--space-3)",
          background: "var(--color-amber-50, #fffbeb)",
          border: "1px solid var(--color-warning, #f59e0b)",
          borderRadius: "var(--radius-md)",
          fontSize: "var(--text-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <strong style={{ color: TIER_COLORS[tier!] }}>
              {TRAVEL_POLICY_TIER_LABELS[tier!]}
            </strong>
            <div style={{ color: "var(--fg-muted)", marginTop: 2 }}>
              {calc.one_way_miles} mi one-way · recommended{" "}
              <strong style={{ color: "var(--fg)" }}>{formatCents(calc.recommended_total_cents)}</strong>
            </div>
            {calc.owner_review_required && (
              <div style={{ color: "var(--color-danger)", marginTop: 2, fontWeight: 600 }}>
                Owner review required
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!accepted ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={disabled}
                  onClick={() => accept("separate_line")}
                  data-testid="travel-banner-accept"
                >
                  Add travel
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={disabled}
                  onClick={() => {
                    setChargeMode("waive");
                    // expand to full would need reason — set accepted waive only with reason
                    setDismissed(true);
                    clear();
                  }}
                >
                  Dismiss
                </button>
              </>
            ) : (
              <span style={{ fontWeight: 600, color: "var(--color-success, #15803d)" }}>
                ✓ {TRAVEL_CHARGE_MODE_LABELS[chargeMode]} ·{" "}
                {formatCents(
                  chargeMode === "waive"
                    ? 0
                    : chargeMode === "custom" && customDollars
                      ? Math.round(parseFloat(customDollars) * 100)
                      : calc.recommended_total_cents
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Full wizard panel
  return (
    <div
      className={className}
      data-testid="travel-recommendation"
      style={{
        padding: "var(--space-4)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "var(--text-base)" }}>Travel recommendation</h3>
          <p style={{ margin: "4px 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
            Calculated from business origin to the job property. Editable before create.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void calculate()}
          disabled={disabled || loading}
          data-testid="travel-rec-recalc"
        >
          {loading ? "Calculating…" : "Recalculate"}
        </button>
      </div>

      {error && (
        <p style={{ margin: 0, color: "var(--color-danger)", fontSize: "var(--text-sm)" }} role="alert">
          {error}
        </p>
      )}

      {data?.geocode_failed && (
        <p style={{ margin: 0, color: "var(--color-warning)", fontSize: "var(--text-sm)" }}>
          {data.distance_error ?? "Could not geocode — enter miles manually below."}
        </p>
      )}

      {calc && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              padding: "var(--space-3)",
              background: "var(--color-slate-50, #f8fafc)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: TIER_COLORS[calc.policy_tier] }}>
                {calc.policy_tier_label}
              </div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginTop: 4 }}>
                {calc.one_way_miles} mi one-way · {calc.round_trip_miles} mi RT ·{" "}
                {Math.round(calc.round_trip_minutes)} min RT
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
                {data.origin_address} → {data.destination_address}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
                Billable {calc.billable_miles} mi @ {formatCents(calc.mileage_rate_cents)}/mi
                {calc.billable_travel_minutes > 0
                  ? ` · travel time ${calc.billable_travel_minutes} min @ ${formatCents(calc.travel_time_rate_cents)}/hr`
                  : ""}
              </div>
              {calc.client_rule !== "standard_policy" && (
                <div style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>
                  Customer rule: {calc.relationship_type} / {calc.client_rule}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "var(--text-lg)" }}>
                {formatCents(calc.recommended_total_cents)}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>recommended</div>
            </div>
          </div>

          {calc.warnings.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--text-sm)" }}>
              {calc.warnings.map((w) => (
                <li
                  key={w.code + w.message}
                  style={{
                    color:
                      w.severity === "critical"
                        ? "var(--color-danger)"
                        : w.severity === "warning"
                          ? "var(--color-warning)"
                          : "var(--fg-muted)",
                  }}
                >
                  {w.message}
                </li>
              ))}
            </ul>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: "var(--space-2)",
            }}
          >
            <label className="form-group" style={{ margin: 0, gridColumn: "1 / -1" }}>
              <span style={{ fontSize: "var(--text-xs)" }}>How to charge</span>
              <select
                value={chargeMode}
                disabled={disabled}
                onChange={(e) => {
                  const m = e.target.value as TravelChargeMode;
                  setChargeMode(m);
                  if (accepted) accept(m);
                }}
                data-testid="travel-rec-charge-mode"
              >
                {(Object.keys(TRAVEL_CHARGE_MODE_LABELS) as TravelChargeMode[]).map((k) => (
                  <option key={k} value={k}>
                    {TRAVEL_CHARGE_MODE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <span style={{ fontSize: "var(--text-xs)" }}>Manual mi (one-way)</span>
              <input
                type="number"
                min={0}
                step={0.1}
                placeholder="Auto"
                value={manualMiles}
                disabled={disabled}
                onChange={(e) => setManualMiles(e.target.value)}
              />
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <span style={{ fontSize: "var(--text-xs)" }}>Manual minutes</span>
              <input
                type="number"
                min={0}
                placeholder="Auto"
                value={manualMinutes}
                disabled={disabled}
                onChange={(e) => setManualMinutes(e.target.value)}
              />
            </label>
            {chargeMode === "custom" && (
              <label className="form-group" style={{ margin: 0 }}>
                <span style={{ fontSize: "var(--text-xs)" }}>Custom total ($)</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={customDollars}
                  disabled={disabled}
                  onChange={(e) => setCustomDollars(e.target.value)}
                  placeholder={dollarsFromCents(calc.recommended_total_cents)}
                />
              </label>
            )}
            {(chargeMode === "waive" || chargeMode === "custom") && (
              <label className="form-group" style={{ margin: 0, gridColumn: "1 / -1" }}>
                <span style={{ fontSize: "var(--text-xs)" }}>Override / waiver reason</span>
                <input
                  type="text"
                  value={overrideReason}
                  disabled={disabled}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Required for waive or custom"
                  data-testid="travel-rec-reason"
                />
              </label>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {!accepted ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={disabled || loading}
                onClick={() => accept(chargeMode)}
                data-testid="travel-rec-accept"
              >
                {isLocal
                  ? "Confirm local (included)"
                  : chargeMode === "waive"
                    ? "Confirm waiver"
                    : `Accept ${formatCents(
                        chargeMode === "custom" && customDollars
                          ? Math.round(parseFloat(customDollars) * 100)
                          : calc.recommended_total_cents
                      )}`}
              </button>
            ) : (
              <>
                <span
                  style={{ fontWeight: 600, color: "var(--color-success, #15803d)", fontSize: "var(--text-sm)" }}
                  data-testid="travel-rec-accepted"
                >
                  ✓ {TRAVEL_CHARGE_MODE_LABELS[chargeMode]}
                  {chargeMode !== "waive" && chargeMode !== "include_in_labor"
                    ? ` · ${formatCents(
                        chargeMode === "custom" && customDollars
                          ? Math.round(parseFloat(customDollars) * 100)
                          : calc.recommended_total_cents
                      )}`
                    : chargeMode === "include_in_labor"
                      ? ` · ${formatCents(calc.recommended_total_cents)} in labor`
                      : ""}
                </span>
                <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={clear}>
                  Change
                </button>
              </>
            )}
            {(manualMiles || manualMinutes) && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={disabled || loading}
                onClick={() => void calculate()}
              >
                Apply manual distance
              </button>
            )}
          </div>
        </>
      )}

      {loading && !calc && (
        <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>Calculating…</p>
      )}
    </div>
  );
}

/** Apply a saved recommendation to a newly created estimate. */
export async function applyTravelRecommendationToEstimate(
  estimateId: string,
  value: TravelRecommendationValue
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/v1/estimates/${estimateId}/travel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      charge_mode: value.charge_mode,
      custom_total_cents: value.custom_total_cents,
      trip_count: value.trip_count,
      trip_direction: value.trip_direction,
      manual_one_way_miles: value.manual_one_way_miles,
      manual_one_way_minutes: value.manual_one_way_minutes,
      override_reason: value.override_reason,
      recalculate: true,
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    return { ok: false, error: j.error?.message ?? "Failed to apply travel" };
  }
  return { ok: true };
}

/** Apply travel snapshot to a work order (persist recommendation only — no line item). */
export async function applyTravelRecommendationToWorkOrder(
  workOrderId: string,
  value: TravelRecommendationValue,
  opts?: { propertyId?: string | null; clientId?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/v1/work-orders/${workOrderId}/travel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      charge_mode: value.charge_mode,
      custom_total_cents: value.custom_total_cents,
      trip_count: value.trip_count,
      trip_direction: value.trip_direction,
      manual_one_way_miles: value.manual_one_way_miles,
      manual_one_way_minutes: value.manual_one_way_minutes,
      override_reason: value.override_reason,
      property_id: opts?.propertyId ?? null,
      client_id: opts?.clientId ?? null,
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    return { ok: false, error: j.error?.message ?? "Failed to apply travel" };
  }
  return { ok: true };
}
