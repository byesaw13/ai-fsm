"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import { JOB_TYPE_MATERIALS, getMaterialsByCategory } from "@ai-fsm/domain";

interface PartRow {
  id: string;
  name: string;
  quantity: number;
  actual_cost_cents: number;
  customer_price_cents: number;
  receipt_media_id: string | null;
}

interface Props {
  visitId: string;
  initialParts: PartRow[];
  canUpdate: boolean;
  jobType?: string | null;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function VisitPartsPanel({ visitId, initialParts, canUpdate, jobType }: Props) {
  const router = useRouter();
  const toast = useToast();
  const receiptInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [parts, setParts] = useState<PartRow[]>(initialParts);
  const [addName, setAddName] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [addCost, setAddCost] = useState("");
  const [adding, setAdding] = useState(false);
  const [uploadingReceiptFor, setUploadingReceiptFor] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addedSuggestions, setAddedSuggestions] = useState<Set<string>>(new Set());

  const materialSuggestions = jobType ? getMaterialsByCategory(jobType) : {};
  const hasSuggestions = Object.keys(materialSuggestions).length > 0;

  const totalActual = parts.reduce((sum, p) => sum + Math.round(p.actual_cost_cents * p.quantity), 0);
  const totalCustomer = parts.reduce((sum, p) => sum + Math.round(p.customer_price_cents * p.quantity), 0);

  async function handleAddPart(e: React.FormEvent) {
    e.preventDefault();
    const costDollars = parseFloat(addCost);
    if (!addName.trim() || isNaN(costDollars)) {
      toast.error("Name and cost are required");
      return;
    }
    const actual_cost_cents = Math.round(costDollars * 100);
    const quantity = parseFloat(addQty) || 1;

    setAdding(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/parts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim(), quantity, actual_cost_cents }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error?.message ?? "Failed to add part");
      } else {
        setParts((prev) => [...prev, data.data]);
        setAddName("");
        setAddQty("1");
        setAddCost("");
        router.refresh();
        toast.success("Part added");
      }
    } catch {
      toast.error("Unexpected error");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeletePart(partId: string) {
    setDeletingId(partId);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/parts/${partId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setParts((prev) => prev.filter((p) => p.id !== partId));
        router.refresh();
        toast.success("Part removed");
      } else {
        const data = await res.json();
        toast.error(data.error?.message ?? "Delete failed");
      }
    } catch {
      toast.error("Unexpected error");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAddSuggestion(name: string, qty: number) {
    const normalizedName = name.toLowerCase();
    if (addedSuggestions.has(normalizedName)) {
      toast.error("Already added");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/parts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, quantity: qty, actual_cost_cents: 0 }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error?.message ?? "Failed to add part");
      } else {
        setParts((prev) => [...prev, data.data]);
        setAddedSuggestions((prev) => new Set([...prev, normalizedName]));
        router.refresh();
        toast.success(`${name} added`);
      }
    } catch {
      toast.error("Unexpected error");
    } finally {
      setAdding(false);
    }
  }

  async function handleReceiptUpload(partId: string, file: File) {
    setUploadingReceiptFor(partId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "receipt");

      const uploadRes = await fetch(`/api/v1/visits/${visitId}/media`, {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        toast.error(uploadData.error?.message ?? "Receipt upload failed");
        return;
      }

      const mediaId: string = uploadData.data.id;
      const patchRes = await fetch(`/api/v1/visits/${visitId}/parts/${partId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt_media_id: mediaId }),
      });
      const patchData = await patchRes.json();
      if (!patchRes.ok) {
        toast.error(patchData.error?.message ?? "Failed to link receipt");
      } else {
        setParts((prev) =>
          prev.map((p) => (p.id === partId ? { ...p, receipt_media_id: mediaId } : p))
        );
        router.refresh();
        toast.success("Receipt attached");
      }
    } catch {
      toast.error("Unexpected error");
    } finally {
      setUploadingReceiptFor(null);
    }
  }

  return (
    <div>
      {/* Suggested materials */}
      {canUpdate && hasSuggestions && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)", color: "var(--fg-secondary)" }}>
            Suggested materials
          </div>
          {Object.entries(materialSuggestions).map(([category, materials]) => (
            <div key={category} style={{ marginBottom: "var(--space-3)" }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-1)" }}>
                {category}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {materials.map((mat) => {
                  const normalizedName = mat.name.toLowerCase();
                  const alreadyAdded = addedSuggestions.has(normalizedName) || parts.some((p) => p.name.toLowerCase() === normalizedName);
                  return (
                    <button
                      key={mat.name}
                      type="button"
                      disabled={alreadyAdded || adding}
                      onClick={() => handleAddSuggestion(mat.name, mat.typicalQty)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "var(--space-1)",
                        padding: "var(--space-1) var(--space-2)",
                        fontSize: "var(--text-sm)",
                        background: alreadyAdded ? "var(--color-surface-raised)" : "var(--color-surface-overlay)",
                        border: `1px solid ${alreadyAdded ? "var(--color-border)" : "var(--color-primary-alpha)"}`,
                        borderRadius: "var(--radius-sm)",
                        cursor: alreadyAdded ? "default" : "pointer",
                        color: alreadyAdded ? "var(--fg-muted)" : "var(--fg-primary)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span>{mat.name}</span>
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                        {mat.typicalQty} {mat.unit}
                      </span>
                      {alreadyAdded ? (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-success)" }}>✓</span>
                      ) : (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-primary)" }}>+</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {parts.length > 0 && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          {parts.map((part) => (
            <div
              key={part.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "var(--space-2) var(--space-3)",
                borderBottom: "1px solid var(--color-border)",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 500, fontSize: "var(--text-sm)" }}>{part.name}</span>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginLeft: "var(--space-2)" }}>
                  qty {Number(part.quantity)}
                </span>
              </div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
                {formatDollars(part.actual_cost_cents)} cost
              </div>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, whiteSpace: "nowrap" }}>
                {formatDollars(part.customer_price_cents)}{" "}
                <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>(15% markup)</span>
              </div>
              {canUpdate && (
                <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                  {part.receipt_media_id ? (
                    <a
                      href={`/api/v1/visits/${visitId}/media/${part.receipt_media_id}/image`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "var(--text-xs)", color: "var(--color-primary)" }}
                    >
                      Receipt ↗
                    </a>
                  ) : (
                    <>
                      <input
                        ref={(el) => { receiptInputRefs.current[part.id] = el; }}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleReceiptUpload(part.id, file);
                          if (e.target) e.target.value = "";
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => receiptInputRefs.current[part.id]?.click()}
                        disabled={uploadingReceiptFor === part.id}
                        style={{
                          fontSize: "var(--text-xs)",
                          color: "var(--color-primary)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {uploadingReceiptFor === part.id ? "Uploading…" : "+ Receipt"}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeletePart(part.id)}
                    disabled={deletingId === part.id}
                    style={{
                      fontSize: "var(--text-xs)",
                      color: "var(--color-danger)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {deletingId === part.id ? "…" : "Remove"}
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Totals row */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "var(--space-4)",
              padding: "var(--space-2) var(--space-3)",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
            }}
          >
            <span>Parts cost: {formatDollars(totalActual)}</span>
            <span>Customer total: {formatDollars(totalCustomer)}</span>
          </div>
        </div>
      )}

      {parts.length === 0 && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginBottom: "var(--space-3)" }}>
          No parts added yet.
        </p>
      )}

      {canUpdate && (
        <form onSubmit={handleAddPart} style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "2 1 180px" }}>
            <label style={{ fontSize: "var(--text-xs)", fontWeight: 500, display: "block", marginBottom: 4 }}>
              Part name
            </label>
            <input
              className="p7-input"
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="e.g. PVC elbow"
              disabled={adding}
              required
            />
          </div>
          <div style={{ flex: "0 1 70px" }}>
            <label style={{ fontSize: "var(--text-xs)", fontWeight: 500, display: "block", marginBottom: 4 }}>
              Qty
            </label>
            <input
              className="p7-input"
              type="number"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              min="0.01"
              step="0.01"
              disabled={adding}
            />
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <label style={{ fontSize: "var(--text-xs)", fontWeight: 500, display: "block", marginBottom: 4 }}>
              Actual cost ($)
            </label>
            <input
              className="p7-input"
              type="number"
              value={addCost}
              onChange={(e) => setAddCost(e.target.value)}
              min="0"
              step="0.01"
              placeholder="0.00"
              disabled={adding}
              required
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="p7-btn p7-btn-primary p7-btn-sm"
            style={{ alignSelf: "flex-end", flexShrink: 0 }}
          >
            {adding ? "Adding…" : "Add Part"}
          </button>
        </form>
      )}
    </div>
  );
}
