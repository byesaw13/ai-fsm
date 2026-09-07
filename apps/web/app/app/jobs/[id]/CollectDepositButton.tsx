"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

/**
 * Collect a deposit before work starts (TASK-120 deposit gate). Creates (or
 * opens) the draft deposit invoice at the estimate's deposit — or the company
 * standard deposit % — and opens it for review/send. One tap, no manual detour.
 */
export function CollectDepositButton({
  jobId,
  label = "Collect a deposit",
  variant = "primary",
}: {
  jobId: string;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/deposit-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error?.message ?? "Failed to create deposit invoice");
        return;
      }
      toast.success(data.created === false ? "Opening the deposit invoice" : "Deposit invoice created");
      router.push(`/app/invoices/${data.invoice_id}`);
    } catch {
      toast.error("Unexpected error");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      className={`p7-btn p7-btn-${variant} p7-btn-sm`}
      onClick={handleClick}
      disabled={pending}
      data-testid="collect-deposit-btn"
    >
      {pending ? "Working…" : label}
    </button>
  );
}
