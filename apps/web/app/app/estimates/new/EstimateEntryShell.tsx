"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { EstimateLaunchModal, resolveEntryPricingMode, type EstimateMode } from "./EstimateLaunchModal";
import { EstimateInterviewFlow } from "./EstimateInterviewFlow";
import { TmBriefingFlow } from "./TmBriefingFlow";
import { NewEstimateForm } from "./NewEstimateForm";
import type { DraftEstimate } from "@/lib/estimates/ai-draft";
import type { TmEstimateDraft } from "@/lib/estimates/tm-briefing";
import type { ShoppingList } from "@ai-fsm/domain";
import type { AssessmentContext } from "@/lib/estimates/assessment-context";

interface EstimateEntryShellProps {
  defaultDepositPercent?: number;
  // Props passed down to NewEstimateForm
  clients: { id: string; name: string }[];
  jobs: { id: string; title: string; client_id: string }[];
  properties: { id: string; address: string; client_id: string }[];
  initialClientId?: string;
  initialJobId?: string;
  initialPropertyId?: string;
  initialVaultItemId?: string;
  vaultItemContext?: { name: string; category: string; location: string | null } | null;
  initialPricingMode?: "itemized" | "flat_rate" | "multi_option";
  initialMode?: EstimateMode;
  initialNotes?: string;
  bookingRequestId?: string;
  serverAssessmentContext?: AssessmentContext | null;
  /** Job notes assembled for T&M paste path */
  initialTmBriefing?: string;
  /** Auto-run T&M generate when landing with a briefing (job one-click) */
  autoGenerateTm?: boolean;
}

export function EstimateEntryShell({
  defaultDepositPercent,
  clients,
  jobs,
  properties,
  initialClientId,
  initialJobId,
  initialPropertyId,
  initialVaultItemId,
  vaultItemContext,
  initialPricingMode,
  initialMode,
  initialNotes,
  bookingRequestId,
  serverAssessmentContext,
  initialTmBriefing,
  autoGenerateTm = false,
}: EstimateEntryShellProps) {
  const [mode, setMode] = useState<EstimateMode | null>(initialMode ?? null);
  // After interview applies draft: switch to the manual form pre-populated.
  const [appliedDraft, setAppliedDraft] = useState<{
    draft: DraftEstimate;
    shoppingList: ShoppingList | null;
  } | null>(null);
  const [appliedTmDraft, setAppliedTmDraft] = useState<TmEstimateDraft | null>(null);

  if (!mode) {
    return (
      <Card style={{ padding: "var(--space-6)" }}>
        <EstimateLaunchModal onSelect={setMode} />
      </Card>
    );
  }

  if (mode === "ai" && !appliedDraft) {
    return (
      <Card style={{ padding: "var(--space-4)" }}>
        <EstimateInterviewFlow
          jobId={initialJobId}
          clientId={initialClientId}
          onApplyDraft={({ draft, shoppingList }) => {
            setAppliedDraft({ draft, shoppingList });
            // AI drafts produce line items → continue in itemized form.
            setMode("detailed");
          }}
          onSwitchToManual={() => setMode("detailed")}
        />
      </Card>
    );
  }

  if (mode === "tm" && !appliedTmDraft) {
    return (
      <Card style={{ padding: "var(--space-4)" }}>
        <TmBriefingFlow
          jobId={initialJobId}
          clientId={initialClientId}
          initialBriefing={initialTmBriefing}
          autoGenerate={autoGenerateTm}
          onApplyDraft={({ draft }) => {
            setAppliedTmDraft(draft);
            setMode("detailed");
          }}
          onSwitchToManual={() => setMode("detailed")}
          onSwitchToAi={() => setMode("ai")}
        />
      </Card>
    );
  }

  // Resolve the form's pricing mode from the entry mode (Quick → flat-rate,
  // Detailed/AI/T&M → itemized). An explicit URL/preset pricing mode still wins.
  const resolvedPricingMode = resolveEntryPricingMode(mode, initialPricingMode);

  // Manual / post-interview form. When coming from the interview, the form picks
  // up the applied draft (sessionStorage + initialInterviewDraft).
  return (
    <Card>
      <NewEstimateForm
        defaultDepositPercent={defaultDepositPercent}
        clients={clients}
        jobs={jobs}
        properties={properties}
        initialClientId={initialClientId}
        initialJobId={initialJobId}
        initialPropertyId={initialPropertyId}
        initialVaultItemId={initialVaultItemId}
        vaultItemContext={vaultItemContext}
        initialPricingMode={resolvedPricingMode}
        initialInterviewDraft={appliedDraft ?? undefined}
        initialTmDraft={appliedTmDraft ?? undefined}
        initialNotes={initialNotes}
        bookingRequestId={bookingRequestId}
        serverAssessmentContext={serverAssessmentContext}
      />
    </Card>
  );
}
