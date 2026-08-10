"use client";

import { useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import type { StoreRunLine } from "@/lib/jobs/buy-list";

const DEFAULT_SUPPLIERS = ["Home Depot", "Lowe's", "Supply House"];

export type SupplierPreference = {
  supplier: string;
  branch_label: string;
  address: string | null;
};

export function StoreRunLauncher({
  lines,
  preferences,
  canEdit,
  onStart,
  onCancel,
}: {
  lines: StoreRunLine[];
  preferences: SupplierPreference[];
  canEdit: boolean;
  onStart: (supplier: string) => void;
  onCancel: () => void;
}) {
  const suppliers = [...new Map(
    [
      ...lines.flatMap((line) => line.status === "needed" && line.supplier ? [line.supplier] : []),
      ...DEFAULT_SUPPLIERS,
    ].map((supplier) => [supplier.trim().toLowerCase(), supplier.trim()]),
  ).values()];
  const [supplier, setSupplier] = useState(suppliers[0]);
  const initialPreference = preferences.find(
    (preference) => preference.supplier.trim().toLowerCase() === supplier.toLowerCase(),
  );
  const [branchLabel, setBranchLabel] = useState(initialPreference?.branch_label ?? supplier);
  const [address, setAddress] = useState(initialPreference?.address ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectSupplier(next: string) {
    const preference = preferences.find(
      (candidate) => candidate.supplier.trim().toLowerCase() === next.toLowerCase(),
    );
    setSupplier(next);
    setBranchLabel(preference?.branch_label ?? next);
    setAddress(preference?.address ?? "");
  }

  async function begin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const preference = preferences.find(
        (candidate) => candidate.supplier.trim().toLowerCase() === supplier.toLowerCase(),
      );
      const nextBranchLabel = branchLabel.trim() || supplier;
      const nextAddress = address.trim() || null;
      if (
        canEdit &&
        (!preference ||
          preference.branch_label !== nextBranchLabel ||
          preference.address !== nextAddress)
      ) {
        const response = await fetch("/api/v1/materials/supplier-preferences", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            supplier,
            branch_label: nextBranchLabel,
            address: nextAddress,
          }),
        });
        if (!response.ok) throw new Error("Could not save store preference");
      }
      onStart(supplier);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start store run");
    } finally {
      setBusy(false);
    }
  }

  const savedPreference = preferences.find(
    (preference) => preference.supplier.trim().toLowerCase() === supplier.toLowerCase(),
  );

  return (
    <form onSubmit={(event) => void begin(event)} style={{ display: "grid", gap: "var(--space-4)" }}>
      <div>
        <h2 style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-xl)" }}>
          Start Store Run
        </h2>
        <p style={{ margin: 0, color: "var(--fg-secondary)", fontSize: "var(--text-sm)" }}>
          Pick the supplier, confirm the branch, then follow the aisle route.
        </p>
      </div>

      <Select
        id="store-run-supplier"
        data-testid="store-run-supplier"
        label="Supplier"
        value={supplier}
        onChange={(event) => selectSupplier(event.target.value)}
        options={suppliers.map((option) => ({ value: option, label: option }))}
      />

      {canEdit ? (
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          <Input
            id="store-run-branch"
            label="Branch"
            value={branchLabel}
            onChange={(event) => setBranchLabel(event.target.value)}
          />
          <Input
            id="store-run-address"
            label="Address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </div>
      ) : savedPreference ? (
        <p style={{ margin: 0, color: "var(--fg-secondary)" }}>
          <strong style={{ color: "var(--fg)" }}>{savedPreference.branch_label}</strong>
          {savedPreference.address ? ` · ${savedPreference.address}` : ""}
        </p>
      ) : null}

      {error && <p role="alert" style={{ margin: 0, color: "var(--color-danger)" }}>{error}</p>}

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <Button type="submit" size="lg" loading={busy} data-testid="store-run-begin">
          Begin run
        </Button>
        <Button type="button" size="lg" variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
