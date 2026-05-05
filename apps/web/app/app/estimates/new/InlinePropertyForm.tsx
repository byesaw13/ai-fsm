"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";

interface InlinePropertyFormProps {
  clientId: string;
  onCreated: (property: { id: string; address: string; client_id: string }) => void;
  onCancel: () => void;
}

export function InlinePropertyForm({ clientId, onCreated, onCancel }: InlinePropertyFormProps) {
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!address.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          address: address.trim(),
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          zip: zip.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || "Failed to create property");
        setPending(false);
        return;
      }
      onCreated({ id: data.data.id, address: data.data.address, client_id: clientId });
    } catch {
      setError("An unexpected error occurred");
      setPending(false);
    }
  }

  return (
    <div
      style={{
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
        marginTop: "var(--space-2)",
        background: "var(--bg-subtle)",
      }}
    >
      <p style={{ margin: "0 0 var(--space-3)", fontWeight: 500, fontSize: "var(--text-sm)" }}>
        New Property
      </p>
      {error && (
        <p style={{ margin: "0 0 var(--space-3)", color: "var(--color-red-600)", fontSize: "var(--text-sm)" }}>
          {error}
        </p>
      )}
      <div>
        <div className="p7-form-grid p7-form-grid-2" style={{ marginBottom: "var(--space-3)" }}>
          <Input
            id="new-property-address"
            label="Address"
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={pending}
            autoFocus
            containerClassName="p7-form-grid-span-2"
          />
          <Input
            id="new-property-city"
            label="City (optional)"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={pending}
          />
          <Input
            id="new-property-state"
            label="State (optional)"
            value={state}
            onChange={(e) => setState(e.target.value)}
            disabled={pending}
          />
          <Input
            id="new-property-zip"
            label="ZIP (optional)"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            disabled={pending}
          />
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button type="button" size="sm" disabled={pending || !address.trim()} loading={pending} onClick={handleSubmit}>
            Create Property
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
