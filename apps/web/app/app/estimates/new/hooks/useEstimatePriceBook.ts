"use client";

import { useState, useMemo } from "react";
import type { PriceBookService } from "@/components/PriceBookSelector";
import type { ScopeBuilderResult } from "@/components/ScopeBuilder";
import type { LineItemRow } from "@/lib/estimates/form-helpers";

export interface PriceBookEntry {
  service: PriceBookService;
  priceCents: number;
  instanceId: string;
}

interface UseEstimatePriceBookReturn {
  priceBookItems: PriceBookEntry[];
  setPriceBookItems: React.Dispatch<React.SetStateAction<PriceBookEntry[]>>;
  scopeResults: Record<string, ScopeBuilderResult>;
  setScopeResults: React.Dispatch<React.SetStateAction<Record<string, ScopeBuilderResult>>>;
  priceBookLineItems: {
    description: string;
    quantity: number;
    unit_price_cents: number;
    sort_order: number;
    price_book_id: string;
    price_book_code: string;
  }[];
  scopeMaterialsTotalCents: number;
  handleAddPriceBookItem: (service: PriceBookService, priceCents: number, onAddLineItem: (row: LineItemRow) => void) => void;
  handleScopeChange: (instanceId: string, result: ScopeBuilderResult) => void;
  removePriceBookItem: (instanceId: string) => void;
}

export function useEstimatePriceBook(): UseEstimatePriceBookReturn {
  const [priceBookItems, setPriceBookItems] = useState<PriceBookEntry[]>([]);
  const [scopeResults, setScopeResults] = useState<Record<string, ScopeBuilderResult>>({});

  const priceBookLineItems = useMemo(
    () =>
      priceBookItems.map((item, i) => ({
        description: `${item.service.code} — ${item.service.name}`,
        quantity: 1,
        unit_price_cents: scopeResults[item.instanceId]?.adjustedPriceCents ?? item.priceCents,
        sort_order: i,
        price_book_id: item.service.id,
        price_book_code: item.service.code,
      })),
    [priceBookItems, scopeResults]
  );

  const scopeMaterialsTotalCents = useMemo(
    () => priceBookItems.reduce((sum, item) => sum + (scopeResults[item.instanceId]?.materialTotalCents ?? 0), 0),
    [priceBookItems, scopeResults]
  );

  function handleAddPriceBookItem(
    service: PriceBookService,
    priceCents: number,
    onAddLineItem: (row: LineItemRow) => void
  ) {
    const instanceId = `${service.id}-${Date.now()}`;
    setPriceBookItems((prev) => [...prev, { service, priceCents, instanceId }]);
    const unitPrice = service.default_price_cents ?? priceCents;
    const description = `${service.code} — ${service.name}${service.description ? ` — ${service.description}` : ""}`;
    onAddLineItem({ description, quantity: "1", unit_price: (unitPrice / 100).toFixed(2), price_book_id: service.id });
  }

  function handleScopeChange(instanceId: string, result: ScopeBuilderResult) {
    setScopeResults((prev) => ({ ...prev, [instanceId]: result }));
  }

  function removePriceBookItem(instanceId: string) {
    setPriceBookItems((prev) => prev.filter((item) => item.instanceId !== instanceId));
    setScopeResults((prev) => {
      const next = { ...prev };
      delete next[instanceId];
      return next;
    });
  }

  return {
    priceBookItems, setPriceBookItems,
    scopeResults, setScopeResults,
    priceBookLineItems,
    scopeMaterialsTotalCents,
    handleAddPriceBookItem,
    handleScopeChange,
    removePriceBookItem,
  };
}
