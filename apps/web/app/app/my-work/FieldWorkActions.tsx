"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui";

export function FieldWorkActions({
  workOrderId,
  activeVisitId,
}: {
  workOrderId: string;
  activeVisitId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function startOrResume() {
    if (activeVisitId) {
      router.push(`/app/visits/${activeVisitId}` as Route);
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/v1/work-orders/${workOrderId}/start-visit`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error?.message ?? "Could not start work");
        return;
      }
      router.push(`/app/visits/${json.data.visit_id}` as Route);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="primary" loading={pending} onClick={startOrResume}>
      {activeVisitId ? "Resume Work" : "Start Today's Visit"}
    </Button>
  );
}