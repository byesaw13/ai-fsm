"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";

export function SetMainPropertyButton({ clientId, propertyId, selected }: { clientId: string; propertyId: string; selected: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function update() {
    setPending(true);
    try {
      const response = await fetch(`/api/v1/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primary_property_id: selected ? null : propertyId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(body.error?.message ?? "Failed to update main property");
      toast.success(selected ? "Main property cleared" : "Main property set");
      router.refresh();
    } catch {
      toast.error("Failed to update main property");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" loading={pending} onClick={update}>
      {selected ? "Clear main property" : "Set as main property"}
    </Button>
  );
}
