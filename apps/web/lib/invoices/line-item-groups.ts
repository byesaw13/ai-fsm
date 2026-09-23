// Group invoice line items into ordered, subtotaled sections for display
// (TASK-152 slice 2). Materials split into "Materials" vs "Equipment & rentals"
// by material_kind (migration 190); labor/handling/adjustment stay their own
// sections. Pure + generic so every invoice surface can render the same shape.

export type GroupableLineItem = {
  line_item_type: "labor" | "materials" | "handling_fee" | "adjustment" | string;
  material_kind?: string | null;
  total_cents: number;
  sort_order?: number | null;
};

export type InvoiceLineItemGroup<T> = {
  key: string;
  label: string;
  items: T[];
  subtotalCents: number;
};

const SECTION_ORDER = ["labor", "materials", "equipment", "handling_fee", "adjustment"] as const;

const SECTION_LABEL: Record<string, string> = {
  labor: "Labor",
  materials: "Materials",
  equipment: "Equipment & rentals",
  handling_fee: "Handling",
  adjustment: "Adjustments",
};

/** Which display section a line belongs to. Materials tagged equipment split out;
 *  untagged/legacy materials (material_kind NULL) fall under "Materials". */
export function lineItemSectionKey(item: GroupableLineItem): string {
  if (item.line_item_type === "materials") {
    return item.material_kind === "equipment" ? "equipment" : "materials";
  }
  return item.line_item_type;
}

export function groupInvoiceLineItems<T extends GroupableLineItem>(
  items: T[],
): InvoiceLineItemGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = lineItemSectionKey(item);
    const arr = buckets.get(key) ?? [];
    arr.push(item);
    buckets.set(key, arr);
  }

  const groups: InvoiceLineItemGroup<T>[] = [];
  for (const key of SECTION_ORDER) {
    const arr = buckets.get(key);
    if (!arr || arr.length === 0) continue;
    // Stable within-section order by the persisted sort_order.
    arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    groups.push({
      key,
      label: SECTION_LABEL[key] ?? key,
      items: arr,
      subtotalCents: arr.reduce((sum, x) => sum + x.total_cents, 0),
    });
  }
  return groups;
}
