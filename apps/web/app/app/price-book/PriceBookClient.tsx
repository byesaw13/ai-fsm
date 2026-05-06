"use client";

import { useState, useMemo } from "react";
import { Card, Input, SectionHeader } from "@/components/ui";
import {
  PRICE_BOOK_CATEGORY_LABELS,
  PRICE_BOOK_TIER_LABELS,
} from "@ai-fsm/domain";

interface Service {
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
  created_at: string;
  updated_at: string;
}

interface Props {
  services: Service[];
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function tierColor(tier: string): string {
  switch (tier) {
    case "core":
      return "var(--status-success)";
    case "standard":
      return "var(--accent)";
    case "specialty":
      return "var(--status-warning)";
    default:
      return "var(--fg-muted)";
  }
}

export default function PriceBookClient({ services }: Props) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(services.map((s) => s.category))].sort(),
    [services]
  );

  const filtered = useMemo(() => {
    return services.filter((s) => {
      if (!s.is_active) return false;
      if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
      if (tierFilter !== "all" && s.tier !== tierFilter) return false;
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
  }, [services, search, categoryFilter, tierFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const s of filtered) {
      const cat = s.category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    return map;
  }, [filtered]);

  const uniqueUpsellCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const s of services) {
      for (const c of s.upsell_codes) codes.add(c);
    }
    return codes;
  }, [services]);

  const serviceByCode = useMemo(() => {
    const map = new Map<string, Service>();
    for (const s of services) map.set(s.code, s);
    return map;
  }, [services]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Price Book</h1>
          <p className="page-subtitle">
            {services.length} services across {categories.length} categories.
            Browse and select items when creating estimates.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "var(--space-3)",
          flexWrap: "wrap",
          marginBottom: "var(--space-4)",
          alignItems: "flex-end",
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input
            id="pb-search"
            label="Search"
            placeholder="Search by code, name, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="pb-category" style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            Category
          </label>
          <select
            id="pb-category"
            className="p7-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ marginLeft: "var(--space-2)" }}
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {PRICE_BOOK_CATEGORY_LABELS[c as keyof typeof PRICE_BOOK_CATEGORY_LABELS] ?? c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pb-tier" style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            Tier
          </label>
          <select
            id="pb-tier"
            className="p7-select"
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            style={{ marginLeft: "var(--space-2)" }}
          >
            <option value="all">All Tiers</option>
            <option value="core">Core</option>
            <option value="standard">Standard</option>
            <option value="specialty">Specialty</option>
          </select>
        </div>
      </div>

      {/* Results count */}
      <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginBottom: "var(--space-3)" }}>
        Showing {filtered.length} of {services.length} services
      </p>

      {/* Grouped by category */}
      {grouped.size === 0 ? (
        <Card padding="sm">
          <p style={{ color: "var(--fg-muted)" }}>No services match your filters.</p>
        </Card>
      ) : (
        [...grouped.entries()].map(([category, items]) => (
          <div key={category} style={{ marginBottom: "var(--space-5)" }}>
            <SectionHeader
              title={PRICE_BOOK_CATEGORY_LABELS[category as keyof typeof PRICE_BOOK_CATEGORY_LABELS] ?? category}
              count={items.length}
              as="h3"
            />
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              {items.map((service) => {
                const isExpanded = expandedCode === service.code;
                const upsellItems = service.upsell_codes
                  .map((c) => serviceByCode.get(c))
                  .filter(Boolean) as Service[];

                return (
                  <Card
                    key={service.id}
                    padding="sm"
                    style={{
                      cursor: "pointer",
                      borderLeft: `3px solid ${tierColor(service.tier)}`,
                    }}
                    onClick={() => setExpandedCode(isExpanded ? null : service.code)}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontSize: "var(--text-sm)",
                              color: "var(--fg-muted)",
                              minWidth: 36,
                            }}
                          >
                            {service.code}
                          </span>
                          <span style={{ fontWeight: 600 }}>{service.name}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", textAlign: "right" }}>
                        <span
                          style={{
                            fontSize: "var(--text-xs)",
                            padding: "2px 8px",
                            borderRadius: 99,
                            fontWeight: 600,
                            color: "#fff",
                            background: tierColor(service.tier),
                          }}
                        >
                          {PRICE_BOOK_TIER_LABELS[service.tier as keyof typeof PRICE_BOOK_TIER_LABELS]}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
                          {formatPrice(service.price_min_cents)}
                          {service.price_max_cents
                            ? service.price_max_cents !== service.price_min_cents
                              ? `–${formatPrice(service.price_max_cents)}`
                              : ""
                            : "+"}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div
                        style={{
                          marginTop: "var(--space-3)",
                          paddingTop: "var(--space-2)",
                          borderTop: "1px solid var(--border)",
                          fontSize: "var(--text-sm)",
                        }}
                      >
                        {service.description && (
                          <p style={{ margin: "0 0 var(--space-2)", color: "var(--fg-muted)" }}>
                            {service.description}
                          </p>
                        )}
                        {service.notes && (
                          <p style={{ margin: "0 0 var(--space-2)", color: "var(--fg-muted)", fontStyle: "italic" }}>
                            {service.notes}
                          </p>
                        )}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "auto auto auto",
                            gap: "var(--space-1) var(--space-4)",
                            fontSize: "var(--text-sm)",
                          }}
                        >
                          <span style={{ color: "var(--fg-muted)" }}>Est. hours:</span>
                          <span>{service.default_labor_hours ?? "—"}</span>
                          <span></span>

                          <span style={{ color: "var(--fg-muted)" }}>Materials:</span>
                          <span>{service.requires_materials ? "Typically required" : "Not typically needed"}</span>
                          <span></span>

                          {service.default_price_cents !== null && (
                            <>
                              <span style={{ color: "var(--fg-muted)" }}>Default price:</span>
                              <span>${((service.default_price_cents || 0) / 100).toFixed(2)}</span>
                              <span></span>
                            </>
                          )}

                          {service.add_on_price_cents !== null && (
                            <>
                              <span style={{ color: "var(--fg-muted)" }}>Add-on price:</span>
                              <span>${((service.add_on_price_cents || 0) / 100).toFixed(2)}</span>
                              <span></span>
                            </>
                          )}

                          {service.unit_type && service.unit_type !== "flat" && (
                            <>
                              <span style={{ color: "var(--fg-muted)" }}>Unit type:</span>
                              <span>{service.unit_type.replace("_", " ")}</span>
                              <span></span>
                            </>
                          )}


                          {upsellItems.length > 0 && (
                            <>
                              <span style={{ color: "var(--fg-muted)" }}>Also consider:</span>
                              <span style={{ gridColumn: "span 2" }}>
                                {upsellItems.map((u) => `${u.code} — ${u.name}`).join("; ")}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
