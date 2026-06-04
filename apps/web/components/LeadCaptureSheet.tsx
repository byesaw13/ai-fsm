"use client";

import { useState } from "react";
import { Modal, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

interface LeadCaptureSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

export function LeadCaptureSheet({ open, onClose, onCreated }: LeadCaptureSheetProps) {
  const { success, error: toastError } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  function reset() {
    setName("");
    setPhone("");
    setDescription("");
    setCreatedId(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/booking-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || undefined,
          service_description: description.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toastError(data?.error?.message ?? "Failed to save request");
        return;
      }
      const data = await res.json();
      setCreatedId(data.id);
      success(`Request captured for ${name.trim()}`);
      onCreated?.(data.id);
    } catch {
      toastError("Network error — request not saved");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="New Request"
      data-testid="lead-capture-sheet"
      footer={
        createdId ? (
          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
            <a
              href="/app/requests"
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--accent)",
                textDecoration: "none",
              }}
            >
              View requests →
            </a>
            <Button variant="primary" onClick={() => { reset(); }}>
              Add another
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="lead-capture-form"
              disabled={submitting || !name.trim()}
            >
              {submitting ? "Saving…" : "Save Request"}
            </Button>
          </div>
        )
      }
    >
      {createdId ? (
        <div style={{ textAlign: "center", padding: "var(--space-4) 0" }}>
          <div style={{ fontSize: 32, marginBottom: "var(--space-2)" }}>✓</div>
          <p style={{ fontWeight: "var(--font-semibold)", marginBottom: "var(--space-1)" }}>
            Request saved for {name}
          </p>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            It will appear in Requests as a pending intake record.
          </p>
        </div>
      ) : (
        <form id="lead-capture-form" onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <div>
              <label
                htmlFor="lead-name"
                style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", marginBottom: "var(--space-1)" }}
              >
                Name <span style={{ color: "var(--color-red-500, #ef4444)" }}>*</span>
              </label>
              <input
                id="lead-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer name"
                required
                autoFocus
                style={{
                  width: "100%",
                  padding: "var(--space-2) var(--space-3)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  fontSize: "var(--text-base)",
                  background: "var(--bg-input, var(--bg))",
                  color: "var(--fg)",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label
                htmlFor="lead-phone"
                style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", marginBottom: "var(--space-1)" }}
              >
                Phone
              </label>
              <input
                id="lead-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(603) 555-0100"
                style={{
                  width: "100%",
                  padding: "var(--space-2) var(--space-3)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  fontSize: "var(--text-base)",
                  background: "var(--bg-input, var(--bg))",
                  color: "var(--fg)",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label
                htmlFor="lead-description"
                style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", marginBottom: "var(--space-1)" }}
              >
                What do they need?
              </label>
              <textarea
                id="lead-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Quick description of the job…"
                rows={3}
                style={{
                  width: "100%",
                  padding: "var(--space-2) var(--space-3)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  fontSize: "var(--text-base)",
                  background: "var(--bg-input, var(--bg))",
                  color: "var(--fg)",
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
