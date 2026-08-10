"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  filterStoreRunLines,
  groupByStoreSection,
  type BuyListStatus,
  type StoreRunLine,
} from "@/lib/jobs/buy-list";
import {
  StoreRunLauncher,
  type SupplierPreference,
} from "./StoreRunLauncher";
import { StoreRunRoute } from "./StoreRunRoute";
import { StoreRunSummary } from "./StoreRunSummary";

export type BuyListLine = StoreRunLine & {
  source: string;
  notes: string | null;
};

type StoreRunMode = "list" | "launch" | "route" | "summary";

const STATUS_LABELS: Record<BuyListStatus, string> = {
  needed: "Needed",
  purchased: "Purchased",
  on_truck: "On truck",
  not_needed: "Not needed",
};

export function BuyListClient({
  jobId,
  initialLines,
  seededAt,
  canEdit,
  canSeed,
  supplierPreferences = [],
}: {
  jobId: string;
  initialLines: BuyListLine[];
  seededAt: string | null;
  canEdit: boolean;
  canSeed: boolean;
  supplierPreferences?: SupplierPreference[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("");
  const [section, setSection] = useState("");
  const [filter, setFilter] = useState<"needed" | "all">("needed");

  const [storeRunMode, setStoreRunMode] = useState<StoreRunMode>("list");
  const [storeRunSupplier, setStoreRunSupplier] = useState<string | null>(null);
  const [runStartLines, setRunStartLines] = useState<BuyListLine[]>([]);
  const [summaryPurchasedIds, setSummaryPurchasedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [summaryFinalLines, setSummaryFinalLines] = useState<BuyListLine[]>([]);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const refreshLines = useCallback(async (): Promise<BuyListLine[]> => {
    const response = await fetch(`/api/v1/jobs/${jobId}/materials`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not refresh buy list");
    const payload = await response.json();
    const fresh = (payload?.data?.lines ?? []) as BuyListLine[];
    setLines(fresh);
    return fresh;
  }, [jobId]);

  function updateLine(updated: BuyListLine) {
    setLines((prev) =>
      prev.map((line) => (line.id === updated.id ? { ...line, ...updated } : line)),
    );
  }

  function exitStoreRun() {
    setStoreRunMode("list");
    setStoreRunSupplier(null);
    setRunStartLines([]);
    setSummaryPurchasedIds(new Set());
    setSummaryFinalLines([]);
  }

  async function seed(reseed: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/materials`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: reseed ? "reseed" : "seed" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok && json?.error?.code !== "NO_ESTIMATE" && json?.error?.code !== "NO_LINES") {
        setMessage(json?.error?.message ?? "Seed failed");
        return;
      }
      const data = json?.data;
      if (data?.mode === "already_seeded") {
        setMessage("Already seeded. Use “Re-seed missing” to add new items from the estimate.");
      } else if (data?.mode === "seeded") {
        setMessage(`Seeded ${data.inserted ?? 0} item(s) from estimate.`);
      } else if (data?.mode === "reseed_added") {
        setMessage(`Added ${data.inserted ?? 0} missing item(s).`);
      } else if (json?.error?.message) {
        setMessage(json.error.message);
      }
      refresh();
      try {
        await refreshLines();
      } catch {
        /* list will catch up on next navigation */
      }
    } finally {
      setBusy(false);
    }
  }

  async function addLine(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/materials`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          quantity: parseFloat(qty) || 1,
          unit_label: unit.trim() || null,
          store_section: section.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json?.error?.message ?? "Could not add line");
        return;
      }
      setName("");
      setQty("1");
      setUnit("");
      setSection("");
      if (json.data) {
        const created = json.data as Partial<BuyListLine> & Pick<BuyListLine, "id" | "name" | "status">;
        setLines((prev) => [
          ...prev,
          {
            quantity: 1,
            unit_label: null,
            store_section: null,
            source: "manual",
            notes: null,
            supplier: null,
            aisle: null,
            bay: null,
            catalog_material_id: null,
            unit_cost_cents: null,
            ...created,
          },
        ]);
      }
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(lineId: string, status: BuyListStatus) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/materials/${lineId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...json.data } : l)));
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeLine(lineId: string) {
    if (!canEdit) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/materials/${lineId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (res.ok) setLines((prev) => prev.filter((l) => l.id !== lineId));
    } finally {
      setBusy(false);
    }
  }

  const hasNeeded = lines.some((line) => line.status === "needed");

  if (storeRunMode === "launch") {
    return (
      <div data-testid="job-buy-list">
        <StoreRunLauncher
          lines={lines}
          preferences={supplierPreferences}
          canEdit={canEdit}
          onStart={(supplier) => {
            setStoreRunSupplier(supplier);
            setRunStartLines(filterStoreRunLines(lines, supplier));
            setStoreRunMode("route");
          }}
          onCancel={exitStoreRun}
        />
      </div>
    );
  }

  if (storeRunMode === "route" && storeRunSupplier) {
    return (
      <div data-testid="job-buy-list">
        <StoreRunRoute
          jobId={jobId}
          linesAtStart={runStartLines.length > 0 ? runStartLines : lines}
          supplier={storeRunSupplier}
          canEdit={canEdit}
          onLineUpdated={updateLine}
          onRefresh={refreshLines}
          onComplete={(purchasedIds, finalLines) => {
            setSummaryPurchasedIds(purchasedIds);
            setSummaryFinalLines(finalLines);
            setStoreRunMode("summary");
          }}
          onCancel={exitStoreRun}
        />
      </div>
    );
  }

  if (storeRunMode === "summary") {
    return (
      <div data-testid="job-buy-list">
        <StoreRunSummary
          jobId={jobId}
          runStartLines={runStartLines.length > 0 ? runStartLines : lines}
          finalLines={summaryFinalLines.length > 0 ? summaryFinalLines : lines}
          purchasedIds={summaryPurchasedIds}
        />
        <div style={{ marginTop: "var(--space-4)" }}>
          <button
            type="button"
            className="p7-btn p7-btn-secondary p7-btn-sm"
            onClick={exitStoreRun}
          >
            Back to buy list
          </button>
        </div>
      </div>
    );
  }


  const visible =
    filter === "all" ? lines : lines.filter((l) => l.status === "needed");
  const groups = groupByStoreSection(
    visible.map((l) => ({ ...l, store_section: l.store_section })),
  );

  return (
    <div data-testid="job-buy-list">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-2)",
          marginBottom: "var(--space-4)",
          alignItems: "center",
        }}
      >
        {canSeed && (
          <>
            <button
              type="button"
              className="p7-btn p7-btn-primary p7-btn-sm"
              disabled={busy}
              onClick={() => void seed(false)}
              data-testid="buy-list-seed"
            >
              Seed from estimate
            </button>
            {seededAt && (
              <button
                type="button"
                className="p7-btn p7-btn-secondary p7-btn-sm"
                disabled={busy}
                onClick={() => void seed(true)}
                data-testid="buy-list-reseed"
              >
                Re-seed missing
              </button>
            )}
          </>
        )}
        {hasNeeded && (
          <button
            type="button"
            className="p7-btn p7-btn-primary p7-btn-sm"
            disabled={busy}
            onClick={() => setStoreRunMode("launch")}
            data-testid="start-store-run"
          >
            Start Store Run
          </button>
        )}
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button
            type="button"
            className="p7-btn p7-btn-sm"
            style={{
              background: filter === "needed" ? "var(--accent)" : "var(--bg-subtle)",
              color: filter === "needed" ? "#fff" : "var(--fg)",
              border: "none",
              borderRadius: 999,
              padding: "4px 12px",
              cursor: "pointer",
            }}
            onClick={() => setFilter("needed")}
          >
            Still needed
          </button>
          <button
            type="button"
            className="p7-btn p7-btn-sm"
            style={{
              background: filter === "all" ? "var(--accent)" : "var(--bg-subtle)",
              color: filter === "all" ? "#fff" : "var(--fg)",
              border: "none",
              borderRadius: 999,
              padding: "4px 12px",
              cursor: "pointer",
            }}
            onClick={() => setFilter("all")}
          >
            All
          </button>
        </div>
      </div>

      {message && (
        <p
          style={{
            margin: "0 0 var(--space-3)",
            fontSize: "var(--text-sm)",
            color: "var(--fg-muted)",
          }}
          data-testid="buy-list-message"
        >
          {message}
        </p>
      )}

      {lines.length === 0 ? (
        <p
          style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}
          data-testid="buy-list-empty"
        >
          No buy list yet. Seed from a linked estimate or add items manually before the store run.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
          {groups.map((g) => (
            <div key={g.section}>
              <h3
                style={{
                  margin: "0 0 var(--space-2)",
                  fontSize: "var(--text-sm)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--fg-muted)",
                }}
              >
                {g.section}
              </h3>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                {g.lines.map((line) => (
                  <li
                    key={line.id}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "center",
                      padding: "10px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      opacity: line.status === "not_needed" ? 0.55 : 1,
                    }}
                  >
                    <span style={{ fontWeight: 600, flex: "1 1 140px" }}>
                      {line.name}
                      <span style={{ fontWeight: 400, color: "var(--fg-muted)", marginLeft: 8 }}>
                        {Number(line.quantity)}
                        {line.unit_label ? ` ${line.unit_label}` : ""}
                      </span>
                      {(line.supplier || line.aisle) && (
                        <span style={{ fontWeight: 400, color: "var(--fg-muted)", marginLeft: 8, fontSize: 12 }}>
                          {[line.supplier, line.aisle ? `Aisle ${line.aisle}` : null, line.bay ? `Bay ${line.bay}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </span>
                    <select
                      value={line.status}
                      disabled={busy}
                      onChange={(e) => void setStatus(line.id, e.target.value as BuyListStatus)}
                      aria-label={`Status for ${line.name}`}
                      style={{
                        fontSize: "var(--text-sm)",
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                      }}
                    >
                      {(Object.keys(STATUS_LABELS) as BuyListStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void removeLine(line.id)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "var(--fg-muted)",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <form
          onSubmit={(e) => void addLine(e)}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: "var(--space-2)",
            alignItems: "end",
            padding: "var(--space-3)",
            border: "1px dashed var(--border)",
            borderRadius: 8,
          }}
          data-testid="buy-list-add-form"
        >
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Item
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Wax ring"
              style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Qty
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
              style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Unit
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="ea"
              style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Store section
            <input
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="Plumbing"
              style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)" }}
            />
          </label>
          <button type="submit" className="p7-btn p7-btn-primary p7-btn-sm" disabled={busy}>
            Add item
          </button>
        </form>
      )}
    </div>
  );
}
