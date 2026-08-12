"use client";

import { useEffect, useState } from "react";
import { Button, LinkButton, Modal } from "@/components/ui";

interface Props {
  jobId: string;
  jobStatus: string;
  hasPaidInvoice: boolean;
  hasUnpaidInvoice: boolean;
  latestInvoiceId: string | null;
}

/**
 * One-shot coach when billing finished before project status.
 * Session-scoped so it doesn't nag every navigation after dismiss.
 */
export function ProjectCloseoutCoach({
  jobId,
  jobStatus,
  hasPaidInvoice,
  hasUnpaidInvoice,
  latestInvoiceId,
}: Props) {
  const storageKey = `closeout-coach-dismissed:${jobId}`;
  const needsCoach =
    hasPaidInvoice &&
    !hasUnpaidInvoice &&
    jobStatus !== "invoiced" &&
    jobStatus !== "cancelled";

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!needsCoach) return;
    try {
      if (sessionStorage.getItem(storageKey) === "1") return;
    } catch {
      /* ignore */
    }
    setOpen(true);
  }, [needsCoach, storageKey]);

  function dismiss() {
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!needsCoach) return null;

  const isCompleted = jobStatus === "completed";

  return (
    <Modal
      open={open}
      onClose={dismiss}
      title="Close this project in the right order"
      data-testid="project-closeout-coach"
      footer={
        <>
          <Button variant="secondary" onClick={dismiss}>
            Later
          </Button>
          <LinkButton
            href={`/app/jobs/${jobId}#project-status`}
            variant="primary"
            onClick={dismiss}
          >
            {isCompleted ? "Mark as Invoiced" : "Go to project status"}
          </LinkButton>
        </>
      }
    >
      <p className="p7-confirm-body" style={{ marginTop: 0 }}>
        The invoice is already <strong>paid</strong>, but this project is still{" "}
        <strong>{jobStatus.replaceAll("_", " ")}</strong>. Field visits and work
        orders do not close the project — you still need the status steps so it
        leaves the active queue.
      </p>
      <ol style={{ margin: "12px 0 0", paddingLeft: 20, lineHeight: 1.5 }}>
        {!isCompleted && (
          <li>
            <strong>Complete project</strong> at Project status (won&apos;t create a
            second invoice when one already exists).
          </li>
        )}
        <li>
          <strong>Mark as Invoiced</strong> to finish books.
        </li>
        {latestInvoiceId && (
          <li>
            Optional:{" "}
            <a href={`/app/invoices/${latestInvoiceId}`}>open the paid invoice</a>.
          </li>
        )}
      </ol>
    </Modal>
  );
}
