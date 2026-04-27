"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

interface MarkDepositReceivedButtonProps {
  invoiceId: string;
  depositCents: number;
}

export function MarkDepositReceivedButton({ invoiceId, depositCents }: MarkDepositReceivedButtonProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposit_paid_at: new Date().toISOString() }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error?.message ?? "Failed to mark deposit received");
        return;
      }
      toast.success("Deposit marked as received");
      router.refresh();
    } catch {
      toast.error("Unexpected error");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      className="btn btn-secondary"
      onClick={handleClick}
      disabled={pending}
      data-testid="mark-deposit-received-btn"
    >
      {pending ? "Saving…" : `Mark $${(depositCents / 100).toFixed(2)} Deposit Received`}
    </button>
  );
}
