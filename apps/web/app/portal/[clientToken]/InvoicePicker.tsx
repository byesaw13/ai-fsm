"use client";

import { useState } from "react";
import Link from "next/link";

export interface PickerRow {
  id: string;
  label: string;
  sub: string;
  status: string;
  totalCents: number;
  dueCents: number;
  shareToken: string;
}
export interface PickerGroup {
  heading: string;
  rows: PickerRow[];
}

const MAX = 10; // matches the invoices-pdf route cap

function cents(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

/** Invoices grouped by address, tick any, print them as one PDF (TASK-161). */
export function InvoicePicker({ clientToken, groups }: { clientToken: string; groups: PickerGroup[] }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function toggle(ids: string[], on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  const tooMany = picked.size > MAX;
  const printHref = `/api/portal/${clientToken}/invoices-pdf?ids=${[...picked].join(",")}`;

  return (
    <div>
      <style>{`.portal-check{width:18px;height:18px;flex-shrink:0}`}</style>
      {groups.map((g) => {
        const ids = g.rows.map((r) => r.id);
        const allOn = ids.every((id) => picked.has(id));
        const paid = g.rows.reduce((s, r) => s + (r.totalCents - r.dueCents), 0);
        const due = g.rows.reduce((s, r) => s + r.dueCents, 0);
        return (
          <div key={g.heading} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
                {g.heading} <span style={{ fontWeight: 400, color: "#6b7280" }}>· {g.rows.length} invoice{g.rows.length === 1 ? "" : "s"}</span>
              </div>
              <button
                type="button"
                onClick={() => toggle(ids, !allOn)}
                style={{ background: "none", border: "none", color: "#2563eb", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}
              >
                {allOn ? "Clear" : "Select all"}
              </button>
            </div>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
              {g.rows.map((r, idx) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: idx < g.rows.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.label}`}
                    checked={picked.has(r.id)}
                    onChange={(e) => toggle([r.id], e.target.checked)}
                    className="portal-check"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{r.label}</div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>{r.sub}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontWeight: 600 }}>{cents(r.totalCents)}</div>
                    <div style={{ fontSize: 12, color: r.dueCents > 0 ? "#92400e" : "#065f46" }}>
                      {r.dueCents > 0 ? `${cents(r.dueCents)} due` : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </div>
                  </div>
                  <Link href={`/portal/invoices/${r.shareToken}`} style={{ fontSize: 13, color: "#2563eb", flexShrink: 0 }}>View →</Link>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              Paid here: {cents(paid)}{due > 0 ? ` · ${cents(due)} due` : ""}
            </div>
          </div>
        );
      })}
      {picked.size > 0 && (
        <div style={{ position: "sticky", bottom: 12, background: "#111", color: "#fff", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14 }}>{tooMany ? `Pick up to ${MAX} at a time` : `${picked.size} selected`}</span>
          {!tooMany && (
            <a href={printHref} target="_blank" rel="noopener" style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>
              Print / save PDF →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
