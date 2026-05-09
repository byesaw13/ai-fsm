"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select, useToast } from "@/components/ui";

interface SubStatusOption {
  value: string;
  label: string;
}

interface SubStatusSelectProps {
  endpoint: string;
  initialValue: string | null;
  options: SubStatusOption[];
}

export function SubStatusSelect({ endpoint, initialValue, options }: SubStatusSelectProps) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(initialValue ?? "");
  const [pending, setPending] = useState(false);

  async function updateSubStatus(nextValue: string) {
    setValue(nextValue);
    setPending(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sub_status: nextValue || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error?.message ?? "Failed to update exception");
        setValue(initialValue ?? "");
        return;
      }
      toast.success(nextValue ? "Exception set" : "Exception cleared");
      router.refresh();
    } catch {
      toast.error("Unexpected error updating exception");
      setValue(initialValue ?? "");
    } finally {
      setPending(false);
    }
  }

  return (
    <Select
      id={`sub-status-${endpoint}`}
      label="Set Exception"
      value={value}
      onChange={(event) => updateSubStatus(event.target.value)}
      disabled={pending}
      options={options}
      placeholder="Clear"
    />
  );
}
