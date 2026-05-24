"use client";

import { Textarea } from "@/components/ui";
import { GuardrailsSection } from "../../components/GuardrailsSection";

interface Step3Props {
  pending: boolean;
  notes: string;
  setNotes: (v: string) => void;
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

export function Step3Adjustments({
  pending, notes, setNotes,
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
