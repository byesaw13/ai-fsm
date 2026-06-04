"use client";

import { useState } from "react";
import {
  lineTotal, EMPTY_ROW, DEFAULT_TIERS,
  type LineItemRow, type OptionTier,
} from "@/lib/estimates/form-helpers";

export function useEstimateTiers(getLineItemsSubtotal: () => number, initialMode: "itemized" | "flat_rate" | "multi_option" = "itemized") {
  const [mode, setMode] = useState<"itemized" | "flat_rate" | "multi_option">(initialMode);
  const [flatRate, setFlatRate] = useState("0.00");
  const [tiers, setTiers] = useState<OptionTier[]>(() =>
    DEFAULT_TIERS.map((t) => ({ ...t, line_items: [{ ...EMPTY_ROW }] }))
  );

  function handleModeChange(newMode: "itemized" | "flat_rate" | "multi_option") {
    if (newMode === "flat_rate") {
      setFlatRate((getLineItemsSubtotal() / 100).toFixed(2));
    } else if (newMode === "itemized") {
      // caller resets lineItems if empty
    } else if (newMode === "multi_option") {
      setTiers(DEFAULT_TIERS.map((t) => ({ ...t, line_items: [{ ...EMPTY_ROW }] })));
    }
    setMode(newMode);
  }

  function updateTier(tierIndex: number, updates: Partial<OptionTier>) {
    setTiers((prev) =>
      prev.map((t, i) => (i === tierIndex ? { ...t, ...updates } : t))
    );
  }

  function addTierLineItem(tierIndex: number) {
    setTiers((prev) =>
      prev.map((t, i) =>
        i === tierIndex ? { ...t, line_items: [...t.line_items, { ...EMPTY_ROW }] } : t
      )
    );
  }

  function removeTierLineItem(tierIndex: number, lineIndex: number) {
    setTiers((prev) =>
      prev.map((t, i) =>
        i === tierIndex
          ? { ...t, line_items: t.line_items.filter((_, li) => li !== lineIndex) }
          : t
      )
    );
  }

  function updateTierLineItem(tierIndex: number, lineIndex: number, field: keyof LineItemRow, value: string) {
    setTiers((prev) =>
      prev.map((t, i) =>
        i === tierIndex
          ? {
              ...t,
              line_items: t.line_items.map((row, li) =>
                li === lineIndex ? { ...row, [field]: value } : row
              ),
            }
          : t
      )
    );
  }

  function tierSubtotalCents(tier: OptionTier): number {
    return tier.line_items.reduce((sum, row) => sum + lineTotal(row), 0);
  }

  return {
    mode, setMode,
    flatRate, setFlatRate,
    tiers, setTiers,
    handleModeChange,
    updateTier,
    addTierLineItem,
    removeTierLineItem,
    updateTierLineItem,
    tierSubtotalCents,
  };
}
