"use client";

import { useState } from "react";
import { Button, Card, Input, SectionHeader, Textarea } from "@/components/ui";
import { MaterialsGenerator } from "../../components/MaterialsGenerator";
import { PriceBookSelector } from "@/components/PriceBookSelector";
import { ScopeBuilder } from "@/components/ScopeBuilder";
import { getMaterialsByCategory, type MaterialSuggestion } from "@ai-fsm/domain";
import { formatCents } from "@/lib/estimates/pricing";
import { PaintingEstimatorSection } from "../../components/PaintingEstimatorSection";
import { EstimateTierEditor } from "../../components/EstimateTierEditor";
import { LineItemsTable } from "../../components/LineItemsTable";
import type { LineItemRow, OptionTier } from "../hooks/useEstimateForm";
import type { PaintingEstimateResult } from "../hooks/useEstimatePricing";
import type { EditableSuggestion, ScopeResult } from "../hooks/useEstimateAI";
import type { DraftEstimate } from "@/lib/estimates/ai-draft";
import { DraftReviewPanel } from "./DraftReviewPanel";
import type { PriceBookEntry } from "../hooks/useEstimatePriceBook";
import type { ScopeBuilderResult } from "@/components/ScopeBuilder";
import type { PriceBookService } from "@/components/PriceBookSelector";

interface Step2Props {
  pending: boolean;
  serviceType: "painting" | "generic";
  // Painting fields
  sqFt: string;
  setSqFt: (v: string) => void;
  laborHours: string;
  setLaborHours: (v: string) => void;
  materialCostDollars: string;
  setMaterialCostDollars: (v: string) => void;
  prepLevel: number;
  setPrepLevel: (v: number) => void;
  includesTrim: boolean;
  setIncludesTrim: (v: boolean) => void;
  includesCeiling: boolean;
  setIncludesCeiling: (v: boolean) => void;
  paintingResult: PaintingEstimateResult | null;
  prepLevelLabels: Record<number, string>;
  scopeParsing: boolean;
  scopeNotes: string;
  setScopeNotes: (v: string) => void;
  scopeError: string | null;
  scopeResult: ScopeResult | null;
  // AI Draft (generic)
  aiDraftMode: "idle" | "input" | "loading" | "review" | "applied";
  setAiDraftMode: (v: "idle" | "input" | "loading" | "review" | "applied") => void;
  aiDescription: string;
  setAiDescription: (v: string) => void;
  aiConfidenceNotes: string | null;
  aiConfidenceDismissed: boolean;
  setAiConfidenceDismissed: (v: boolean) => void;
  applyDraft: () => void;
  pendingDraft: DraftEstimate | null;
  applyPendingDraft: () => void;
  discardPendingDraft: () => void;
  // Generic pricing / price book
  mode: "itemized" | "flat_rate" | "multi_option";
  handleModeChange: (m: "itemized" | "flat_rate" | "multi_option") => void;
  priceBookItems: PriceBookEntry[];
  removePriceBookItem: (instanceId: string) => void;
  scopeResults: Record<string, ScopeBuilderResult>;
  handleScopeChange: (instanceId: string, result: ScopeBuilderResult) => void;
  pendingDraftScope: Record<string, { scopeValues: Record<string, number | string>; complexityFactors: string[] }>;
  handleAddPriceBookItem: (service: PriceBookService, priceCents: number) => void;
  // Tiers / flat rate
  flatRate: string;
  setFlatRate: (v: string) => void;
  tiers: OptionTier[];
  taxRateNum: number;
  updateTier: (tierIndex: number, updates: Partial<OptionTier>) => void;
  addTierLineItem: (tierIndex: number) => void;
  removeTierLineItem: (tierIndex: number, lineIndex: number) => void;
  updateTierLineItem: (tierIndex: number, lineIndex: number, field: keyof LineItemRow, value: string) => void;
  tierSubtotalCents: (tier: OptionTier) => number;
  // Item suggester
  itemDescription: string;
  setItemDescription: (v: string) => void;
  itemSuggesting: boolean;
  itemSuggestError: string | null;
  suggestions: EditableSuggestion[];
  setSuggestions: (v: EditableSuggestion[]) => void;
  bundleCategories: number;
  hasLegalFlagSuggestions: boolean;
  handleAddSuggestion: (index: number) => void;
  handleSkipSuggestion: (index: number) => void;
  // Materials
  resolvedJobType: string | null;
  addedMaterials: Set<string>;
  handleAddMaterial: (mat: MaterialSuggestion) => void;
  // Line items
  lineItems: LineItemRow[];
  addLineItem: () => void;
  addBulkLineItems: (items: LineItemRow[]) => void;
  removeLineItem: (index: number) => void;
  updateLineItem: (index: number, field: keyof LineItemRow, value: string) => void;
  // Totals
  scopeMaterialsTotalCents: number;
  materialHandlingCents: number;
  genericSubtotalCents: number;
  guardrailAdjustmentCents: number;
  genericTaxCents: number;
  genericTotalCents: number;
  depositCents: number;
  balanceDueCents: number;
  taxRate: string;
  setTaxRate: (v: string) => void;
  lineTotal: (row: LineItemRow) => number;
}

export function Step2Pricing({
  pending, serviceType,
  sqFt, setSqFt, laborHours, setLaborHours, materialCostDollars, setMaterialCostDollars,
  prepLevel, setPrepLevel, includesTrim, setIncludesTrim, includesCeiling, setIncludesCeiling,
  paintingResult, prepLevelLabels,
  scopeParsing, scopeNotes, setScopeNotes, scopeError, scopeResult,
  aiDraftMode, setAiDraftMode, aiDescription, setAiDescription,
  aiConfidenceNotes, aiConfidenceDismissed, setAiConfidenceDismissed, applyDraft,
  pendingDraft, applyPendingDraft, discardPendingDraft,
  mode, handleModeChange,
  priceBookItems, removePriceBookItem, scopeResults, handleScopeChange, pendingDraftScope,
  handleAddPriceBookItem,
  flatRate, setFlatRate,
  tiers, taxRateNum, updateTier, addTierLineItem, removeTierLineItem, updateTierLineItem, tierSubtotalCents,
  itemDescription, setItemDescription, itemSuggesting, itemSuggestError,
  suggestions, setSuggestions, bundleCategories, hasLegalFlagSuggestions,
  handleAddSuggestion, handleSkipSuggestion,
  resolvedJobType, addedMaterials, handleAddMaterial,
  lineItems, addLineItem, addBulkLineItems, removeLineItem, updateLineItem,
  scopeMaterialsTotalCents, materialHandlingCents,
  genericSubtotalCents, guardrailAdjustmentCents, genericTaxCents, genericTotalCents,
  depositCents, balanceDueCents,
  taxRate, setTaxRate,
  lineTotal,
}: Step2Props) {
  const [showMaterialsGen, setShowMaterialsGen] = useState(false);
  return (
    <div className="p7-form-stack">
      {/* Painting Estimator */}
      {serviceType === "painting" && (
        <PaintingEstimatorSection
          idPrefix="new"
          disabled={pending}
          sqFt={sqFt} setSqFt={setSqFt}
          laborHours={laborHours} setLaborHours={setLaborHours}
          materialCostDollars={materialCostDollars} setMaterialCostDollars={setMaterialCostDollars}
          prepLevel={prepLevel} setPrepLevel={setPrepLevel}
          includesTrim={includesTrim} setIncludesTrim={setIncludesTrim}
          includesCeiling={includesCeiling} setIncludesCeiling={setIncludesCeiling}
          paintingResult={paintingResult}
          prepLevelLabels={prepLevelLabels}
          scopeParserSlot={
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
          }
        />
      )}

      {/* AI Draft review panel — shown when confidence is medium/low */}
      {serviceType === "generic" && aiDraftMode === "review" && pendingDraft && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <DraftReviewPanel
            draft={pendingDraft}
            onApply={applyPendingDraft}
            onRedescribe={discardPendingDraft}
          />
        </div>
      )}

      {/* AI Draft panel — generic mode only */}
      {serviceType === "generic" && aiDraftMode !== "applied" && aiDraftMode !== "review" && (
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
                          serviceCode={item.service.code}
                          unitType={item.service.unit_type}
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

                {/* Materials Generator */}
                {showMaterialsGen ? (
                  <div style={{ marginTop: "var(--space-3)", padding: "var(--space-3)", background: "var(--bg-subtle)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                    <MaterialsGenerator
                      onAddToEstimate={(matItems) => {
                        addBulkLineItems(
                          matItems.map((m) => ({
                            description: `${m.name}${m.brand ? ` (${m.brand})` : ""} — ${m.quantity} ${m.unit}`,
                            quantity: "1",
                            unit_price: (m.total_cost_cents / 100).toFixed(2),
                          }))
                        );
                        setShowMaterialsGen(false);
                      }}
                      onClose={() => setShowMaterialsGen(false)}
                    />
                  </div>
                ) : (
                  <div style={{ marginTop: "var(--space-2)" }}>
                    <button
                      type="button"
                      onClick={() => setShowMaterialsGen(true)}
                      disabled={pending}
                      className="p7-btn p7-btn-ghost p7-btn-sm"
                    >
                      Generate Materials List →
                    </button>
                  </div>
                )}
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
  );
}
