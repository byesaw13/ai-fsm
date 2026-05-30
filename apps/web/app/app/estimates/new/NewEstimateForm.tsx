"use client";

import { Button, Card, LinkButton } from "@/components/ui";
import {
  useEstimateForm,
  lineTotal,
  STEP_LABELS,
  PREP_LEVEL_LABELS,
  type NewEstimateFormProps,
} from "./hooks/useEstimateForm";
import { Step1WhoAndWhat } from "./components/Step1WhoAndWhat";
import { Step2Pricing } from "./components/Step2Pricing";
import { Step3Adjustments } from "./components/Step3Adjustments";
import { Step4ReviewAndSend } from "./components/Step4ReviewAndSend";
import { EstimateIntelSidebar } from "./components/EstimateIntelSidebar";

export function NewEstimateForm(props: NewEstimateFormProps) {
  const {
    pending, error, step, setStep,
    inlineForm, setInlineForm,
    clientList, filteredJobs, filteredProperties,
    selectedClient, selectedJob, selectedProperty,
    serviceType, setServiceType,
    clientId, setClientId,
    jobId, setJobId,
    propertyId, setPropertyId,
    expiresAt, setExpiresAt,
    notes, setNotes,
    taxRate, setTaxRate,
    taxRateNum,
    sendImmediately, setSendImmediately,
    sqFt, setSqFt,
    prepLevel, setPrepLevel,
    includesTrim, setIncludesTrim,
    includesCeiling, setIncludesCeiling,
    materialCostDollars, setMaterialCostDollars,
    laborHours, setLaborHours,
    scopeNotes, setScopeNotes,
    scopeParsing, scopeResult, scopeError,
    mode,
    lineItems,
    flatRate, setFlatRate,
    tiers,
    tripCount, setTripCount,
    requiresDryingOrCuring, setRequiresDryingOrCuring,
    difficultAccess, setDifficultAccess,
    oldHouseRisk, setOldHouseRisk,
    coordinationRequired, setCoordinationRequired,
    finishExpectation, setFinishExpectation,
    travelSurcharge, setTravelSurcharge,
    riskAdjustment, setRiskAdjustment,
    minimumOverrideReason, setMinimumOverrideReason,
    minimumOverrideNote, setMinimumOverrideNote,
    scopeAssumptions, setScopeAssumptions,
    priceBookItems, scopeResults,
    scopeMaterialsTotalCents,
    pendingDraftScope,
    aiDraftMode, setAiDraftMode,
    aiDescription, setAiDescription,
    aiConfidenceNotes, aiConfidenceDismissed, setAiConfidenceDismissed,
    itemDescription, setItemDescription,
    itemSuggesting, itemSuggestError,
    suggestions, setSuggestions,
    bundleCategories, hasLegalFlagSuggestions,
    paintingResult,
    materialHandlingCents,
    genericSubtotalCents, guardrailAdjustmentCents,
    genericTaxCents, genericTotalCents,
    depositCents, balanceDueCents,
    resolvedJobType, addedMaterials,
    handleAddPriceBookItem,
    paintingMode, setPaintingMode,
    roomSpecs, projectOptions, handleRoomByRoomChange,
    handleScopeChange,
    removePriceBookItem,
    applyDraft,
    pendingDraft,
    pendingShoppingList,
    applyPendingDraft,
    discardPendingDraft,
    handleClientCreated,
    handleJobCreated,
    handlePropertyCreated,
    handleAddSuggestion,
    handleSkipSuggestion,
    handleModeChange,
    addLineItem, addBulkLineItems, removeLineItem, updateLineItem,
    updateTier, addTierLineItem, removeTierLineItem, updateTierLineItem,
    tierSubtotalCents,
    handleAddMaterial,
    advanceStep, goBack,
    reviewTotal,
    handleSubmit,
    liveIntel,
  } = useEstimateForm(props);

  return (
    <div style={{
      display: step >= 2 ? "grid" : "block",
      gridTemplateColumns: step >= 2 ? "1fr 280px" : undefined,
      gap: step >= 2 ? "var(--space-6)" : undefined,
      alignItems: "start",
    }}>
    <form onSubmit={handleSubmit} className="p7-form-stack" data-testid="new-estimate-form">
      {/* Step indicator */}
      <div style={{ display: "flex", marginBottom: "var(--space-2)", borderRadius: "var(--radius)", overflow: "hidden", border: "1px solid var(--border)" }}>
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1;
          const isActive = stepNum === step;
          const isDone = stepNum < step;
          return (
            <button
              key={stepNum}
              type="button"
              onClick={() => isDone && setStep(stepNum)}
              disabled={!isDone}
              style={{
                flex: 1,
                padding: "var(--space-2) var(--space-1)",
                background: isActive ? "var(--accent)" : isDone ? "var(--bg-subtle)" : "transparent",
                color: isActive ? "#fff" : isDone ? "var(--fg)" : "var(--fg-muted)",
                border: "none",
                borderRight: i < 3 ? "1px solid var(--border)" : "none",
                cursor: isDone ? "pointer" : "default",
                fontSize: "var(--text-xs)",
                fontWeight: isActive ? 600 : 400,
                textAlign: "center",
                lineHeight: 1.3,
              }}
            >
              <span style={{ display: "block", fontWeight: 700 }}>{isDone ? "✓" : stepNum}</span>
              {label}
            </button>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <Card className="p7-card-danger" padding="sm" role="alert">
          <p style={{ margin: 0 }} data-testid="form-error">
            {error}
          </p>
        </Card>
      )}

      {step === 1 && (
        <Step1WhoAndWhat
          pending={pending}
          serviceType={serviceType} setServiceType={setServiceType}
          clientId={clientId} setClientId={setClientId}
          jobId={jobId} setJobId={setJobId}
          propertyId={propertyId} setPropertyId={setPropertyId}
          expiresAt={expiresAt} setExpiresAt={setExpiresAt}
          clientList={clientList}
          filteredJobs={filteredJobs}
          filteredProperties={filteredProperties}
          inlineForm={inlineForm} setInlineForm={setInlineForm}
          handleClientCreated={handleClientCreated}
          handleJobCreated={handleJobCreated}
          handlePropertyCreated={handlePropertyCreated}
          reviewTotal={reviewTotal}
        />
      )}

      {step === 2 && (
        <Step2Pricing
          pending={pending}
          serviceType={serviceType}
          sqFt={sqFt} setSqFt={setSqFt}
          laborHours={laborHours} setLaborHours={setLaborHours}
          materialCostDollars={materialCostDollars} setMaterialCostDollars={setMaterialCostDollars}
          prepLevel={prepLevel} setPrepLevel={setPrepLevel}
          includesTrim={includesTrim} setIncludesTrim={setIncludesTrim}
          includesCeiling={includesCeiling} setIncludesCeiling={setIncludesCeiling}
          paintingResult={paintingResult}
          prepLevelLabels={PREP_LEVEL_LABELS}
          scopeParsing={scopeParsing}
          scopeNotes={scopeNotes} setScopeNotes={setScopeNotes}
          scopeError={scopeError}
          scopeResult={scopeResult}
          aiDraftMode={aiDraftMode} setAiDraftMode={setAiDraftMode}
          aiDescription={aiDescription} setAiDescription={setAiDescription}
          aiConfidenceNotes={aiConfidenceNotes}
          aiConfidenceDismissed={aiConfidenceDismissed}
          setAiConfidenceDismissed={setAiConfidenceDismissed}
          applyDraft={applyDraft}
          pendingDraft={pendingDraft}
          pendingShoppingList={pendingShoppingList}
          applyPendingDraft={applyPendingDraft}
          discardPendingDraft={discardPendingDraft}
          mode={mode} handleModeChange={handleModeChange}
          priceBookItems={priceBookItems}
          removePriceBookItem={removePriceBookItem}
          scopeResults={scopeResults}
          handleScopeChange={handleScopeChange}
          pendingDraftScope={pendingDraftScope}
          handleAddPriceBookItem={handleAddPriceBookItem}
          paintingMode={paintingMode}
          setPaintingMode={setPaintingMode}
          roomSpecs={roomSpecs}
          projectOptions={projectOptions}
          handleRoomByRoomChange={handleRoomByRoomChange}
          flatRate={flatRate} setFlatRate={setFlatRate}
          tiers={tiers}
          taxRateNum={taxRateNum}
          updateTier={updateTier}
          addTierLineItem={addTierLineItem}
          removeTierLineItem={removeTierLineItem}
          updateTierLineItem={updateTierLineItem}
          tierSubtotalCents={tierSubtotalCents}
          itemDescription={itemDescription} setItemDescription={setItemDescription}
          itemSuggesting={itemSuggesting}
          itemSuggestError={itemSuggestError}
          suggestions={suggestions} setSuggestions={setSuggestions}
          bundleCategories={bundleCategories}
          hasLegalFlagSuggestions={hasLegalFlagSuggestions}
          handleAddSuggestion={handleAddSuggestion}
          handleSkipSuggestion={handleSkipSuggestion}
          resolvedJobType={resolvedJobType}
          addedMaterials={addedMaterials}
          handleAddMaterial={handleAddMaterial}
          lineItems={lineItems}
          addLineItem={addLineItem}
          addBulkLineItems={addBulkLineItems}
          removeLineItem={removeLineItem}
          updateLineItem={updateLineItem}
          scopeMaterialsTotalCents={scopeMaterialsTotalCents}
          materialHandlingCents={materialHandlingCents}
          genericSubtotalCents={genericSubtotalCents}
          guardrailAdjustmentCents={guardrailAdjustmentCents}
          genericTaxCents={genericTaxCents}
          genericTotalCents={genericTotalCents}
          depositCents={depositCents}
          balanceDueCents={balanceDueCents}
          taxRate={taxRate} setTaxRate={setTaxRate}
          lineTotal={lineTotal}
        />
      )}

      {step === 3 && (
        <Step3Adjustments
          pending={pending}
          notes={notes} setNotes={setNotes}
          scopeAssumptions={scopeAssumptions} setScopeAssumptions={setScopeAssumptions}
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
      )}

      {step === 4 && (
        <Step4ReviewAndSend
          pending={pending}
          serviceType={serviceType}
          mode={mode}
          selectedClient={selectedClient}
          selectedJob={selectedJob}
          selectedProperty={selectedProperty}
          lineItems={lineItems}
          expiresAt={expiresAt}
          notes={notes}
          paintingResult={paintingResult}
          sendImmediately={sendImmediately}
          setSendImmediately={setSendImmediately}
          reviewTotal={reviewTotal}
          intel={liveIntel}
        />
      )}

      {/* Navigation */}
      <div className="p7-form-actions">
        {step === 1 ? (
          <LinkButton href="/app/estimates" variant="secondary" tabIndex={-1}>
            Cancel
          </LinkButton>
        ) : (
          <Button type="button" variant="ghost" onClick={goBack} disabled={pending}>
            Back
          </Button>
        )}

        {step < 4 ? (
          <Button
            type="button"
            variant="primary"
            onClick={advanceStep}
            disabled={pending || (step === 1 && !clientId)}
          >
            Next
          </Button>
        ) : (
          <Button
            type="submit"
            variant="primary"
            disabled={pending || !clientId || (serviceType === "painting" && !paintingResult) || liveIntel.guardrailReview.blockers.length > 0}
            loading={pending}
            data-testid="submit-estimate-btn"
          >
            {pending
              ? "Creating…"
              : sendImmediately
              ? "Create & Send"
              : "Create Estimate"}
          </Button>
        )}
      </div>
    </form>
    {step >= 2 && (
      <EstimateIntelSidebar intel={liveIntel} />
    )}
    </div>
  );
}
