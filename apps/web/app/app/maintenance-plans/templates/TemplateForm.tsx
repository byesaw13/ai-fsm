"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { LinkButton } from "@/components/ui";

interface TemplateFormProps {
  initialData?: {
    id: string;
    name: string;
    tier: string;
    description: string | null;
    visit_count_per_year: number;
    included_labor_minutes_per_visit: number;
    base_price_cents: number;
    included_features: string[];
    is_active: boolean;
    sort_order: number;
  };
}

export function TemplateForm({ initialData }: TemplateFormProps) {
  const router = useRouter();
  const isEdit = !!initialData;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initialData?.name ?? "");
  const [tier, setTier] = useState(initialData?.tier ?? "plus");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [visitCount, setVisitCount] = useState(String(initialData?.visit_count_per_year ?? 2));
  const [laborMinutes, setLaborMinutes] = useState(String(initialData?.included_labor_minutes_per_visit ?? 60));
  const [basePriceDollars, setBasePriceDollars] = useState(
    initialData?.base_price_cents ? (initialData.base_price_cents / 100).toFixed(0) : ""
  );
  const [features, setFeatures] = useState((initialData?.included_features ?? []).join("\n"));
  const [isActive, setIsActive] = useState(initialData?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(String(initialData?.sort_order ?? 0));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      name: name.trim(),
      tier,
      description: description.trim() || null,
      visit_count_per_year: parseInt(visitCount) || 2,
      included_labor_minutes_per_visit: parseInt(laborMinutes) || 60,
      base_price_cents: Math.round((parseFloat(basePriceDollars) || 0) * 100),
      included_features: features.split("\n").map((s) => s.trim()).filter(Boolean),
      is_active: isActive,
      sort_order: parseInt(sortOrder) || 0,
    };

    try {
      const url = isEdit
        ? `/api/v1/plan-templates/${initialData!.id}`
        : "/api/v1/plan-templates";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error?.message ?? "Failed to save template");
        return;
      }
      router.push("/app/maintenance-plans/templates" as unknown as Route);
      router.refresh();
    } catch {
      setError("Network error — could not save template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", maxWidth: 640 }}>

      <div className="p7-field">
        <label htmlFor="name" className="p7-label p7-label-required">Template Name</label>
        <input id="name" className="p7-input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Plus Plan" />
      </div>

      <div className="p7-field">
        <label className="p7-label p7-label-required">Tier</label>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          {(["essential", "plus", "premier"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              style={{
                flex: 1, padding: "var(--space-2) var(--space-3)",
                border: `2px solid ${tier === t ? "var(--color-primary)" : "var(--color-border)"}`,
                borderRadius: "var(--radius-md)",
                background: tier === t ? "var(--color-primary)" : "var(--color-surface)",
                color: tier === t ? "#fff" : "var(--color-text-primary)",
                fontWeight: 600, fontSize: "var(--font-size-sm)", cursor: "pointer", textTransform: "capitalize",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="p7-field">
        <label htmlFor="description" className="p7-label">Description</label>
        <textarea id="description" className="p7-textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description shown to clients" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-3)" }}>
        <div className="p7-field">
          <label htmlFor="visit_count" className="p7-label p7-label-required">Visits / Year</label>
          <input id="visit_count" className="p7-input" type="number" min="1" required value={visitCount} onChange={(e) => setVisitCount(e.target.value)} />
        </div>
        <div className="p7-field">
          <label htmlFor="labor_minutes" className="p7-label p7-label-required">Labor Cap (min)</label>
          <input id="labor_minutes" className="p7-input" type="number" min="0" required value={laborMinutes} onChange={(e) => setLaborMinutes(e.target.value)} />
        </div>
        <div className="p7-field">
          <label htmlFor="base_price" className="p7-label">Base Price / Year ($)</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: "var(--space-3)", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary)" }}>$</span>
            <input
              id="base_price" className="p7-input" type="number" min="0" step="1"
              style={{ paddingLeft: "var(--space-6)" }}
              value={basePriceDollars}
              onChange={(e) => setBasePriceDollars(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
      </div>

      <div className="p7-field">
        <label htmlFor="features" className="p7-label">Included Features</label>
        <textarea
          id="features" className="p7-textarea" rows={5}
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
          placeholder={"One feature per line — shown as ✓ bullets on the plan comparison page\ne.g.\n2 comprehensive visits/year\nPriority scheduling\nDetailed home health report"}
        />
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
          One item per line. These appear as marketing bullet points when clients compare plans.
        </span>
      </div>

      <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "center" }}>
        <div className="p7-field" style={{ flex: 1 }}>
          <label htmlFor="sort_order" className="p7-label">Sort Order</label>
          <input id="sort_order" className="p7-input" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer", marginTop: "var(--space-4)" }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span style={{ fontSize: "var(--font-size-sm)" }}>Active (visible for new enrollments)</span>
        </label>
      </div>

      {error && (
        <div style={{ color: "var(--color-error, #dc2626)", fontSize: "var(--font-size-sm)" }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <LinkButton href="/app/maintenance-plans/templates" variant="ghost" size="default">Cancel</LinkButton>
        <button type="submit" className="p7-btn p7-btn-primary p7-btn-md" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Template"}
        </button>
      </div>
    </form>
  );
}
