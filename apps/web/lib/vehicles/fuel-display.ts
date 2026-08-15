export const VEHICLE_COST_LABELS: Record<string, string> = {
  vehicle_fuel: "Fuel",
  fuel: "Fuel",
  vehicle_maintenance: "Service",
  vehicle_registration: "Registration",
  vehicle_insurance: "Insurance",
  vehicle_loan_payment: "Loan",
};

export function vehicleCostLabel(category: string): string {
  return VEHICLE_COST_LABELS[category] ?? category.replace(/_/g, " ");
}

export function dollarsFromCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatGallons(gallons: number): string {
  return gallons.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 3,
  });
}

export function formatFillDate(iso: string): string {
  const day = iso.slice(0, 10);
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
