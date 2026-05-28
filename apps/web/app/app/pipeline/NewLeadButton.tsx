"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { LeadCaptureSheet } from "@/components/LeadCaptureSheet";

export function NewLeadButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)} data-testid="new-lead-btn">
        + New Request
      </Button>
      <LeadCaptureSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
