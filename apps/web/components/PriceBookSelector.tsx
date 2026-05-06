"use client";

import { useState, useEffect, useCallback } from "react";
import { Input, Card, Button } from "@/components/ui";
import { PRICE_BOOK_CATEGORY_LABELS, PRICE_BOOK_TIER_LABELS } from "@ai-fsm/domain";

export interface PriceBookService {
  id: string;
  code: string;
  name: string;
  category: string;
  tier: string;
  price_min_cents: number;
  price_max_cents: number | null;
  default_price_cents: number | null;
  add_on_price_cents: number | null;
  unit_type: string | null;
  description: string | null;
  notes: string | null;
  default_labor_hours: number | null;
  requires_materials: boolean;
  upsell_codes: string[];
  is_active: boolean;
}

interface PriceBookSelectorProps {
  onAddToEstimate: (service: PriceBookService, selectedPrice: number) => void;
}

export function PriceBookSelector({ onAddToEstimate }: PriceBookSelectorProps) {
  const [services, setServices] = useState<PriceBookService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selectedService, setSelectedService] = useState<PriceBookService | null>(null);
  const [customPrice, setCustomPrice] = useState("");

  useEffect(() => {
    async function fetchServices() {
      try {
        const res = await fetch("/api/v1/price-book?limit=200");
        if (res.ok) {
          const json = await res.json();
          setServices(json.data ?? []);
        }
      } catch {
        // silently fail — price book is optional
      } finally {
        setLoading(false);
      }
    }
    fetchServices();
  }, []);

  const filtered = services.filter((s) => {
    if (!s.is_active) return false;
    if (categoryFilter && s.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const categories = [...new Set(services.map((s) => s.category))].sort();

  function handleSelect(service: PriceBookService) {
    if (selectedService?.id === service.id) {
      setSelectedService(null);
      setCustomPrice("");
    } else {
      setSelectedService(service);
      const defaultPrice = service.default_price_cents ?? service.price_min_cents;
      setCustomPrice((defaultPrice / 100).toFixed(2));
    }
  }

  function handleAdd() {
    if (!selectedService) return;
    const price = Math.round(parseFloat(customPrice || "0") * 100);
    if (price <= 0) return;
    onAddToEstimate(selectedService, price);
    setSelectedService(null);
    setCustomPrice("");
    setSearch("");
  }

  const suggestedUpsells = selectedService?.upsell_codes
    .map((c) => services.find((s) => s.code === c))
    .filter(Boolean) as PriceBookService[] | undefined;

  return (
    <div>
      <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
        <div style={{ flex: 1 }}>
          <Input
            id="pb-selector-search"
            label=""
            placeholder="Search price book (code, name, or keyword)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <select
            className="p7-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ marginTop: "var(--space-6)", height: 36 }}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {PRICE_BOOK_CATEGORY_LABELS[c as keyof typeof PRICE_BOOK_CATEGORY_LABELS] ?? c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>Loading price book...</p>
      ) : (
        <>
          <div
            style={{
              maxHeight: 300,
              overflowY: "auto",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}
          >
            {filtered.length === 0 ? (
              <p style={{ padding: "var(--space-3)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
                No matching services.
              </p>
            ) : (
              filtered.map((s) => (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelect(s)}
                  onKeyDown={(e) => e.key === "Enter" && handleSelect(s)}
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    cursor: "pointer",
                    background: selectedService?.id === s.id ? "var(--bg-selected)" : "transparent",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <span style={{ fontFamily: "monospace", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                      {s.code}
                    </span>{" "}
                    <span style={{ fontWeight: 500, fontSize: "var(--text-sm)" }}>{s.name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <span
                      style={{
                        fontSize: "var(--text-xs)",
                        padding: "1px 6px",
                        borderRadius: 99,
                        fontWeight: 600,
                        color: "#fff",
                        background:
                          s.tier === "core"
                            ? "var(--status-success)"
                            : s.tier === "standard"
                            ? "var(--accent)"
                            : "var(--status-warning)",
                      }}
                    >
                      {PRICE_BOOK_TIER_LABELS[s.tier as keyof typeof PRICE_BOOK_TIER_LABELS]}
                    </span>
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                      ${(s.price_min_cents / 100).toFixed(0)}
                      {s.price_max_cents && s.price_max_cents > s.price_min_cents
                        ? `–$${(s.price_max_cents / 100).toFixed(0)}`
                        : "+"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {selectedService && (
            <div
              style={{
                marginTop: "var(--space-3)",
                padding: "var(--space-3)",
                background: "var(--bg-subtle)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
                <div>
                  <span style={{ fontFamily: "monospace", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                    {selectedService.code}
                  </span>{" "}
                  <strong>{selectedService.name}</strong>
                  {selectedService.description && (
                    <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                      {selectedService.description}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <div>
                    <label htmlFor="pb-custom-price" style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                      Price ($)
                    </label>
                    <input
                      id="pb-custom-price"
                      className="p7-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={customPrice}
                      onChange={(e) => setCustomPrice(e.target.value)}
                      style={{ width: 100, marginTop: "var(--space-1)" }}
                    />
                  </div>
                  <Button type="button" variant="primary" size="sm" onClick={handleAdd}>
                    + Add to Estimate
                  </Button>
                </div>
              </div>

              {selectedService.notes && (
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontStyle: "italic" }}>
                  {selectedService.notes}
                </p>
              )}

              {suggestedUpsells && suggestedUpsells.length > 0 && (
                <div style={{ marginTop: "var(--space-2)", paddingTop: "var(--space-2)", borderTop: "1px solid var(--border)" }}>
                  <p style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-muted)" }}>
                    Suggested add-ons:
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
                    {suggestedUpsells.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleSelect(u)}
                        style={{
                          fontSize: "var(--text-xs)",
                          padding: "2px 8px",
                          borderRadius: 99,
                          border: "1px solid var(--border)",
                          background: "var(--bg-surface)",
                          cursor: "pointer",
                        }}
                      >
                        {u.code} — {u.name} (${(u.price_min_cents / 100).toFixed(0)}+)
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
