export const DEPOSIT_TYPES = ["none", "materials", "percentage", "fixed"] as const;
export type DepositType = typeof DEPOSIT_TYPES[number];

export const DEPOSIT_DUE_TRIGGERS = ["on_acceptance", "before_scheduling", "before_material_order", "custom"] as const;
export type DepositDueTrigger = typeof DEPOSIT_DUE_TRIGGERS[number];

export interface DepositPolicyInput {
  deposit_required?: boolean | null;
  deposit_type?: DepositType | null;
  deposit_percentage?: number | null;
  deposit_fixed_cents?: number | null;
  material_total_cents?: number | null;
  total_cents: number;
}

export interface DepositPolicyResult {
  deposit_required: boolean;
  deposit_type: DepositType;
  deposit_cents: number;
  balance_cents: number;
}

export function calculateDepositPolicy(input: DepositPolicyInput): DepositPolicyResult {
  const total = Math.max(0, Math.round(input.total_cents || 0));
  const required = input.deposit_required === true;
  const type: DepositType = required ? (input.deposit_type ?? "percentage") : "none";

  if (!required || type === "none" || total === 0) {
    return { deposit_required: false, deposit_type: "none", deposit_cents: 0, balance_cents: total };
  }

  let deposit = 0;
  if (type === "materials") {
    deposit = Math.max(0, Math.round(input.material_total_cents ?? 0));
  } else if (type === "percentage") {
    const pct = clampNumber(input.deposit_percentage ?? 0, 0, 100);
    deposit = Math.round(total * (pct / 100));
  } else if (type === "fixed") {
    deposit = Math.max(0, Math.round(input.deposit_fixed_cents ?? 0));
  }

  deposit = Math.min(deposit, total);
  return {
    deposit_required: deposit > 0,
    deposit_type: deposit > 0 ? type : "none",
    deposit_cents: deposit,
    balance_cents: total - deposit,
  };
}

export function estimateMaterialsDepositBasis(items: Array<{ total_cents?: number; unit_price_cents?: number; quantity?: number; line_item_type?: string; visible_to_customer?: boolean }>, explicitMaterialCents = 0): number {
  const lineMaterialCents = items
    .filter((item) => item.visible_to_customer !== false && item.line_item_type === "materials")
    .reduce((sum, item) => {
      if (typeof item.total_cents === "number") return sum + item.total_cents;
      return sum + Math.round((item.quantity ?? 1) * (item.unit_price_cents ?? 0));
    }, 0);
  return Math.max(0, lineMaterialCents + explicitMaterialCents);
}

export function depositDueTriggerLabel(trigger: DepositDueTrigger | null | undefined): string {
  switch (trigger) {
    case "on_acceptance": return "Due when estimate is accepted";
    case "before_material_order": return "Due before materials are ordered";
    case "custom": return "Due per written agreement";
    case "before_scheduling":
    default:
      return "Due before scheduling";
  }
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
