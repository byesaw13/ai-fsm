"use client";

import { Textarea } from "@/components/ui";
import { GuardrailsSection } from "../../components/GuardrailsSection";
import type { DepositDueTrigger, DepositType } from "@/lib/estimates/deposit-policy";

interface Step3Props {
  pending: boolean;
  notes: string;
  setNotes: (v: string) => void;
  scopeAssumptions: string;
  setScopeAssumptions: (v: string) => void;
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
  depositRequired: boolean;
  setDepositRequired: (v: boolean) => void;
  depositType: DepositType;
  setDepositType: (v: DepositType) => void;
  depositPercentage: string;
  setDepositPercentage: (v: string) => void;
  depositFixedDollars: string;
  setDepositFixedDollars: (v: string) => void;
  depositDueTrigger: DepositDueTrigger;
  setDepositDueTrigger: (v: DepositDueTrigger) => void;
  termsScopeAccepted: boolean;
  setTermsScopeAccepted: (v: boolean) => void;
  termsPaymentAccepted: boolean;
  setTermsPaymentAccepted: (v: boolean) => void;
  termsChangeOrderAccepted: boolean;
  setTermsChangeOrderAccepted: (v: boolean) => void;
}

export function Step3Adjustments({
  pending, notes, setNotes,
  scopeAssumptions, setScopeAssumptions,
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
  depositRequired, setDepositRequired,
  depositType, setDepositType,
  depositPercentage, setDepositPercentage,
  depositFixedDollars, setDepositFixedDollars,
  depositDueTrigger, setDepositDueTrigger,
  termsScopeAccepted, setTermsScopeAccepted,
  termsPaymentAccepted, setTermsPaymentAccepted,
  termsChangeOrderAccepted, setTermsChangeOrderAccepted,
}: Step3Props) {
  return (
    <div className="p7-form-stack">
      <GuardrailsSection
        idPrefix="new"
        disabled={pending}
        tripCount={tripCount} setTripCount={setTripCount}
        finishExpectation={finishExpectation} setFinishExpectation={setFinishExpectation}
        travelSurcharge={travelSurcharge} setTravelSurcharge={setTravelSurcharge}
        riskAdjustment={riskAdjustment} setRiskAdjustment={setRiskAdjustment}
        minimumOverrideReason={minimumOverrideReason} setMinimumOverrideReason={setMinimumOverrideReason}
        minimumOverrideNote={minimumOverrideNote} setMinimumOverrideNote={setMinimumOverrideNote}
        requiresDryingOrCuring={requiresDryingOrCuring} setRequiresDryingOrCuring={setRequiresDryingOrCuring}
        difficultAccess={difficultAccess} setDifficultAccess={setDifficultAccess}
        oldHouseRisk={oldHouseRisk} setOldHouseRisk={setOldHouseRisk}
        coordinationRequired={coordinationRequired} setCoordinationRequired={setCoordinationRequired}
      />

      <div>
        <Textarea
          id="scope-assumptions"
          label="Scope assumptions (visible to client)"
          value={scopeAssumptions}
          onChange={(e) => setScopeAssumptions(e.target.value)}
          placeholder="Conditions this estimate relies on — auto-filled from service type. Edit to match this job."
          rows={5}
          disabled={pending}
        />
        <p style={{ marginTop: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
          Shown on the estimate and client portal. Documents conditions assumed — protects scope if conditions differ on arrival.
        </p>
      </div>


      <section style={{ display: "grid", gap: "var(--space-3)", padding: "var(--space-4)", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "var(--text-base)", lineHeight: 1.3 }}>Deposit & Terms</h3>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={depositRequired}
              onChange={(e) => {
                setDepositRequired(e.target.checked);
                if (!e.target.checked) setDepositType("none");
                if (e.target.checked && depositType === "none") setDepositType("percentage");
              }}
              disabled={pending}
            />
            Deposit required
          </label>
        </div>

        {depositRequired && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-3)" }}>
            <label className="p7-field" style={{ marginBottom: 0 }}>
              <span className="p7-label">Deposit type</span>
              <select className="p7-select" value={depositType} onChange={(e) => setDepositType(e.target.value as DepositType)} disabled={pending}>
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
                <option value="materials">Materials only</option>
              </select>
            </label>

            {depositType === "percentage" && (
              <label className="p7-field" style={{ marginBottom: 0 }}>
                <span className="p7-label">Deposit percentage</span>
                <input className="p7-input" type="number" min="0" max="100" step="0.01" value={depositPercentage} onChange={(e) => setDepositPercentage(e.target.value)} disabled={pending} />
              </label>
            )}

            {depositType === "fixed" && (
              <label className="p7-field" style={{ marginBottom: 0 }}>
                <span className="p7-label">Fixed deposit amount</span>
                <input className="p7-input" type="number" min="0" step="0.01" value={depositFixedDollars} onChange={(e) => setDepositFixedDollars(e.target.value)} disabled={pending} />
              </label>
            )}

            <label className="p7-field" style={{ marginBottom: 0 }}>
              <span className="p7-label">Deposit due</span>
              <select className="p7-select" value={depositDueTrigger} onChange={(e) => setDepositDueTrigger(e.target.value as DepositDueTrigger)} disabled={pending}>
                <option value="on_acceptance">On acceptance</option>
                <option value="before_scheduling">Before scheduling</option>
                <option value="before_material_order">Before materials are ordered</option>
                <option value="custom">Per written agreement</option>
              </select>
            </label>
          </div>
        )}

        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontSize: "var(--text-sm)" }}>
            <input type="checkbox" checked={termsScopeAccepted} onChange={(e) => setTermsScopeAccepted(e.target.checked)} disabled={pending} />
            Include scope and exclusions terms
          </label>
          <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontSize: "var(--text-sm)" }}>
            <input type="checkbox" checked={termsPaymentAccepted} onChange={(e) => setTermsPaymentAccepted(e.target.checked)} disabled={pending} />
            Include payment terms
          </label>
          <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontSize: "var(--text-sm)" }}>
            <input type="checkbox" checked={termsChangeOrderAccepted} onChange={(e) => setTermsChangeOrderAccepted(e.target.checked)} disabled={pending} />
            Include change-order terms
          </label>
        </div>
      </section>

      <Textarea
        id="notes"
        label="Client notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Visible to the client on the estimate"
        rows={3}
        disabled={pending}
      />
    </div>
  );
}
