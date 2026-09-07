"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

/**
 * Bill a staged progress payment on a long job (TASK-120, A0b). Creates a draft
 * PROGRESS invoice for ⅓ of the project total (clamped server-side to whatever
 * balance is left) and opens it for review/send.
 */
export function NewProgressInvoiceButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/progress-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error?.message ?? "Failed to create progress invoice");
        return;
      }
      toast.success("Progress invoice created");
      router.push(`/app/invoices/${data.invoice_id}`);
    } catch {
      toast.error("Unexpected error");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      className="p7-btn p7-btn-secondary"
      onClick={handleClick}
      disabled={pending}
      data-testid="new-progress-invoice-btn"
    >
      {pending ? "Creating…" : "Bill progress payment (⅓)"}
    </button>
  );
}
