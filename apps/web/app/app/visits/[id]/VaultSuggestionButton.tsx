"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import type { VisitChecklistItem } from "@ai-fsm/domain";
import { buildVaultSuggestion, shouldSuggestVaultItem } from "@/lib/visits/vault-suggestions";

interface Props {
  propertyId: string | null;
  visitId: string;
  item: Pick<VisitChecklistItem, "section" | "item_key" | "label" | "note" | "disposition">;
}

export function VaultSuggestionButton({ propertyId, visitId, item }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  if (!propertyId || !shouldSuggestVaultItem(item.disposition ?? null)) return null;

  async function handleCreate() {
    setCreating(true);
    try {
      const suggestion = buildVaultSuggestion(item);
      const res = await fetch(`/api/v1/properties/${propertyId}/vault-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...suggestion,
          linked_visit_id: visitId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error?.message ?? "Failed to add vault item");
        return;
      }
      toast.success("Added to property vault");
      router.refresh();
    } catch {
      toast.error("Unexpected error adding vault item");
    } finally {
      setCreating(false);
    }
  }

  return (
    <button
      className="p7-btn p7-btn-ghost p7-btn-sm"
      onClick={handleCreate}
      disabled={creating}
      data-testid={`add-vault-item-${item.item_key}`}
    >
      {creating ? "Adding…" : "Add to Vault"}
    </button>
  );
}
