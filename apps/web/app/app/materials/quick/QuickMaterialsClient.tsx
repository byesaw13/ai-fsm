"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

interface MaterialItem {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  unit_cost_cents: number;
  total_cost_cents: number;
  notes?: string;
}

interface MaterialsResult {
  items: MaterialItem[];
  summary_notes: string;
  total_cost_cents: number;
  order_text: string;
  assumptions?: string[];
}

export function QuickMaterialsClient() {
  const [scope, setScope] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MaterialsResult | null>(null);
  const [copied, setCopied] = useState(false);
  const { success, error } = useToast();

  async function handleGenerate() {
    if (!scope.trim()) {
      error("Please describe the job scope.");
      return;
    }
    setLoading(true);
    setCopied(false);
    try {
      const res = await fetch("/api/v1/materials/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const json = (await res.json()) as MaterialsResult & { error?: { message?: string } };
      if (!res.ok) {
        error(json.error?.message ?? "Failed to generate materials list");
        return;
      }
      setResult(json);
      success("Materials list generated!");
    } catch {
      error("Network error — could not generate materials list");
    } finally {
      setLoading(false);
    }
  }

  function handleCopyOrderText() {
    if (!result?.order_text) return;
    void navigator.clipboard.writeText(result.order_text);
    setCopied(true);
    success("Supply house order copied to clipboard!");
    setTimeout(() => setCopied(false), 3000);
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      {/* Input Card */}
      <div className="card detail-card">
        <h2 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-lg)" }}>
          ⚡ Quick Materials Generator (No Estimate Needed)
        </h2>
        <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-secondary)" }}>
          Describe any job or trade scope to instantly generate a purchase-ready buy list with quantities, waste factors, and estimated costs.
        </p>

        <textarea
          rows={4}
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          placeholder="e.g. Hang 20ft foyer chandelier, replace exterior single-stall garage door trim with PVC boards, seal with OSI caulk"
          style={{
            width: "100%",
            padding: "var(--space-3)",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--fg)",
            fontFamily: "inherit",
            fontSize: "var(--text-sm)",
            resize: "vertical",
          }}
        />

        <div style={{ marginTop: "var(--space-3)", display: "flex", gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !scope.trim()}
            style={{
              padding: "8px 18px",
              borderRadius: "var(--radius)",
              background: "var(--accent)",
              color: "#fff",
              fontWeight: 600,
              border: "none",
              cursor: loading || !scope.trim() ? "not-allowed" : "pointer",
              opacity: loading || !scope.trim() ? 0.6 : 1,
            }}
          >
            {loading ? "Generating Buy List…" : "⚡ Generate Buy List"}
          </button>
        </div>
      </div>

      {/* Results Card */}
      {result && (
        <div className="card detail-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)", flexWrap: "wrap", gap: 8 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "var(--text-base)" }}>
                🛒 Purchase-Ready Materials List ({result.items.length} items)
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                Estimated Total: <strong>${(result.total_cost_cents / 100).toFixed(2)}</strong>
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyOrderText}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "1px solid var(--accent)",
                background: copied ? "var(--status-success)" : "color-mix(in srgb, var(--accent) 10%, transparent)",
                color: copied ? "#fff" : "var(--accent)",
                fontWeight: 600,
                fontSize: "var(--text-xs)",
                cursor: "pointer",
              }}
            >
              {copied ? "✓ Copied!" : "📋 Copy Supply House Text"}
            </button>
          </div>

          {result.summary_notes && (
            <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-secondary)", background: "var(--bg-subtle)", padding: "var(--space-2)", borderRadius: 6, margin: "0 0 var(--space-3)" }}>
              💡 {result.summary_notes}
            </p>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                  <th style={{ padding: "6px 8px 6px 0" }}>Item</th>
                  <th style={{ padding: "6px 8px" }}>Category</th>
                  <th style={{ padding: "6px 8px" }}>Qty</th>
                  <th style={{ padding: "6px 8px" }}>Unit Price</th>
                  <th style={{ padding: "6px 0 6px 8px", textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "8px 8px 8px 0", fontWeight: 500 }}>
                      {item.name}
                      {item.notes && <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{item.notes}</span>}
                    </td>
                    <td style={{ padding: "8px 8px", fontSize: "var(--text-xs)", textTransform: "capitalize" }}>{item.category}</td>
                    <td style={{ padding: "8px 8px", fontWeight: 600 }}>{item.quantity} {item.unit}</td>
                    <td style={{ padding: "8px 8px", color: "var(--fg-muted)" }}>${(item.unit_cost_cents / 100).toFixed(2)}</td>
                    <td style={{ padding: "8px 0 8px 8px", textAlign: "right", fontWeight: 600 }}>${(item.total_cost_cents / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
