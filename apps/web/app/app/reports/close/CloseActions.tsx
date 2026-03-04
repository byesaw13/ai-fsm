"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/ui";

// ---------------------------------------------------------------------------
// CloseActions — client component for close/reopen mutations on a period.
//
// Receives the current month string ("YYYY-MM"), closed state, and which
// actions the current user may perform.  Mutations hit the period-closes API
// and refresh the server component on success.
// ---------------------------------------------------------------------------

interface CloseActionsProps {
  month: string;
  isClosed: boolean;
  canClose: boolean;   // admin or owner
  canReopen: boolean;  // owner only
}

export function CloseActions({
  month,
  isClosed,
  canClose,
  canReopen,
}: CloseActionsProps) {
  const router = useRouter();
  const { success, error } = useToast();

  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleClose() {
    setPending(true);
    try {
      const res = await fetch("/api/v1/reports/period-closes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: { message?: string } }).error?.message ??
            "Failed to close period"
        );
      }
      success(`Period ${month} marked as closed.`);
      setShowCloseDialog(false);
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "Failed to close period");
    } finally {
      setPending(false);
    }
  }

  async function handleReopen() {
    setPending(true);
    try {
      const res = await fetch(
        `/api/v1/reports/period-closes?month=${encodeURIComponent(month)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: { message?: string } }).error?.message ??
            "Failed to reopen period"
        );
      }
      success(`Period ${month} reopened.`);
      setShowReopenDialog(false);
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "Failed to reopen period");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {/* Action buttons */}
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
        {!isClosed && canClose && (
          <Button
            variant="primary"
            onClick={() => setShowCloseDialog(true)}
            disabled={pending}
          >
            Mark Period Closed
          </Button>
        )}
        {isClosed && canReopen && (
          <Button
            variant="danger"
            onClick={() => setShowReopenDialog(true)}
            disabled={pending}
          >
            Reopen Period
          </Button>
        )}
        {isClosed && !canReopen && (
          <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
            Contact an owner to reopen this period.
          </p>
        )}
      </div>

      {/* Close confirmation */}
      <ConfirmDialog
        open={showCloseDialog}
        title={`Close period ${month}?`}
        body={`This marks ${month} as reviewed and ready for bookkeeping handoff. Data can still be exported after closing. Only an owner can reopen a closed period.`}
        confirmLabel="Close Period"
        cancelLabel="Cancel"
        onConfirm={handleClose}
        onCancel={() => setShowCloseDialog(false)}
        loading={pending}
      />

      {/* Reopen confirmation */}
      <ConfirmDialog
        open={showReopenDialog}
        title={`Reopen period ${month}?`}
        body={`This removes the close record for ${month} and marks it as open again. Use this only if the period was closed prematurely.`}
        confirmLabel="Reopen Period"
        cancelLabel="Cancel"
        onConfirm={handleReopen}
        onCancel={() => setShowReopenDialog(false)}
        loading={pending}
      />
    </>
  );
}
