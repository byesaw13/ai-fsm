"use client";

import { Input, Select, SectionHeader } from "@/components/ui";

interface GuardrailsSectionProps {
  idPrefix?: string;
  disabled?: boolean;
  tripCount: "one_trip" | "multi_trip";
  setTripCount: (v: "one_trip" | "multi_trip") => void;
  finishExpectation: "basic" | "clean" | "premium";
  setFinishExpectation: (v: "basic" | "clean" | "premium") => void;
  travelSurcharge: string;
  setTravelSurcharge: (v: string) => void;
  riskAdjustment: string;
  setRiskAdjustment: (v: string) => void;
  minimumOverrideReason: string;
  setMinimumOverrideReason: (v: string) => void;
  minimumOverrideNote: string;
  setMinimumOverrideNote: (v: string) => void;
  requiresDryingOrCuring: boolean;
  setRequiresDryingOrCuring: (v: boolean) => void;
  difficultAccess: boolean;
  setDifficultAccess: (v: boolean) => void;
  oldHouseRisk: boolean;
  setOldHouseRisk: (v: boolean) => void;
  coordinationRequired: boolean;
  setCoordinationRequired: (v: boolean) => void;
}

export function GuardrailsSection({
  idPrefix = "",
  disabled,
  tripCount, setTripCount,
  finishExpectation, setFinishExpectation,
  travelSurcharge, setTravelSurcharge,
  riskAdjustment, setRiskAdjustment,
  minimumOverrideReason, setMinimumOverrideReason,
  minimumOverrideNote, setMinimumOverrideNote,
  requiresDryingOrCuring, setRequiresDryingOrCuring,
  difficultAccess, setDifficultAccess,
  oldHouseRisk, setOldHouseRisk,
  coordinationRequired, setCoordinationRequired,
}: GuardrailsSectionProps) {
  const p = idPrefix ? `${idPrefix}-` : "";

  return (
    <div>
      <SectionHeader title="Pricing Guardrails" as="h3" />
      <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
        Optional — use these to flag job complexity and add surcharges.
      </p>
      <div className="p7-form-grid p7-form-grid-2">
        <Select
          id={`${p}trip-count`}
          label="Trip Count"
          value={tripCount}
          onChange={(e) => setTripCount(e.target.value as "one_trip" | "multi_trip")}
          disabled={disabled}
          options={[
            { value: "one_trip", label: "One Trip" },
            { value: "multi_trip", label: "Multi-Trip" },
          ]}
        />
        <Select
          id={`${p}finish-expectation`}
          label="Finish Expectation"
          value={finishExpectation}
          onChange={(e) => setFinishExpectation(e.target.value as "basic" | "clean" | "premium")}
          disabled={disabled}
          options={[
            { value: "basic", label: "Basic" },
            { value: "clean", label: "Clean" },
            { value: "premium", label: "Premium" },
          ]}
        />
        <Input
          id={`${p}travel-surcharge`}
          label="Travel Surcharge ($)"
          type="number"
          min="0"
          step="0.01"
          value={travelSurcharge}
          onChange={(e) => setTravelSurcharge(e.target.value)}
          disabled={disabled}
        />
        <Input
          id={`${p}risk-adjustment`}
          label="Risk / Return Adjustment ($)"
          type="number"
          min="0"
          step="0.01"
          value={riskAdjustment}
          onChange={(e) => setRiskAdjustment(e.target.value)}
          disabled={disabled}
        />
        <Select
          id={`${p}minimum-override`}
          label="Minimum Override"
          value={minimumOverrideReason}
          onChange={(e) => setMinimumOverrideReason(e.target.value)}
          disabled={disabled}
          placeholder="None"
          options={[
            { value: "bundled", label: "Bundled" },
            { value: "membership_included", label: "Membership Included" },
            { value: "promo", label: "Promotion" },
            { value: "owner_approved", label: "Owner Approved" },
          ]}
        />
        <Input
          id={`${p}minimum-override-note`}
          label="Override Note"
          value={minimumOverrideNote}
          onChange={(e) => setMinimumOverrideNote(e.target.value)}
          disabled={disabled}
          placeholder="Internal reason"
        />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
        {([
          ["drying", "Drying/curing required", requiresDryingOrCuring, setRequiresDryingOrCuring],
          ["access", "Difficult access", difficultAccess, setDifficultAccess],
          ["old-house", "Old-house risk", oldHouseRisk, setOldHouseRisk],
          ["coordination", "Coordination required", coordinationRequired, setCoordinationRequired],
        ] as [string, string, boolean, (v: boolean) => void][]).map(([key, label, checked, setter]) => (
          <label key={key} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setter(e.target.checked)}
              disabled={disabled}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
