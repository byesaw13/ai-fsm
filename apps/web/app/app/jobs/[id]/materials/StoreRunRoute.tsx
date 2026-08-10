"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { buildStoreRunStops, filterStoreRunLines } from "@/lib/jobs/buy-list";
import type { BuyListLine } from "./BuyListClient";
import { StoreRunDepartment } from "./StoreRunDepartment";

export function StoreRunRoute({
  jobId,
  linesAtStart,
  supplier,
  canEdit,
  onLineUpdated,
  onRefresh,
  onComplete,
  onCancel,
}: {
  jobId: string;
  linesAtStart: BuyListLine[];
  supplier: string;
  canEdit: boolean;
  onLineUpdated: (line: BuyListLine) => void;
  onRefresh: () => Promise<BuyListLine[]>;
  onComplete: (purchasedIds: ReadonlySet<string>, finalLines: BuyListLine[]) => void;
  onCancel: () => void;
}) {
  const [stops] = useState(() => buildStoreRunStops(filterStoreRunLines(linesAtStart, supplier)));
  const [currentStop, setCurrentStop] = useState(0);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(() => new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);

  const stop = stops[currentStop];
  const stopComplete = stop?.lines.every((line) => purchasedIds.has(line.id)) ?? false;
  const nextStop = stops[currentStop + 1];

  function purchased(id: string) {
    setPurchasedIds((current) => new Set(current).add(id));
  }

  function undone(id: string) {
    setPurchasedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  async function advance() {
    setRefreshing(true);
    setRefreshError(false);
    try {
      await onRefresh();
      setCurrentStop((current) => current + 1);
    } catch {
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  }

  async function finish() {
    setRefreshing(true);
    setRefreshError(false);
    try {
      const freshLines = await onRefresh();
      onComplete(purchasedIds, freshLines);
    } catch {
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  }

  if (!stop) {
    return (
      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        <p style={{ margin: 0 }}>No needed items match {supplier}.</p>
        <Button type="button" variant="secondary" onClick={onCancel}>Choose another supplier</Button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-6)" }}>
      <section aria-labelledby="store-run-overview">
        <p style={{ margin: "0 0 var(--space-1)", color: "var(--fg-secondary)", fontSize: "var(--text-sm)" }}>
          {supplier} · Stop {currentStop + 1} of {stops.length}
        </p>
        <h2 id="store-run-overview" style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-xl)" }}>
          Store route
        </h2>
        <ol style={{ margin: 0, paddingLeft: "var(--space-5)", color: "var(--fg-secondary)" }}>
          {stops.map((routeStop, index) => (
            <li key={routeStop.key} style={{ marginBottom: "var(--space-1)", color: index === currentStop ? "var(--fg)" : undefined, fontWeight: index === currentStop ? 700 : undefined }}>
              {routeStop.department}
              {routeStop.aisleLabel ? ` · Aisle ${routeStop.aisleLabel.replace(/^aisle\s*/i, "")}` : ""}
              {` · ${routeStop.lines.length} item${routeStop.lines.length === 1 ? "" : "s"}`}
            </li>
          ))}
        </ol>
      </section>

      <StoreRunDepartment
        key={stop.key}
        jobId={jobId}
        stop={stop}
        purchasedIds={purchasedIds}
        canEdit={canEdit}
        onLineUpdated={onLineUpdated}
        onPurchased={purchased}
        onUndo={undone}
      />

      {stopComplete && nextStop && (
        <Button
          type="button"
          size="lg"
          loading={refreshing}
          data-testid="store-run-next"
          onClick={() => void advance()}
        >
          {refreshError
            ? "Retry"
            : `Next: ${nextStop.department}${nextStop.aisleLabel ? ` · Aisle ${nextStop.aisleLabel.replace(/^aisle\s*/i, "")}` : ""}`}
        </Button>
      )}

      {stopComplete && !nextStop && (
        <Button
          type="button"
          size="lg"
          loading={refreshing}
          data-testid="store-run-finish"
          onClick={() => void finish()}
        >
          {refreshError ? "Retry" : "Finish run"}
        </Button>
      )}

      {refreshError && (
        <p role="alert" style={{ margin: 0, color: "var(--color-danger)" }}>
          Could not refresh the list. You are still at this stop; retry when ready.
        </p>
      )}
    </div>
  );
}
