"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog } from "@/components/ui";

interface Props {
  invoiceId: string;
  status: string;
  invoiceNumber?: string | null;
}

export function DeleteInvoiceButton({ invoiceId, status, invoiceNumber }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const label = invoiceNumber?.trim() || "this invoice";
  const body =
    status === "draft"
      ? `Permanently delete ${label}? This cannot be undone. The delete is written to the audit log.`
      : `Permanently delete ${label} (status: ${status})? Use this for wrong or test invoices with no payments. Deletes are recorded in the audit log.`;

  async function handleDelete() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/invoices/${invoiceId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Delete failed");
      } else {
        router.push("/app/invoices");
        router.refresh();
      }
    } catch {
      setError("Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div data-testid="delete-invoice-panel">
      {error && <p className="error-inline" data-testid="delete-invoice-error">{error}</p>}
      <Button
        variant="danger"
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
        data-testid="delete-invoice-btn"
      >
        {loading ? "Deleting…" : "Delete Invoice"}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Invoice?"
        body={body}
        confirmLabel="Delete Invoice"
        onConfirm={() => {
          setConfirmOpen(false);
          handleDelete();
        }}
        onCancel={() => setConfirmOpen(false)}
        loading={loading}
      />
    </div>
  );
}
