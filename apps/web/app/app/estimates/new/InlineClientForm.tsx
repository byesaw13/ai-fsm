"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";

interface InlineClientFormProps {
  onCreated: (client: { id: string; name: string }) => void;
  onCancel: () => void;
}

export function InlineClientForm({ onCreated, onCancel }: InlineClientFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || "Failed to create client");
        setPending(false);
        return;
      }
      onCreated({ id: data.data.id, name: data.data.name });
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
        New Client
      </p>
      {error && (
        <p style={{ margin: "0 0 var(--space-3)", color: "var(--color-red-600)", fontSize: "var(--text-sm)" }}>
          {error}
        </p>
      )}
      <div>
        <div className="p7-form-grid p7-form-grid-2" style={{ marginBottom: "var(--space-3)" }}>
          <Input
            id="new-client-name"
            label="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            autoFocus
          />
          <Input
            id="new-client-email"
            label="Email (optional)"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
          />
          <Input
            id="new-client-phone"
            label="Phone (optional)"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={pending}
          />
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button type="button" size="sm" disabled={pending || !name.trim()} loading={pending} onClick={handleSubmit}>
            Create Client
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
