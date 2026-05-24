"use client";

import {
  Button,
  Card,
  Input,
  LinkButton,
  Select,
  SectionHeader,
  Textarea,
} from "@/components/ui";
import { PriceBookSelector } from "@/components/PriceBookSelector";
import { ScopeBuilder } from "@/components/ScopeBuilder";
import { PREP_LEVEL_MULTIPLIERS, getMaterialsByCategory } from "@ai-fsm/domain";
import { formatCents } from "@/lib/estimates/pricing";
import { GuardrailsSection } from "../components/GuardrailsSection";
import { LineItemsTable } from "../components/LineItemsTable";
import { EstimateTierEditor } from "../components/EstimateTierEditor";
import { InlineClientForm } from "./InlineClientForm";
import { InlineJobForm } from "./InlineJobForm";
import { InlinePropertyForm } from "./InlinePropertyForm";
import {
  useEstimateForm,
  lineTotal,
  STEP_LABELS,
  PREP_LEVEL_LABELS,
  type NewEstimateFormProps,
} from "./hooks/useEstimateForm";

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
    handleScopeChange,
    removePriceBookItem,
    applyDraft,
    handleClientCreated,
    handleJobCreated,
    handlePropertyCreated,
    handleAddSuggestion,
    handleSkipSuggestion,
    handleModeChange,
    addLineItem, removeLineItem, updateLineItem,
    updateTier, addTierLineItem, removeTierLineItem, updateTierLineItem,
    tierSubtotalCents,
    handleAddMaterial,
    advanceStep, goBack,
    reviewTotal,
    handleSubmit,
  } = useEstimateForm(props);

  return (
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

      {/* ------------------------------------------------------------------ */}
      {/* Step 1: Who & What                                                  */}
      {/* ------------------------------------------------------------------ */}
      {step === 1 && (
        <div className="p7-form-stack">
          {/* Service type toggle */}
          <div>
            <SectionHeader title="Service Type" as="h3" />
            <div
              style={{
                display: "flex",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                overflow: "hidden",
                width: "fit-content",
              }}
            >
              {(["generic", "painting"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setServiceType(t)}
                  disabled={pending}
                  style={{
                    padding: "var(--space-1) var(--space-4)",
                    background: serviceType === t ? "var(--accent)" : "transparent",
                    color: serviceType === t ? "#fff" : "var(--fg-muted)",
                    border: "none",
                    cursor: pending ? "default" : "pointer",
                    fontSize: "var(--text-sm)",
                    fontWeight: serviceType === t ? 600 : 400,
                    lineHeight: 1.4,
                  }}
                >
                  {t === "painting" ? "Painting" : "General"}
                </button>
              ))}
            </div>
            {serviceType === "painting" && (
              <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                Painting estimator — fields auto-fill from a job description.
              </p>
            )}
          </div>

          {/* Client / Job / Property */}
          <div className="p7-form-grid p7-form-grid-2">
            <div>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <Select
                    id="client_id"
                    label="Client"
                    required
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value);
                      setJobId("");
                      setPropertyId("");
                      setInlineForm(null);
                    }}
                    disabled={pending}
                    options={clientList.map((c) => ({ value: c.id, label: c.name }))}
                    placeholder="Select a client"
                  />
                </div>
                <button
                  type="button"
                  className="p7-btn p7-btn-secondary p7-btn-sm"
                  onClick={() => setInlineForm(inlineForm === "client" ? null : "client")}
                  disabled={pending}
                  style={{ flexShrink: 0, marginBottom: "1px" }}
                >
                  + New
                </button>
              </div>
              {inlineForm === "client" && (
                <InlineClientForm
                  onCreated={handleClientCreated}
                  onCancel={() => setInlineForm(null)}
                />
              )}
            </div>

            <div>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <Select
                    id="job_id"
                    label="Job (optional)"
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                    disabled={pending || !clientId}
                    options={filteredJobs.map((j) => ({ value: j.id, label: j.title }))}
                    placeholder="None"
                    hint={
                      clientId && filteredJobs.length === 0
                        ? "No open jobs for this client."
                        : undefined
                    }
                  />
                </div>
                {clientId && (
                  <button
                    type="button"
                    className="p7-btn p7-btn-secondary p7-btn-sm"
                    onClick={() => setInlineForm(inlineForm === "job" ? null : "job")}
                    disabled={pending}
                    style={{ flexShrink: 0, marginBottom: "1px" }}
                  >
                    + New
                  </button>
                )}
              </div>
              {inlineForm === "job" && clientId && (
                <InlineJobForm
                  clientId={clientId}
                  onCreated={handleJobCreated}
                  onCancel={() => setInlineForm(null)}
                />
              )}
            </div>

            <div>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <Select
                    id="property_id"
                    label="Property (optional)"
                    value={propertyId}
                    onChange={(e) => setPropertyId(e.target.value)}
                    disabled={pending || !clientId}
                    options={filteredProperties.map((p) => ({ value: p.id, label: p.address }))}
                    placeholder="None"
                    hint={
                      clientId && filteredProperties.length === 0
                        ? "No properties for this client."
                        : undefined
                    }
                  />
                </div>
                {clientId && (
                  <button
                    type="button"
                    className="p7-btn p7-btn-secondary p7-btn-sm"
                    onClick={() => setInlineForm(inlineForm === "property" ? null : "property")}
                    disabled={pending}
                    style={{ flexShrink: 0, marginBottom: "1px" }}
                  >
                    + New
                  </button>
                )}
              </div>
              {inlineForm === "property" && clientId && (
                <InlinePropertyForm
                  clientId={clientId}
                  onCreated={handlePropertyCreated}
                  onCancel={() => setInlineForm(null)}
                />
              )}
            </div>

            <Input
              id="expires_at"
              label="Expires (optional)"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              disabled={pending}
            />
          </div>

          {/* Live preview */}
          <div
            data-testid="estimate-live-preview"
            style={{
              padding: "var(--space-3)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              background: "var(--surface-muted, var(--surface))",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "var(--space-3)",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                Estimate Preview
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: "var(--space-1)" }}>
                {reviewTotal() === "—"
                  ? "Add pricing on the next step — the total will appear here."
                  : "Updates live as you adjust pricing on the next step."}
              </div>
            </div>
            <div style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--fg)" }}>
              {reviewTotal()}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 2: Pricing                                                     */}
      {/* ------------------------------------------------------------------ */}
      {step === 2 && (
        <div className="p7-form-stack">
          {/* Painting Estimator */}
          {serviceType === "painting" && (
            <div>
              <SectionHeader title="Painting Estimator" as="h3" />

              {/* Scope parser */}
              <div style={{ marginBottom: "var(--space-4)", padding: "var(--space-3)", background: "var(--bg-subtle)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
                  <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>
                    Parse from description
                  </p>
                  {scopeParsing && (
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontStyle: "italic" }}>
                      Analyzing…
                    </span>
                  )}
                </div>
                <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                  Describe the job — fields auto-fill after you stop typing.
                </p>
                <Textarea
                  id="scope_notes"
                  label=""
                  value={scopeNotes}
                  onChange={(e) => setScopeNotes(e.target.value)}
                  placeholder="e.g. Paint 3 bedrooms, patch some holes and sand walls, include ceiling and trim, about $350 for materials"
                  rows={3}
                  disabled={pending || scopeParsing}
                />

                {scopeError && (
                  <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-sm)", color: "var(--status-error)" }}>
                    {scopeError}
                  </p>
                )}

                {scopeResult && (
                  <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-2)", borderTop: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                      <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>Parsed</span>
                      <span style={{
                        padding: "2px 8px", borderRadius: 99, fontSize: "var(--text-xs)", fontWeight: 600, color: "#fff",
                        background: scopeResult.parsed.confidence >= 70 ? "var(--status-success)" : scopeResult.parsed.confidence >= 40 ? "var(--status-warning)" : "var(--status-error)",
                      }}>
                        {scopeResult.parsed.confidence}% confidence
                      </span>
                    </div>
                    {scopeResult.parsed.confidence < 60 && (
                      <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-sm)", color: "var(--status-warning)", fontWeight: 500 }}>
                        ⚠ Low confidence — review all fields carefully before submitting.
                      </p>
                    )}
                    <ul style={{ margin: 0, padding: "0 0 0 var(--space-4)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                      {scopeResult.parsed.parsed_items.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                    {scopeResult.parsed.warnings.map((w, i) => (
                      <p key={i} style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-xs)", color: "var(--status-warning)", fontWeight: 500 }}>
                        ⚠ {w}
                      </p>
                    ))}
                    <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                      Fields applied below — review and adjust as needed.
                    </p>
                  </div>
                )}
              </div>

              <div className="p7-form-grid p7-form-grid-2">
                <Input
                  id="sq_ft"
                  label="Square Footage"
                  type="number"
                  min="1"
                  step="1"
                  value={sqFt}
                  onChange={(e) => setSqFt(e.target.value)}
                  disabled={pending}
                  placeholder="e.g. 1200"
                />

                <Input
                  id="labor_hours"
                  label="Estimated Labor Hours"
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={laborHours}
                  onChange={(e) => setLaborHours(e.target.value)}
                  disabled={pending}
                  placeholder="Optional — for your reference"
                  hint="Engine estimates margin from square footage"
                />

                <Input
                  id="material_cost"
                  label="Material Cost ($)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={materialCostDollars}
                  onChange={(e) => setMaterialCostDollars(e.target.value)}
                  disabled={pending}
                  placeholder="e.g. 350.00"
                />

                <div className="p7-field">
                  <label className="p7-label">Prep Level</label>
                  <select
                    id="prep_level"
                    className="p7-select"
                    value={prepLevel}
                    onChange={(e) => setPrepLevel(Number(e.target.value))}
                    disabled={pending}
                  >
                    {Object.entries(PREP_LEVEL_MULTIPLIERS).map(([level, mult]) => (
                      <option key={level} value={level}>
                        {PREP_LEVEL_LABELS[Number(level)] ?? `Level ${level} (${mult}x)`}
                      </option>
                    ))}
                  </select>
                  <span className="p7-field-hint">
                    Multiplier: {PREP_LEVEL_MULTIPLIERS[prepLevel]?.toFixed(2)}x base rate
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-2)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={includesTrim}
                    onChange={(e) => setIncludesTrim(e.target.checked)}
                    disabled={pending}
                  />
                  <span>Include trim (+$0.20/sq ft)</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={includesCeiling}
                    onChange={(e) => setIncludesCeiling(e.target.checked)}
                    disabled={pending}
                  />
                  <span>Include ceiling (+30% surface)</span>
                </label>
              </div>

              {/* Live Preview */}
              {paintingResult && (
                <div style={{ marginTop: "var(--space-4)" }}>
                  <Card padding="sm" style={{ background: "var(--bg-subtle)" }}>
                    <SectionHeader title="Estimate Preview" as="h4" />
                    <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "var(--space-1) var(--space-4)", textAlign: "right" }}>
                      <span style={{ color: "var(--fg-muted)" }}>Labor</span>
                      <span>{formatCents(paintingResult.labor_flat_rate_cents)}</span>

                      {paintingResult.material_cents > 0 && (
                        <>
                          <span style={{ color: "var(--fg-muted)" }}>Materials</span>
                          <span>{formatCents(paintingResult.material_cents)}</span>
                        </>
                      )}

                      {paintingResult.material_handling_cents > 0 && (
                        <>
                          <span style={{ color: "var(--fg-muted)" }}>Handling fee (15%)</span>
                          <span>{formatCents(paintingResult.material_handling_cents)}</span>
                        </>
                      )}

                      <strong>Total</strong>
                      <strong>{formatCents(paintingResult.total_cents)}</strong>

                      <span style={{ color: "var(--fg-muted)" }}>Deposit (30%)</span>
                      <span>{formatCents(paintingResult.deposit_cents)}</span>

                      <span style={{ color: "var(--fg-muted)" }}>Balance (70%)</span>
                      <span>{formatCents(paintingResult.balance_cents)}</span>
                    </div>

                    <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-2)", borderTop: "1px dashed var(--border)" }}>
                      <SectionHeader title="Internal Margin" as="h4" />
                      <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "var(--space-1) var(--space-4)", textAlign: "right" }}>
                        <span style={{ color: "var(--fg-muted)" }}>Estimated labor cost</span>
                        <span>{formatCents(paintingResult.internal_labor_cost_cents)}</span>

                        <span style={{ color: "var(--fg-muted)" }}>Gross margin</span>
                        <span style={{
                          color: paintingResult.gross_margin_pct >= 30 ? "var(--color-success)" : paintingResult.gross_margin_pct >= 15 ? "var(--color-warning)" : "var(--color-danger)",
                          fontWeight: 600,
                        }}>
                          {paintingResult.gross_margin_pct}% ({formatCents(paintingResult.gross_margin_cents)})
                        </span>

                        <span style={{ color: "var(--fg-muted)" }}>Effective rate</span>
                        <span>${(paintingResult.effective_sq_ft_rate_cents / 100).toFixed(2)}/sq ft</span>
                      </div>
                    </div>
                  </Card>
                </div>
              )}

              {!paintingResult && (
                <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
                  Enter the square footage above to see the estimate preview.
                </p>
              )}
            </div>
          )}

          {/* AI Draft panel — generic mode only */}
          {serviceType === "generic" && aiDraftMode !== "applied" && (
            <div style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "var(--space-4)",
              marginBottom: "var(--space-4)",
            }}>
              {aiDraftMode === "idle" && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
                  <div>
                    <p style={{ fontWeight: 600, marginBottom: 2 }}>Draft with AI</p>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", margin: 0 }}>
                      Describe the job and we&apos;ll pre-fill the estimate from your price book.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setAiDraftMode("input")}>
                      Draft with AI
                    </Button>
                  </div>
                </div>
              )}
              {(aiDraftMode === "input" || aiDraftMode === "loading") && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
                    <p style={{ fontWeight: 600, margin: 0 }}>Describe the job</p>
                    <button
                      type="button"
                      onClick={() => setAiDraftMode("idle")}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: "var(--text-sm)", padding: 0 }}
                    >
                      Skip →
                    </button>
                  </div>
                  <Textarea
                    id="ai-draft-description"
                    value={aiDescription}
                    onChange={(e) => setAiDescription(e.target.value)}
                    placeholder="e.g. Paint the living room and hallway, replace 2 door hinges, patch small drywall hole near window"
                    rows={3}
                    disabled={aiDraftMode === "loading"}
                    style={{ marginBottom: "var(--space-3)" }}
                  />
                  <Button
                    type="button"
                    onClick={applyDraft}
                    disabled={aiDraftMode === "loading" || !aiDescription.trim()}
                  >
                    {aiDraftMode === "loading" ? "Drafting estimate…" : "Generate estimate"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* AI confidence notes banner */}
          {aiDraftMode === "applied" && aiConfidenceNotes && !aiConfidenceDismissed && (
            <div style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "var(--space-3) var(--space-4)",
              marginBottom: "var(--space-4)",
              display: "flex",
              gap: "var(--space-3)",
              alignItems: "flex-start",
            }}>
              <span style={{ color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>ℹ</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, margin: "0 0 2px" }}>AI assumptions — verify before sending</p>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", margin: 0 }}>{aiConfidenceNotes}</p>
              </div>
              <button
                type="button"
                onClick={() => setAiConfidenceDismissed(true)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: "var(--text-lg)", padding: 0, lineHeight: 1, flexShrink: 0 }}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          {/* Generic Pricing */}
          {serviceType === "generic" && (
            <div>
              {/* Price Book Quick Add — itemized mode only */}
              {mode === "itemized" && (
                <div style={{ marginBottom: "var(--space-4)" }}>
                  <SectionHeader title="Quick Add from Price Book" as="h3" />
                  <PriceBookSelector onAddToEstimate={handleAddPriceBookItem} />

                  {priceBookItems.length > 0 && (
                    <div style={{ marginTop: "var(--space-3)" }}>
                      <p style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
                        Selected Services ({priceBookItems.length})
                      </p>
                      {priceBookItems.map((item) => {
                        const sr = scopeResults[item.instanceId];
                        const displayPrice = sr?.adjustedPriceCents ?? item.priceCents;
                        return (
                        <div key={item.instanceId} style={{ marginBottom: "var(--space-2)" }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "var(--space-1) var(--space-2)",
                              background: "var(--bg-subtle)",
                              borderRadius: "var(--radius)",
                              fontSize: "var(--text-sm)",
                            }}
                          >
                            <div>
                              <span style={{ fontFamily: "monospace", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                                {item.service.code}
                              </span>{" "}
                              <span>{item.service.name}</span>
                              {sr?.multiplier !== undefined && sr.multiplier !== 1.0 && (
                                <span style={{ marginLeft: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--accent)", fontWeight: 600 }}>
                                  ×{sr.multiplier.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                              <div style={{ textAlign: "right" }}>
                                <span style={{ fontWeight: 600 }}>{formatCents(displayPrice)}</span>
                                {sr && sr.materialTotalCents > 0 && (
                                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                                    + {formatCents(sr.materialTotalCents)} materials
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => removePriceBookItem(item.instanceId)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "var(--color-danger)",
                                  fontSize: "var(--text-sm)",
                                  padding: 0,
                                  lineHeight: 1,
                                }}
                                aria-label={`Remove ${item.service.name}`}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                          <ScopeBuilder
                            category={item.service.category}
                            basePriceCents={item.service.default_price_cents ?? item.priceCents}
                            onChange={(result) => handleScopeChange(item.instanceId, result)}
                            initialScopeValues={pendingDraftScope[item.instanceId]?.scopeValues}
                            initialComplexityFactors={pendingDraftScope[item.instanceId]?.complexityFactors}
                          />
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Mode toggle + line items */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
                  <SectionHeader
                    title={mode === "flat_rate" ? "Flat Rate" : "Line Items"}
                    count={mode === "itemized" ? lineItems.length : undefined}
                    as="h3"
                  />
                  <div
                    style={{
                      display: "flex",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      overflow: "hidden",
                    }}
                  >
                    {(["itemized", "flat_rate"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleModeChange(m)}
                        disabled={pending}
                        style={{
                          padding: "var(--space-1) var(--space-3)",
                          background: mode === m ? "var(--accent)" : "transparent",
                          color: mode === m ? "#fff" : "var(--fg-muted)",
                          border: "none",
                          cursor: pending ? "default" : "pointer",
                          fontSize: "var(--text-sm)",
                          fontWeight: mode === m ? 600 : 400,
                          lineHeight: 1.4,
                        }}
                        data-testid={`mode-${m}`}
                      >
                        {m === "itemized" ? "Itemized" : "Flat Rate"}
                      </button>
                    ))}
                  </div>
                </div>

                {mode === "flat_rate" ? (
                  <div className="p7-form-grid p7-form-grid-2" style={{ marginBottom: "var(--space-3)" }}>
                    <Input
                      id="flat_rate"
                      label="Price ($)"
                      type="number"
                      min="0"
                      step="0.01"
                      value={flatRate}
                      onChange={(e) => setFlatRate(e.target.value)}
                      disabled={pending}
                      data-testid="flat-rate-input"
                    />
                  </div>
                ) : mode === "multi_option" ? (
                  <EstimateTierEditor
                    tiers={tiers}
                    taxRateNum={taxRateNum}
                    disabled={pending}
                    onUpdateTier={updateTier}
                    onUpdateTierLineItem={updateTierLineItem}
                    onAddTierLineItem={addTierLineItem}
                    onRemoveTierLineItem={removeTierLineItem}
                    tierSubtotalCents={tierSubtotalCents}
                  />
                ) : (
                  <>
                    {/* Item Suggester */}
                    <div style={{ marginBottom: "var(--space-4)", padding: "var(--space-3)", background: "var(--bg-subtle)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-1)" }}>
                        <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>
                          Suggest from description
                        </p>
                        {itemSuggesting && (
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontStyle: "italic" }}>
                            Matching…
                          </span>
                        )}
                      </div>
                      <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                        Describe the job — Claude matches price book services after you stop typing.
                      </p>
                      <Textarea
                        id="item_description"
                        label=""
                        value={itemDescription}
                        onChange={(e) => setItemDescription(e.target.value)}
                        placeholder="e.g. Fix a leaky kitchen faucet, replace the shutoff valve under the sink, and patch the drywall where the pipe was leaking"
                        rows={3}
                        disabled={pending || itemSuggesting}
                      />

                      {itemSuggestError && (
                        <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-sm)", color: "var(--status-error)" }}>
                          {itemSuggestError}
                        </p>
                      )}

                      {bundleCategories >= 4 && (
                        <div style={{
                          marginTop: "var(--space-2)",
                          padding: "var(--space-2) var(--space-3)",
                          background: "#fef3c7",
                          borderRadius: "var(--radius)",
                          fontSize: "var(--text-sm)",
                          color: "#92400e",
                          fontWeight: 500,
                        }}>
                          ★ You have {bundleCategories} task categories — consider half-day block pricing ($515)
                        </div>
                      )}

                      {hasLegalFlagSuggestions && (
                        <div style={{
                          marginTop: "var(--space-2)",
                          padding: "var(--space-2) var(--space-3)",
                          background: "#fef3c7",
                          borderRadius: "var(--radius)",
                          fontSize: "var(--text-sm)",
                          color: "#92400e",
                          fontWeight: 500,
                        }}>
                          ⚠ One or more items may require a licensed contractor in some jurisdictions — verify before quoting
                        </div>
                      )}

                      {suggestions.length > 0 && (
                        <div style={{ marginTop: "var(--space-3)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
                            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                              {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""} — add or skip each
                            </span>
                            <button
                              type="button"
                              onClick={() => setSuggestions([])}
                              style={{ background: "none", border: "none", fontSize: "var(--text-sm)", color: "var(--fg-muted)", cursor: "pointer", padding: 0 }}
                            >
                              Dismiss all
                            </button>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                            {suggestions.map((s, i) => (
                              <div
                                key={`${s.code}-${i}`}
                                style={{
                                  display: "flex",
                                  gap: "var(--space-3)",
                                  alignItems: "flex-start",
                                  padding: "var(--space-3)",
                                  background: "var(--bg-card)",
                                  border: "1px solid var(--border)",
                                  borderRadius: "var(--radius)",
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                                    <span style={{ color: "var(--fg-muted)", fontWeight: 400, marginRight: "var(--space-1)" }}>{s.code}</span>
                                    {s.name}
                                  </div>
                                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
                                    {s.reason}
                                  </div>
                                  <div style={{ display: "flex", gap: "var(--space-1)", marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                                    <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                                      {formatCents(s.quantity * s.unit_price_cents)}
                                    </span>
                                    {s.labor_hours_typical !== null && (
                                      <span style={{
                                        fontSize: "var(--text-xs)", padding: "1px 6px",
                                        background: "var(--color-surface-overlay)",
                                        borderRadius: "var(--radius-sm)",
                                        color: "var(--fg-muted)", border: "1px solid var(--border)",
                                      }}>
                                        ~{s.labor_hours_typical}h
                                      </span>
                                    )}
                                    {s.legal_flag === "gray" && (
                                      <span style={{
                                        fontSize: "var(--text-xs)", padding: "1px 6px",
                                        background: "#fef9c3",
                                        borderRadius: "var(--radius-sm)",
                                        color: "#854d0e",
                                        border: "1px solid #fde68a",
                                      }}>
                                        ⚠ verify auth
                                      </span>
                                    )}
                                    {s.legal_flag === "restricted" && (
                                      <span style={{
                                        fontSize: "var(--text-xs)", padding: "1px 6px",
                                        background: "#fee2e2",
                                        borderRadius: "var(--radius-sm)",
                                        color: "#991b1b",
                                        border: "1px solid #fca5a5",
                                      }}>
                                        ⛔ licensed trade
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div style={{ display: "flex", gap: "var(--space-1)", flexShrink: 0, paddingTop: 2 }}>
                                  <button
                                    type="button"
                                    onClick={() => handleAddSuggestion(i)}
                                    disabled={pending}
                                    style={{
                                      padding: "var(--space-1) var(--space-3)",
                                      background: "var(--accent)",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: "var(--radius)",
                                      fontSize: "var(--text-sm)",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Add
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSkipSuggestion(i)}
                                    disabled={pending}
                                    style={{
                                      padding: "var(--space-1) var(--space-2)",
                                      background: "none",
                                      color: "var(--fg-muted)",
                                      border: "1px solid var(--border)",
                                      borderRadius: "var(--radius)",
                                      fontSize: "var(--text-sm)",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Skip
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Suggested Materials */}
                    {resolvedJobType && Object.keys(getMaterialsByCategory(resolvedJobType)).length > 0 && (
                      <div style={{ marginBottom: "var(--space-4)" }}>
                        <SectionHeader title={`Suggested Materials — ${resolvedJobType.replace("_", " ")}`} as="h3" />
                        <Card padding="sm" style={{ background: "var(--bg-subtle)" }}>
                          {Object.entries(getMaterialsByCategory(resolvedJobType)).map(([category, materials]) => (
                            <div key={category} style={{ marginBottom: "var(--space-3)" }}>
                              <div style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-1)" }}>
                                {category}
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                                {materials.map((mat) => {
                                  const key = mat.name.toLowerCase();
                                  const alreadyAdded = addedMaterials.has(key) || lineItems.some((r) => r.description.toLowerCase().includes(key));
                                  return (
                                    <button
                                      key={mat.name}
                                      type="button"
                                      disabled={alreadyAdded}
                                      onClick={() => handleAddMaterial(mat)}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "var(--space-1)",
                                        padding: "var(--space-1) var(--space-2)",
                                        fontSize: "var(--text-sm)",
                                        background: alreadyAdded ? "var(--color-surface-raised)" : "var(--color-surface-overlay)",
                                        border: `1px solid ${alreadyAdded ? "var(--color-border)" : "var(--color-primary-alpha)"}`,
                                        borderRadius: "var(--radius-sm)",
                                        cursor: alreadyAdded ? "default" : "pointer",
                                        color: alreadyAdded ? "var(--fg-muted)" : "var(--fg-primary)",
                                      }}
                                    >
                                      <span>{mat.name}</span>
                                      <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                                        {mat.typicalQty} {mat.unit}
                                      </span>
                                      {alreadyAdded ? (
                                        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-success)" }}>✓</span>
                                      ) : (
                                        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-primary)" }}>+</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                          <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", margin: "var(--space-2) 0 0" }}>
                            Click to add as a line item. Set prices before submitting.
                          </p>
                        </Card>
                      </div>
                    )}

                    {/* Line items table */}
                    <LineItemsTable
                      items={lineItems}
                      disabled={pending}
                      testIdPrefix="new"
                      onUpdate={updateLineItem}
                      onAdd={addLineItem}
                      onRemove={removeLineItem}
                    />
                  </>
                )}

                {/* Generic totals */}
                {mode !== "multi_option" && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: "var(--space-2)",
                      marginTop: "var(--space-3)",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto auto",
                        gap: "var(--space-2) var(--space-4)",
                        alignItems: "center",
                        textAlign: "right",
                      }}
                    >
                      {mode === "itemized" && (
                        <>
                          <span style={{ color: "var(--fg-muted)" }}>Labor subtotal</span>
                          <span data-testid="subtotal">{formatCents(lineItems.reduce((sum, row) => sum + lineTotal(row), 0))}</span>

                          {scopeMaterialsTotalCents > 0 && (
                            <>
                              <span style={{ color: "var(--fg-muted)" }}>Scope materials</span>
                              <span data-testid="scope-materials">{formatCents(scopeMaterialsTotalCents)}</span>
                            </>
                          )}

                          {materialHandlingCents > 0 && (
                            <>
                              <span style={{ color: "var(--fg-muted)" }}>Material handling (15%)</span>
                              <span data-testid="material-handling">{formatCents(materialHandlingCents)}</span>
                            </>
                          )}

                          <span style={{ color: "var(--fg-muted)" }}>Subtotal with materials</span>
                          <span data-testid="subtotal-with-materials">{formatCents(genericSubtotalCents)}</span>

                          {guardrailAdjustmentCents > 0 && (
                            <>
                              <span style={{ color: "var(--fg-muted)" }}>Pricing adjustments</span>
                              <span>{formatCents(guardrailAdjustmentCents)}</span>
                            </>
                          )}

                          <span style={{ color: "var(--fg-muted)" }}>Deposit (30%)</span>
                          <span data-testid="deposit">{formatCents(depositCents)}</span>

                          <span style={{ fontWeight: "var(--font-semibold)" }}>Balance due</span>
                          <span data-testid="balance-due" style={{ fontWeight: "var(--font-semibold)" }}>{formatCents(balanceDueCents)}</span>
                        </>
                      )}

                      <label htmlFor="tax_rate" style={{ color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
                        Tax Rate (%)
                      </label>
                      <input
                        id="tax_rate"
                        className="p7-input"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={taxRate}
                        onChange={(e) => setTaxRate(e.target.value)}
                        disabled={pending}
                        style={{ width: 90, textAlign: "right" }}
                        data-testid="tax-rate-input"
                      />

                      {genericTaxCents > 0 && (
                        <>
                          <span style={{ color: "var(--fg-muted)" }}>Tax</span>
                          <span data-testid="tax-amount">{formatCents(genericTaxCents)}</span>
                        </>
                      )}

                      <strong>Total (incl. tax)</strong>
                      <strong data-testid="total">{formatCents(genericTotalCents)}</strong>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 3: Adjustments                                                 */}
      {/* ------------------------------------------------------------------ */}
      {step === 3 && (
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
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 4: Review & Send                                               */}
      {/* ------------------------------------------------------------------ */}
      {step === 4 && (
        <div className="p7-form-stack">
          <Card padding="sm" style={{ background: "var(--bg-subtle)" }}>
            <SectionHeader title="Estimate Summary" as="h3" />
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--space-2) var(--space-4)", fontSize: "var(--text-sm)" }}>
              <span style={{ color: "var(--fg-muted)" }}>Client</span>
              <span style={{ fontWeight: 600 }}>{selectedClient?.name ?? "—"}</span>

              {selectedJob && (
                <>
                  <span style={{ color: "var(--fg-muted)" }}>Job</span>
                  <span>{selectedJob.title}</span>
                </>
              )}

              {selectedProperty && (
                <>
                  <span style={{ color: "var(--fg-muted)" }}>Property</span>
                  <span>{selectedProperty.address}</span>
                </>
              )}

              <span style={{ color: "var(--fg-muted)" }}>Type</span>
              <span style={{ textTransform: "capitalize" }}>
                {serviceType === "painting"
                  ? "Painting"
                  : mode === "flat_rate"
                  ? "Flat rate"
                  : mode === "multi_option"
                  ? "Good / Better / Best"
                  : `Itemized (${lineItems.filter(r => r.description.trim()).length} item${lineItems.filter(r => r.description.trim()).length !== 1 ? "s" : ""})`}
              </span>

              <span style={{ color: "var(--fg-muted)" }}>Total</span>
              <span style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{reviewTotal()}</span>

              {expiresAt && (
                <>
                  <span style={{ color: "var(--fg-muted)" }}>Expires</span>
                  <span>{new Date(expiresAt).toLocaleDateString()}</span>
                </>
              )}
            </div>

            {notes.trim() && (
              <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border)" }}>
                <p style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Client notes
                </p>
                <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg)" }}>
                  {notes}
                </p>
              </div>
            )}
          </Card>

          {serviceType === "painting" && !paintingResult && (
            <Card className="p7-card-danger" padding="sm">
              <p style={{ margin: 0 }}>
                Painting estimate is incomplete — go back to Step 2 and enter the square footage.
              </p>
            </Card>
          )}

          <div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={sendImmediately}
                onChange={(e) => setSendImmediately(e.target.checked)}
                disabled={pending}
                data-testid="send-immediately-checkbox"
              />
              <span>Send to client immediately after creating</span>
            </label>
          </div>
        </div>
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
            disabled={pending || !clientId || (serviceType === "painting" && !paintingResult)}
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
  );
}
