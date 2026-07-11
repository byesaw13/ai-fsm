"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TRAVEL_CHARGE_MODE_LABELS,
  TRAVEL_POLICY_TIER_LABELS,
  type TravelChargeMode,
  type TravelPolicyTier,
  type TripCalculationMethod,
  type TripDirectionMode,
} from "@ai-fsm/domain";
import { formatCents } from "@ai-fsm/money";
import { Card, SectionHeader } from "@/components/ui";

interface Calculation {
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
}

interface SnapshotSummary {
  id: string;
  one_way_miles: number;
  round_trip_miles: number;
  total_travel_charge_cents: number;
  policy_tier: string;
  charge_mode: string;
  calculated_at: string;
  billable_miles: number;
  mileage_rate_cents: number;
  travel_time_rate_cents: number;
  billable_travel_minutes: number;
  mileage_charge_cents: number;
  travel_time_charge_cents: number;
  trip_count: number;
  origin_address: string;
  destination_address: string;
  override_reason: string | null;
  client_rule: string | null;
}

interface Props {
  entityType: "estimate" | "invoice";
  entityId: string;
  propertyId?: string | null;
  clientId?: string | null;
  projectValueCents?: number;
  /** When false, apply is disabled (approved estimate / non-draft invoice). */
  editable?: boolean;
  initialSnapshot?: SnapshotSummary | null;
}

function dollars(cents: number): string {
  return formatCents(cents);
}

function minsLabel(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

const TIER_COLORS: Record<string, string> = {
  local: "var(--color-success, #15803d)",
  extended: "var(--color-warning, #b45309)",
  distant: "var(--color-warning, #b45309)",
  long_distance: "var(--color-danger, #b91c1c)",
};

export function TravelPanel({
  entityType,
  entityId,
  propertyId,
  clientId,
  projectValueCents,
  editable = true,
  initialSnapshot = null,
}: Props) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<SnapshotSummary | null>(initialSnapshot);
  const [preview, setPreview] = useState<Calculation | null>(null);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [chargeMode, setChargeMode] = useState<TravelChargeMode>("separate_line");
  const [tripDirection, setTripDirection] = useState<TripDirectionMode>("round_trip");
  const [tripMethod, setTripMethod] = useState<TripCalculationMethod>("once_for_project");
  const [tripCount, setTripCount] = useState("1");
  const [manualMiles, setManualMiles] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [customTotal, setCustomTotal] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [billingMode, setBillingMode] = useState<"estimated" | "actual" | "none" | "custom">("estimated");
  const [ownerReviewApproved, setOwnerReviewApproved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [geocodeFailed, setGeocodeFailed] = useState(false);

  const applyUrl =
    entityType === "estimate"
      ? `/api/v1/estimates/${entityId}/travel`
      : `/api/v1/invoices/${entityId}/travel`;

  const loadExisting = useCallback(async () => {
    try {
      const res = await fetch(applyUrl);
      if (!res.ok) return;
      const json = await res.json();
      if (entityType === "estimate" && json.data) {
        setSnapshot(json.data as SnapshotSummary);
        if (json.charge_mode) setChargeMode(json.charge_mode);
      }
      if (entityType === "invoice" && json.data) {
        if (json.data.current) setSnapshot(json.data.current);
        if (json.data.billing_mode) setBillingMode(json.data.billing_mode);
      }
    } catch {
      /* ignore */
    }
  }, [applyUrl, entityType]);

  useEffect(() => {
    if (!initialSnapshot) void loadExisting();
  }, [initialSnapshot, loadExisting]);

  async function recalculate() {
    setPending(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        property_id: propertyId ?? null,
        client_id: clientId ?? null,
        project_value_cents: projectValueCents ?? null,
        trip_direction: tripDirection,
        trip_calculation_method: tripMethod,
        trip_count: tripMethod === "custom" || tripMethod === "once_for_project"
          ? parseInt(tripCount, 10) || 1
          : parseInt(tripCount, 10) || 1,
        planned_visits: parseInt(tripCount, 10) || 1,
        planned_workdays: parseInt(tripCount, 10) || 1,
        charge_mode: chargeMode,
        custom_total_cents:
          chargeMode === "custom" && customTotal
            ? Math.round(parseFloat(customTotal) * 100)
            : null,
        manual_one_way_miles: manualMiles ? parseFloat(manualMiles) : null,
        manual_one_way_minutes: manualMinutes ? parseInt(manualMinutes, 10) : null,
      };
      const res = await fetch("/api/v1/travel/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Calculation failed");
        return;
      }
      setPreview(json.data.calculation);
      setOrigin(json.data.origin_address);
      setDestination(json.data.destination_address);
      setGeocodeFailed(!!json.data.geocode_failed);
    } catch {
      setError("Network error during calculation");
    } finally {
      setPending(false);
    }
  }

  async function apply() {
    setPending(true);
    setError("");
    try {
      let body: Record<string, unknown>;
      if (entityType === "estimate") {
        body = {
          charge_mode: chargeMode,
          custom_total_cents:
            chargeMode === "custom" && customTotal
              ? Math.round(parseFloat(customTotal) * 100)
              : null,
          trip_count: parseInt(tripCount, 10) || 1,
          trip_direction: tripDirection,
          trip_calculation_method: tripMethod,
          planned_visits: parseInt(tripCount, 10) || 1,
          planned_workdays: parseInt(tripCount, 10) || 1,
          manual_one_way_miles: manualMiles ? parseFloat(manualMiles) : null,
          manual_one_way_minutes: manualMinutes ? parseInt(manualMinutes, 10) : null,
          override_reason: overrideReason.trim() || null,
          recalculate: true,
        };
      } else {
        body = {
          billing_mode: billingMode,
          recalculate: billingMode === "actual" || !!manualMiles,
          custom_total_cents:
            billingMode === "custom" && customTotal
              ? Math.round(parseFloat(customTotal) * 100)
              : null,
          trip_count: parseInt(tripCount, 10) || 1,
          trip_direction: tripDirection,
          manual_one_way_miles: manualMiles ? parseFloat(manualMiles) : null,
          manual_one_way_minutes: manualMinutes ? parseInt(manualMinutes, 10) : null,
          override_reason: overrideReason.trim() || null,
          owner_review_approved: ownerReviewApproved,
        };
      }
      const res = await fetch(applyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to apply travel");
        return;
      }
      setSnapshot(json.data.snapshot ?? json.data.current ?? null);
      setPreview(json.data.calculation ?? null);
      router.refresh();
    } catch {
      setError("Network error while applying travel");
    } finally {
      setPending(false);
    }
  }

  const display = preview;
  const tier = display?.policy_tier ?? (snapshot?.policy_tier as TravelPolicyTier | undefined);
  const tierLabel = tier
    ? TRAVEL_POLICY_TIER_LABELS[tier] ?? snapshot?.policy_tier
    : null;

  return (
    <Card data-testid="travel-panel" style={{ marginBottom: "var(--space-4)" }}>
      <SectionHeader title="Travel & Mileage" as="h2" />

      {snapshot && !display && (
        <div
          style={{
            marginBottom: "var(--space-3)",
            padding: "var(--space-3)",
            background: "var(--color-slate-50, #f8fafc)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--text-sm)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <strong style={{ color: TIER_COLORS[snapshot.policy_tier] ?? "inherit" }}>
                {TRAVEL_POLICY_TIER_LABELS[snapshot.policy_tier as TravelPolicyTier] ??
                  snapshot.policy_tier}
              </strong>
              <div style={{ color: "var(--fg-muted)", marginTop: 4 }}>
                {snapshot.one_way_miles} mi one-way · {snapshot.round_trip_miles} mi RT ·{" "}
                {snapshot.trip_count} trip{snapshot.trip_count === 1 ? "" : "s"}
              </div>
              <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginTop: 2 }}>
                Last calculated {new Date(snapshot.calculated_at).toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
              {dollars(snapshot.total_travel_charge_cents)}
            </div>
          </div>
          {snapshot.destination_address && (
            <div style={{ marginTop: 8, color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
              {snapshot.origin_address} → {snapshot.destination_address}
            </div>
          )}
        </div>
      )}

      {display && (
        <div
          style={{
            marginBottom: "var(--space-3)",
            padding: "var(--space-3)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--text-sm)",
          }}
          data-testid="travel-calculation-preview"
        >
          <div style={{ fontWeight: 700, color: TIER_COLORS[display.policy_tier], marginBottom: 8 }}>
            {tierLabel}
            {display.owner_review_required && (
              <span style={{ marginLeft: 8, color: "var(--color-danger)" }}>· Owner review</span>
            )}
          </div>
          <div style={{ color: "var(--fg-muted)", marginBottom: 8, fontSize: "var(--text-xs)" }}>
            {origin} → {destination}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <tbody>
              <Row label="One-way distance" value={`${display.one_way_miles} mi`} />
              <Row label="Round-trip distance" value={`${display.round_trip_miles} mi`} />
              <Row label="One-way drive time" value={minsLabel(display.one_way_minutes)} />
              <Row label="Round-trip drive time" value={minsLabel(display.round_trip_minutes)} />
              <Row label="Included mileage" value={`${display.included_miles} mi`} />
              <Row label="Billable mileage" value={`${display.billable_miles} mi`} />
              <Row
                label={`Mileage @ ${dollars(display.mileage_rate_cents)}/mi`}
                value={dollars(display.mileage_charge_cents)}
              />
              <Row
                label={`Travel time ${minsLabel(display.billable_travel_minutes)} @ ${dollars(display.travel_time_rate_cents)}/hr`}
                value={dollars(display.travel_time_charge_cents)}
              />
              <Row
                label="Recommended total"
                value={dollars(display.recommended_total_cents)}
                strong
              />
              <Row
                label="Charge (after options)"
                value={dollars(display.total_travel_charge_cents)}
                strong
              />
              <Row label="Customer rule" value={`${display.relationship_type} / ${display.client_rule}`} />
            </tbody>
          </table>
          {display.warnings.length > 0 && (
            <ul style={{ margin: "12px 0 0", paddingLeft: 18 }}>
              {display.warnings.map((w) => (
                <li
                  key={w.code + w.message}
                  style={{
                    color:
                      w.severity === "critical"
                        ? "var(--color-danger)"
                        : w.severity === "warning"
                          ? "var(--color-warning)"
                          : "var(--fg-muted)",
                    marginBottom: 4,
                  }}
                >
                  {w.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {geocodeFailed && (
        <p style={{ color: "var(--color-warning)", fontSize: "var(--text-sm)" }}>
          Address could not be geocoded — enter miles and minutes manually below.
        </p>
      )}

      {editable && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: "var(--space-3)",
            marginBottom: "var(--space-3)",
          }}
        >
          {entityType === "estimate" ? (
            <label className="form-group" style={{ gridColumn: "1 / -1" }}>
              <span>How to charge</span>
              <select
                value={chargeMode}
                onChange={(e) => setChargeMode(e.target.value as TravelChargeMode)}
                data-testid="travel-charge-mode"
              >
                {(Object.keys(TRAVEL_CHARGE_MODE_LABELS) as TravelChargeMode[]).map((k) => (
                  <option key={k} value={k}>
                    {TRAVEL_CHARGE_MODE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="form-group" style={{ gridColumn: "1 / -1" }}>
              <span>Invoice travel billing</span>
              <select
                value={billingMode}
                onChange={(e) =>
                  setBillingMode(e.target.value as "estimated" | "actual" | "none" | "custom")
                }
                data-testid="travel-billing-mode"
              >
                <option value="estimated">Use estimated travel</option>
                <option value="actual">Use actual travel (recalculate / logs)</option>
                <option value="none">No additional travel</option>
                <option value="custom">Custom adjustment</option>
              </select>
            </label>
          )}

          <label className="form-group">
            <span>Trip direction</span>
            <select
              value={tripDirection}
              onChange={(e) => setTripDirection(e.target.value as TripDirectionMode)}
            >
              <option value="round_trip">Round-trip</option>
              <option value="one_way">One-way</option>
            </select>
          </label>

          <label className="form-group">
            <span>Trip method</span>
            <select
              value={tripMethod}
              onChange={(e) => setTripMethod(e.target.value as TripCalculationMethod)}
            >
              <option value="once_for_project">Once for project</option>
              <option value="once_per_visit">Once per visit</option>
              <option value="once_per_workday">Once per workday</option>
              <option value="custom">Custom trip count</option>
            </select>
          </label>

          <label className="form-group">
            <span>Trips / visits / days</span>
            <input
              type="number"
              min={1}
              max={60}
              value={tripCount}
              onChange={(e) => setTripCount(e.target.value)}
            />
          </label>

          <label className="form-group">
            <span>Manual one-way miles</span>
            <input
              type="number"
              min={0}
              step={0.1}
              placeholder="Auto"
              value={manualMiles}
              onChange={(e) => setManualMiles(e.target.value)}
              data-testid="travel-manual-miles"
            />
          </label>

          <label className="form-group">
            <span>Manual one-way minutes</span>
            <input
              type="number"
              min={0}
              placeholder="Auto"
              value={manualMinutes}
              onChange={(e) => setManualMinutes(e.target.value)}
            />
          </label>

          {(chargeMode === "custom" || billingMode === "custom") && (
            <label className="form-group">
              <span>Custom total ($)</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={customTotal}
                onChange={(e) => setCustomTotal(e.target.value)}
              />
            </label>
          )}

          {(chargeMode === "waive" ||
            chargeMode === "custom" ||
            billingMode === "custom" ||
            billingMode === "none") && (
            <label className="form-group" style={{ gridColumn: "1 / -1" }}>
              <span>Override / waiver reason</span>
              <input
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. Preferred client multi-day package"
                data-testid="travel-override-reason"
              />
            </label>
          )}

          {entityType === "invoice" && billingMode === "actual" && (
            <label
              style={{
                gridColumn: "1 / -1",
                display: "flex",
                gap: 8,
                alignItems: "center",
                fontSize: "var(--text-sm)",
              }}
            >
              <input
                type="checkbox"
                checked={ownerReviewApproved}
                onChange={(e) => setOwnerReviewApproved(e.target.checked)}
              />
              Owner approves actual travel if it exceeds the estimate
            </label>
          )}
        </div>
      )}

      {error && (
        <p className="error-inline" style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>
          {error}
        </p>
      )}

      {editable && (
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void recalculate()}
            disabled={pending}
            data-testid="travel-recalculate-btn"
          >
            {pending ? "Working…" : "Recalculate"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void apply()}
            disabled={pending}
            data-testid="travel-apply-btn"
          >
            {pending ? "Saving…" : entityType === "estimate" ? "Apply to estimate" : "Apply to invoice"}
          </button>
        </div>
      )}

      {!editable && (
        <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", margin: 0 }}>
          Travel is locked on this record. Create a revision or edit a draft invoice to change charges.
        </p>
      )}
    </Card>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <tr>
      <td style={{ padding: "4px 8px 4px 0", color: "var(--fg-muted)" }}>{label}</td>
      <td
        style={{
          padding: "4px 0",
          textAlign: "right",
          fontFamily: "var(--font-mono)",
          fontWeight: strong ? 700 : 400,
        }}
      >
        {value}
      </td>
    </tr>
  );
}
