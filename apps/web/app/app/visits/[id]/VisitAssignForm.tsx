"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select, useToast } from "@/components/ui";

interface User {
  id: string;
  full_name: string;
  role: string;
}

interface VisitAssignFormProps {
  visitId: string;
  users: User[];
  currentAssignedId: string | null;
}

export function VisitAssignForm({
  visitId,
  users,
  currentAssignedId,
}: VisitAssignFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState(currentAssignedId ?? "");
  const [pending, setPending] = useState(false);

  const isDirty = selected !== (currentAssignedId ?? "");

  async function handleSave() {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_user_id: selected || null }),
      });
      if (!res.ok) {
        toast.error("Failed to update assignment");
      } else {
        toast.success(selected ? "Visit assigned" : "Assignment removed");
        router.refresh();
      }
    } catch {
      toast.error("Unexpected error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
      <div style={{ flex: 1 }}>
        <Select
          id="visit-assign"
          options={users.map((u) => ({
            value: u.id,
            label: `${u.full_name} (${u.role})`,
          }))}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          placeholder="Unassigned"
          disabled={pending}
        />
      </div>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || !isDirty}
        onClick={handleSave}
      >
        Save
      </Button>
    </div>
  );
}
