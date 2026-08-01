"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Card,
  Input,
  PageContainer,
  PageHeader,
  SectionHeader,
  LinkButton,
  HubSubnav,
} from "@/components/ui";
import { MONEY_HUB_LINKS } from "@/lib/navigation/hubs";
import { formatCents } from "@/lib/money";
import type { MaterialCatalogRow } from "./page";

const CATEGORY_LABELS: Record<string, string> = {
  paint: "Paint",
  lumber: "Lumber",
  hardware: "Hardware",
  concrete: "Concrete",
  fasteners: "Fasteners",
  sheet_goods: "Sheet goods",
  trim: "Trim",
  flooring: "Flooring",
  other: "Other",
};

interface Props {
  materials: MaterialCatalogRow[];
  canManage: boolean;
}

export default function MaterialsCatalogClient({ materials: initial, canManage }: Props) {
  const [materials, setMaterials] = useState(initial);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editLastCents, setEditLastCents] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suppliers = useMemo(() => {
    const set = new Set<string>();
    for (const m of materials) {
      if (m.supplier) set.add(m.supplier);
    }
    return [...set].sort();
  }, [materials]);

  const categories = useMemo(() => {
    return [...new Set(materials.map((m) => m.category))].sort();
  }, [materials]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (categoryFilter !== "all" && m.category !== categoryFilter) return false;
      if (supplierFilter !== "all" && (m.supplier ?? "") !== supplierFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.sku ?? "").toLowerCase().includes(q) ||
        (m.supplier ?? "").toLowerCase().includes(q)
      );
    });
  }, [materials, search, categoryFilter, supplierFilter]);

  async function handleImportFile(file: File) {
    setImporting(true);
    setImportMsg(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/v1/materials/import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Import failed");
        return;
      }
      setImportMsg(
        `Imported ${json.data.imported} prices (${json.data.skipped} skipped). Reload to refresh the full list, or search what you need.`,
      );
      // Refresh list from API
      const listRes = await fetch("/api/v1/materials?search=");
      const listJson = await listRes.json();
      if (listRes.ok && Array.isArray(listJson.data)) {
        setMaterials(
          listJson.data.map((r: MaterialCatalogRow) => ({
            ...r,
            last_purchased_at: r.last_purchased_at
              ? String(r.last_purchased_at).slice(0, 10)
              : null,
            updated_at: String(r.updated_at ?? ""),
            avg_paid_cents: r.avg_paid_cents ?? null,
            purchase_count: r.purchase_count ?? 0,
          })),
        );
      }
    } catch {
      setError("Network error during import");
    } finally {
      setImporting(false);
    }
  }

  function startEdit(m: MaterialCatalogRow) {
    setEditId(m.id);
    setEditNotes(m.notes ?? "");
    setEditLastCents((m.unit_cost_cents / 100).toFixed(2));
    setError(null);
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setError(null);
    const dollars = Number(editLastCents);
    if (!Number.isFinite(dollars) || dollars < 0) {
      setError("Enter a valid last price");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch(`/api/v1/materials/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_cost_cents: Math.round(dollars * 100),
          notes: editNotes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Save failed");
        return;
      }
      const updated = json.data as MaterialCatalogRow;
      setMaterials((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                unit_cost_cents: updated.unit_cost_cents,
                notes: updated.notes,
                // Manual edit: last paid only; keep avg/count from server if present
                avg_paid_cents: updated.avg_paid_cents ?? m.avg_paid_cents,
                purchase_count: updated.purchase_count ?? m.purchase_count,
              }
            : m,
        ),
      );
      setEditId(null);
    } catch {
      setError("Network error saving material");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Materials Catalog"
        subtitle="Last paid and average unit prices learned from materials receipts (SKU / barcode when available)."
        actions={
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <LinkButton href={"/app/expenses/new" as Route} variant="primary" size="sm">
              Scan receipt
            </LinkButton>
            <LinkButton href={"/app/expenses" as Route} variant="ghost" size="sm">
              Expenses
            </LinkButton>
            <LinkButton href={"/app/price-book" as Route} variant="ghost" size="sm">
              Service price book
            </LinkButton>
          </div>
        }
      />
      <HubSubnav hub="Money" links={MONEY_HUB_LINKS} pathname="/app/materials" />

      <Card padding="default" style={{ marginBottom: "var(--space-4)" }}>
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          Prices update automatically when you save itemized <strong>materials</strong> receipts.
          Match order: barcode/SKU first, then name. Import a Home Depot purchase history CSV to
          seed the catalog.
        </p>
        {canManage && (
          <div style={{ marginTop: "var(--space-3)", display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                cursor: importing ? "wait" : "pointer",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
              }}
            >
              {importing ? "Importing…" : "Import HD CSV"}
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={importing}
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            {importMsg && (
              <span style={{ fontSize: "var(--text-sm)", color: "var(--status-success, #16a34a)" }}>
                {importMsg}
              </span>
            )}
          </div>
        )}
        {error && (
          <p style={{ margin: "8px 0 0", color: "var(--status-danger, #dc2626)", fontSize: "var(--text-sm)" }}>
            {error}
          </p>
        )}
      </Card>

      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          flexWrap: "wrap",
          marginBottom: "var(--space-4)",
          alignItems: "flex-end",
        }}
      >
        <div style={{ flex: "1 1 200px", minWidth: 160 }}>
          <Input
            id="materials-catalog-search"
            label="Search name or SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. 1006765300 or access door"
          />
        </div>
        <label style={{ fontSize: "var(--text-sm)" }}>
          Category
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: "8px 10px", minWidth: 140 }}
          >
            <option value="all">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: "var(--text-sm)" }}>
          Supplier
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: "8px 10px", minWidth: 140 }}
          >
            <option value="all">All</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SectionHeader
        title={`${filtered.length} material${filtered.length === 1 ? "" : "s"}`}
      />

      {filtered.length === 0 ? (
        <Card padding="default">
          <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
            No catalog rows yet.{" "}
            <Link href={"/app/expenses/new" as Route} style={{ color: "var(--accent)" }}>
              Scan a materials receipt
            </Link>{" "}
            or import Home Depot purchase history above.
          </p>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          {filtered.map((m) => (
            <Card key={m.id} padding="default">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ flex: "1 1 220px" }}>
                  <div style={{ fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
                    {CATEGORY_LABELS[m.category] ?? m.category}
                    {m.sku ? ` · SKU ${m.sku}` : " · no SKU"}
                    {m.supplier ? ` · ${m.supplier}` : ""}
                    {m.last_purchased_at
                      ? ` · last ${String(m.last_purchased_at).slice(0, 10)}`
                      : ""}
                  </div>
                  {m.notes && (
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 4 }}>
                      {m.notes}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", fontSize: "var(--text-sm)" }}>
                  <div>
                    <span style={{ color: "var(--fg-muted)" }}>Last </span>
                    <strong>{formatCents(m.unit_cost_cents)}</strong>
                    <span style={{ color: "var(--fg-muted)" }}> / {m.unit}</span>
                  </div>
                  <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginTop: 2 }}>
                    Avg{" "}
                    {m.avg_paid_cents != null ? formatCents(m.avg_paid_cents) : "—"}
                    {m.purchase_count > 0 ? ` · ×${m.purchase_count}` : ""}
                  </div>
                  {canManage && editId !== m.id && (
                    <button
                      type="button"
                      onClick={() => startEdit(m)}
                      style={{
                        marginTop: 8,
                        fontSize: "var(--text-xs)",
                        background: "none",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: "4px 8px",
                        cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
              {editId === m.id && (
                <div
                  style={{
                    marginTop: "var(--space-3)",
                    paddingTop: "var(--space-3)",
                    borderTop: "1px solid var(--border-subtle)",
                    display: "grid",
                    gap: "var(--space-2)",
                    maxWidth: 360,
                  }}
                >
                  <label style={{ fontSize: "var(--text-sm)" }}>
                    Last paid ($)
                    <input
                      value={editLastCents}
                      onChange={(e) => setEditLastCents(e.target.value)}
                      style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
                    />
                  </label>
                  <label style={{ fontSize: "var(--text-sm)" }}>
                    Notes
                    <input
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveEdit(m.id)}
                      style={{
                        padding: "6px 12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        borderRadius: 6,
                        border: "none",
                        background: "var(--accent)",
                        color: "var(--on-accent, #fff)",
                      }}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditId(null)}
                      style={{
                        padding: "6px 12px",
                        cursor: "pointer",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "transparent",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
