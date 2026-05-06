"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";

interface Props {
  visitId: string;
  sentAt: string | null;
  canUpdate?: boolean;
}

export function SnapshotDeliveryButton({ visitId, sentAt, canUpdate = false }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function markSent() {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membership_snapshot_sent: true }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error?.message ?? "Could not mark summary sent");
        return;
      }

      toast.success("Visit summary marked sent");
      router.refresh();
    } catch {
      toast.error("Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  if (sentAt) {
    return (
      <p
        data-testid="snapshot-delivery-status"
        style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--color-success)" }}
      >
        Summary sent {new Date(sentAt).toLocaleString()}
      </p>
    );
  }

  if (!canUpdate) {
    return (
      <p
        data-testid="snapshot-delivery-status"
        style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--color-warning, #b45309)" }}
      >
        Summary not yet sent.
      </p>
    );
  }

  return (
    <Button
      onClick={markSent}
      disabled={saving}
      variant="secondary"
      size="sm"
      data-testid="mark-snapshot-sent-btn"
    >
      {saving ? "Saving..." : "Mark Summary Sent"}
    </Button>
  );
}
