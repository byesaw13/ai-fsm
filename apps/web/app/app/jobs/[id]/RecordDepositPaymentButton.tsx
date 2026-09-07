"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

/** Record a payment on a sent deposit invoice (does not PATCH deposit_paid_at). */
export function RecordDepositPaymentButton({
  invoiceId,
  amountCents,
}: {
  invoiceId: string;
  amountCents: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_cents: amountCents,
          method: "cash",
          payment_type: "deposit",
          notes: "Deposit received",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error?.message ?? "Failed to record deposit payment");
        return;
      }
      toast.success("Deposit payment recorded");
      router.refresh();
    } catch {
      toast.error("Unexpected error");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      className="p7-btn p7-btn-secondary p7-btn-sm"
      onClick={handleClick}
      disabled={pending}
      data-testid="record-deposit-payment-btn"
    >
      {pending ? "Saving…" : `Mark $${(amountCents / 100).toFixed(2)} received`}
    </button>
  );
}
