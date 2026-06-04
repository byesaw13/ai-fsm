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
  initialPricingMode?: "itemized" | "flat_rate" | "multi_option";
  initialMode?: EstimateMode;
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
  initialPricingMode = "itemized",
  initialMode,
}: EstimateEntryShellProps) {
  const [mode, setMode] = useState<EstimateMode | null>(initialMode ?? null);
  // After interview applies draft: switch to manual form pre-populated
  const [appliedDraft, setAppliedDraft] = useState<{
    draft: DraftEstimate;
    shoppingList: ShoppingList | null;
  } | null>(null);

  if (!mode) {    return (
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
        initialPricingMode={initialPricingMode}
        initialInterviewDraft={appliedDraft ?? undefined}
      />
    </Card>
  );
}
