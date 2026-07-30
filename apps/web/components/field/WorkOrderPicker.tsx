"use client";

export type WorkOrderPickerOption = {
  id: string;
  title: string;
  scheduledToday?: boolean;
};

export function WorkOrderPicker({
  options,
  value,
  onChange,
}: {
  options: WorkOrderPickerOption[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <select
      className="text-sm border rounded px-2 py-1 mb-2 w-full"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      data-testid="work-order-picker"
    >
      <option value="" disabled>
        Select work order…
      </option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.title}
          {o.scheduledToday ? " · today" : ""}
        </option>
      ))}
    </select>
  );
}
