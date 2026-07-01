"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, LinkButton, ClientTypeahead } from "@/components/ui";

interface Client {
  id: string;
  name: string;
}

interface Property {
  id: string;
  address: string;
  client_id: string;
}

interface QuickJobFormProps {
  clients: Client[];
  properties: Property[];
  initialClientId?: string;
  initialPropertyId?: string;
}

export function QuickJobForm({
  clients,
  properties,
  initialClientId,
  initialPropertyId,
}: QuickJobFormProps) {
  function onSwitchToFull() {
    document.getElementById("full-setup")?.scrollIntoView({ behavior: "smooth" });
  }
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(
    initialClientId && clients.some((c) => c.id === initialClientId)
      ? initialClientId
      : ""
  );
  const [propertyId, setPropertyId] = useState(
    initialPropertyId && properties.some((p) => p.id === initialPropertyId)
      ? initialPropertyId
      : ""
  );

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const filteredProperties = properties.filter((p) => p.client_id === clientId);

  useEffect(() => {
    if (propertyId && !filteredProperties.some((p) => p.id === propertyId)) {
      setPropertyId("");
    }
  }, [clientId, propertyId, filteredProperties]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Enter a title for the job");
      return;
    }
    if (!clientId) {
      setError("Select a client");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const body = {
        title: title.trim(),
        client_id: clientId,
        property_id: propertyId || undefined,
      };

      const res = await fetch("/api/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || "Failed to create job");
        setPending(false);
        return;
      }

      router.push(`/app/jobs/${data.data.id}`);
    } catch {
      setError("An unexpected error occurred");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div
          style={{
            padding: "var(--space-2) var(--space-3)",
            marginBottom: "var(--space-3)",
            background: "var(--color-danger-alpha)",
            border: "1px solid var(--color-danger)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-sm)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginBottom: "var(--space-4)" }}>
        <label
          style={{ fontSize: "var(--text-xs)", fontWeight: 500, display: "block", marginBottom: "4px" }}
        >
          What needs done?
        </label>
        <input
          ref={titleRef}
          type="text"
          className="p7-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Kitchen faucet repair"
          disabled={pending}
          required
          style={{ fontSize: "var(--text-base)", padding: "var(--space-2)" }}
        />
      </div>

      <div style={{ marginBottom: "var(--space-4)" }}>
        <label
          style={{ fontSize: "var(--text-xs)", fontWeight: 500, display: "block", marginBottom: "4px" }}
        >
          Client
        </label>
        <ClientTypeahead
          clients={clients}
          value={clientId}
          onChange={(id) => { setClientId(id); setPropertyId(""); }}
          disabled={pending}
          placeholder="Search client..."
        />
        {clients.length === 0 && (
          <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: "4px" }}>
            No clients yet. Create one first.
          </p>
        )}
      </div>

      {clientId && filteredProperties.length > 0 && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <label
            style={{ fontSize: "var(--text-xs)", fontWeight: 500, display: "block", marginBottom: "4px" }}
          >
            Property (optional)
          </label>
          <select
            className="p7-select"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            disabled={pending}
          >
            <option value="">Select a property...</option>
            {filteredProperties.map((p) => (
              <option key={p.id} value={p.id}>{p.address}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
        <Button type="submit" disabled={pending || !title.trim() || !clientId} loading={pending}>
          {pending ? "Creating..." : "Create Project"}
        </Button>
        <button
          type="button"
          onClick={onSwitchToFull}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-primary)",
            fontSize: "var(--text-sm)",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Full setup →
        </button>
      </div>
    </form>
  );
}
