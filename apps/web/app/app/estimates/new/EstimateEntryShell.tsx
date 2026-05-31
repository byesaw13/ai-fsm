"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { EstimateLaunchModal, type EstimateMode } from "./EstimateLaunchModal";
import { EstimateInterviewFlow } from "./EstimateInterviewFlow";
import { NewEstimateForm } from "./NewEstimateForm";
import type { DraftEstimate } from "@/lib/estimates/ai-draft";
import type { ShoppingList } from "@ai-fsm/domain";

interface EstimateEntryShellProps {
  // Props passed down to NewEstimateForm
  clients: { id: string; name: string }[];
  jobs: { id: string; title: string; client_id: string }[];
  properties: { id: string; address: string; client_id: string }[];
  initialClientId?: string;
  initialJobId?: string;
  initialPropertyId?: string;
  initialVaultItemId?: string;
  vaultItemContext?: { name: string; category: string; location: string | null } | null;
}

export function EstimateEntryShell({
  clients,
  jobs,
  properties,
  initialClientId,
  initialJobId,
  initialPropertyId,
  initialVaultItemId,
  vaultItemContext,
}: EstimateEntryShellProps) {
  const [mode, setMode] = useState<EstimateMode | null>(null);
  // After interview applies draft: switch to manual form pre-populated
  const [appliedDraft, setAppliedDraft] = useState<{
    draft: DraftEstimate;
    shoppingList: ShoppingList | null;
  } | null>(null);

  // If we have a pre-set context (vault item, specific job), skip launch modal
  // and go straight to AI interview with that context
  const hasContext = !!(initialVaultItemId || (initialJobId && initialClientId));

  if (!mode) {
    // If context provided, optionally auto-select AI mode
    // For now, always show modal even with context
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
            setMode("manual");
          }}
          onSwitchToManual={() => setMode("manual")}
        />
      </Card>
    );
  }

  // Manual / post-interview: render existing form
  // When coming from interview, the form will pick up the draft from
  // a sessionStorage pre-fill mechanism (handled by onApplyDraft above)
  return (
    <Card>
      <NewEstimateForm
        clients={clients}
        jobs={jobs}
        properties={properties}
        initialClientId={initialClientId}
        initialJobId={initialJobId}
        initialPropertyId={initialPropertyId}
        initialVaultItemId={initialVaultItemId}
        vaultItemContext={vaultItemContext}
        initialInterviewDraft={appliedDraft ?? undefined}
      />
    </Card>
  );
}
