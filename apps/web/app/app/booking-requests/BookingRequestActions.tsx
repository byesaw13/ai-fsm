"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LinkButton, useToast } from "@/components/ui";

interface BookingRequestActionsProps {
  requestId: string;
  status: string;
  jobId: string | null;
}

export function BookingRequestActions({ requestId, status, jobId }: BookingRequestActionsProps) {
  const router = useRouter();
  const toast = useToast();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function updateStatus(nextStatus: "reviewed" | "cancelled") {
    setPendingAction(nextStatus);
    try {
      const res = await fetch(`/api/v1/booking-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error?.message ?? "Could not update request");
        return;
      }
      toast.success(nextStatus === "reviewed" ? "Request marked reviewed" : "Request cancelled");
      router.refresh();
    } catch {
      toast.error("Unexpected error");
    } finally {
      setPendingAction(null);
    }
  }

  if (status === "cancelled") return null;

  return (
    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "flex-end" }}>
      {jobId && (
        <>
          <LinkButton href={`/app/jobs/${jobId}`} variant="secondary" size="sm">
            View Job
          </LinkButton>
          {status === "reviewed" && (
            <LinkButton href={`/app/jobs/${jobId}/visits/new?bookingRequestId=${requestId}`} variant="primary" size="sm">
              Schedule
            </LinkButton>
          )}
        </>
      )}
      {status === "pending" && (
        <>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pendingAction !== null}
            onClick={() => updateStatus("reviewed")}
          >
            {pendingAction === "reviewed" ? "Updating..." : "Mark Reviewed"}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={pendingAction !== null}
            onClick={() => updateStatus("cancelled")}
          >
            {pendingAction === "cancelled" ? "Cancelling..." : "Cancel"}
          </Button>
        </>
      )}
    </div>
  );
}
