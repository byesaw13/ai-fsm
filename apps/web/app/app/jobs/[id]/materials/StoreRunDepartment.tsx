"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import type { StoreRunStop } from "@/lib/jobs/buy-list";
import type { BuyListLine } from "./BuyListClient";

export function StoreRunDepartment({
  jobId,
  stop,
  purchasedIds,
  canEdit,
  onLineUpdated,
  onPurchased,
  onUndo,
}: {
  jobId: string;
  stop: StoreRunStop;
  purchasedIds: ReadonlySet<string>;
  canEdit: boolean;
  onLineUpdated: (line: BuyListLine) => void;
  onPurchased: (id: string) => void;
  onUndo: (id: string) => void;
}) {
  const [lines, setLines] = useState(stop.lines as BuyListLine[]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [supplier, setSupplier] = useState("");
  const [aisle, setAisle] = useState("");
  const [bay, setBay] = useState("");
  const [remember, setRemember] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function patchLine(id: string, patch: Record<string, unknown>) {
    const response = await fetch(`/api/v1/jobs/${jobId}/materials/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error("Could not update item");
    return (await response.json()).data as BuyListLine;
  }

  function mergeLine(original: BuyListLine, updated: BuyListLine) {
    const merged = { ...original, ...updated };
    setLines((current) => current.map((line) => line.id === merged.id ? merged : line));
    onLineUpdated(merged);
  }

  async function purchase(line: BuyListLine) {
    setPendingId(line.id);
    setFailedId(null);
    setMessage(null);
    try {
      const updated = await patchLine(line.id, { status: "purchased" });
      mergeLine(line, updated);
      onPurchased(line.id);
    } catch {
      setFailedId(line.id);
    } finally {
      setPendingId(null);
    }
  }

  async function undo(line: BuyListLine) {
    setPendingId(line.id);
    setMessage(null);
    try {
      const updated = await patchLine(line.id, { status: "needed" });
      mergeLine(line, updated);
      onUndo(line.id);
    } catch {
      setMessage(`Could not undo ${line.name}. Try again.`);
    } finally {
      setPendingId(null);
    }
  }

  function edit(line: BuyListLine) {
    setEditingId(line.id);
    setSupplier(line.supplier ?? "");
    setAisle(line.aisle ?? "");
    setBay(line.bay ?? "");
    setRemember(false);
    setMessage(null);
  }

  async function saveLocation(event: React.FormEvent, line: BuyListLine) {
    event.preventDefault();
    setPendingId(line.id);
    setMessage(null);
    try {
      const updated = await patchLine(line.id, {
        supplier: supplier.trim() || null,
        aisle: aisle.trim() || null,
        bay: bay.trim() || null,
        remember_for_future: Boolean(line.catalog_material_id && remember),
      });
      mergeLine(line, updated);
      setEditingId(null);
    } catch {
      setMessage(`Could not update ${line.name}. Try again.`);
    } finally {
      setPendingId(null);
    }
  }

  const waiting = lines.filter((line) => !purchasedIds.has(line.id));
  const purchased = lines.filter((line) => purchasedIds.has(line.id));

  return (
    <section aria-labelledby={`store-run-stop-${stop.key}`} style={{ display: "grid", gap: "var(--space-3)" }}>
      <div>
        <p style={{ margin: 0, color: "var(--fg-secondary)", fontSize: "var(--text-sm)" }}>
          {stop.aisleLabel ? `Aisle ${stop.aisleLabel.replace(/^aisle\s*/i, "")}` : "Department stop"}
        </p>
        <h2 id={`store-run-stop-${stop.key}`} style={{ margin: 0, fontSize: "var(--text-xl)" }}>
          {stop.department}
        </h2>
      </div>

      {waiting.map((line) => (
        <div key={line.id} style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
          <button
            type="button"
            className="p7-btn p7-btn-secondary p7-btn-lg"
            data-testid={`store-run-item-${line.id}`}
            disabled={pendingId === line.id}
            onClick={() => void purchase(line)}
            style={{ width: "100%", justifyContent: "space-between", whiteSpace: "normal", textAlign: "left" }}
          >
            <span>{line.name}</span>
            <span style={{ color: "var(--fg-secondary)", fontWeight: 400 }}>
              {Number(line.quantity)}{line.unit_label ? ` ${line.unit_label}` : ""}
              {line.bay ? ` · Bay ${line.bay}` : ""}
            </span>
          </button>

          {failedId === line.id && (
            <div role="alert" style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginTop: "var(--space-2)" }}>
              <span style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>
                Could not update item.
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={() => void purchase(line)}>
                Retry
              </Button>
            </div>
          )}

          {canEdit && editingId !== line.id && (
            <Button type="button" variant="ghost" size="sm" onClick={() => edit(line)}>
              Edit location
            </Button>
          )}

          {canEdit && editingId === line.id && (
            <form onSubmit={(event) => void saveLocation(event, line)} style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
              <Input id={`store-run-supplier-${line.id}`} label="Supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
                <Input id={`store-run-aisle-${line.id}`} label="Aisle" value={aisle} onChange={(event) => setAisle(event.target.value)} />
                <Input id={`store-run-bay-${line.id}`} label="Bay" value={bay} onChange={(event) => setBay(event.target.value)} />
              </div>
              {line.catalog_material_id && (
                <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", minHeight: 44 }}>
                  <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                  Remember for future jobs
                </label>
              )}
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <Button type="submit" disabled={pendingId === line.id}>Save location</Button>
                <Button type="button" variant="secondary" disabled={pendingId === line.id} onClick={() => setEditingId(null)}>Cancel</Button>
              </div>
            </form>
          )}
        </div>
      ))}

      {purchased.map((line) => (
        <div key={line.id} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
          <span><strong>Purchased:</strong> {line.name}</span>
          <Button type="button" variant="secondary" size="sm" disabled={pendingId === line.id} onClick={() => void undo(line)}>
            Undo
          </Button>
        </div>
      ))}

      {message && <p role="alert" style={{ margin: 0, color: "var(--color-danger)" }}>{message}</p>}
    </section>
  );
}
