"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";

interface InlineJobFormProps {
  clientId: string;
  onCreated: (job: { id: string; title: string; client_id: string }) => void;
  onCancel: () => void;
}

export function InlineJobForm({ clientId, onCreated, onCancel }: InlineJobFormProps) {
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!title.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), client_id: clientId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || "Failed to create job");
        setPending(false);
        return;
      }
      onCreated({ id: data.data.id, title: data.data.title, client_id: clientId });
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
        New Project
      </p>
      {error && (
        <p style={{ margin: "0 0 var(--space-3)", color: "var(--color-red-600)", fontSize: "var(--text-sm)" }}>
          {error}
        </p>
      )}
      <div>
        <div style={{ marginBottom: "var(--space-3)" }}>
          <Input
            id="new-job-title"
            label="Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={pending}
            autoFocus
          />
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button type="button" size="sm" disabled={pending || !title.trim()} loading={pending} onClick={handleSubmit}>
            Create Project
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
