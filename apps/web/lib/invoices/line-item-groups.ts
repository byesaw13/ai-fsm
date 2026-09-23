// Group invoice line items into ordered, subtotaled sections for display
// (TASK-152 slice 2). Materials split into "Materials" vs "Equipment & rentals"
// by material_kind (migration 190); labor/handling/adjustment stay their own
// sections. Pure + generic so every invoice surface can render the same shape.

export type GroupableLineItem = {
  line_item_type: "labor" | "materials" | "handling_fee" | "adjustment" | string;
  material_kind?: string | null;
  store_section?: string | null;
  total_cents: number;
  sort_order?: number | null;
};

export type InvoiceLineItemSubgroup<T> = {
  section: string | null;
  label: string;
  items: T[];
  subtotalCents: number;
};

export type InvoiceLineItemGroup<T> = {
  key: string;
  label: string;
  items: T[];
  subtotalCents: number;
  /** Only on the "materials" group, and only when any line carries a store_section:
   *  named sections first (alpha), then "Other" (NULL section) last. */
  subgroups?: InvoiceLineItemSubgroup<T>[];
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
      subgroups: key === "materials" ? subgroupBySection(arr) : undefined,
    });
  }
  return groups;
}

/** Sub-group material lines by store_section: named sections alpha-sorted first,
 *  then "Other" (NULL/blank) last. Returns undefined when no line has a section
 *  (so the caller renders a flat list unchanged). */
export function subgroupBySection<T extends GroupableLineItem>(
  items: T[],
): InvoiceLineItemSubgroup<T>[] | undefined {
  // A blank section, or a literal "Other", is the fallback bucket (labeled Other),
  // so an owner typing "Other" doesn't create a duplicate group.
  const normalize = (s?: string | null): string | null => {
    const t = (s ?? "").trim();
    return t && t.toLowerCase() !== "other" ? t : null;
  };
  const hasAnySection = items.some((i) => normalize(i.store_section) !== null);
  if (!hasAnySection) return undefined;

  const buckets = new Map<string | null, T[]>();
  for (const item of items) {
    const section = normalize(item.store_section);
    const arr = buckets.get(section) ?? [];
    arr.push(item);
    buckets.set(section, arr);
  }
  const named = [...buckets.keys()].filter((s): s is string => s !== null).sort((a, b) => a.localeCompare(b));
  const order: (string | null)[] = [...named, ...(buckets.has(null) ? [null] : [])];
  return order.map((section) => {
    const arr = buckets.get(section)!;
    arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return {
      section,
      label: section ?? "Other",
      items: arr,
      subtotalCents: arr.reduce((sum, x) => sum + x.total_cents, 0),
    };
  });
}
