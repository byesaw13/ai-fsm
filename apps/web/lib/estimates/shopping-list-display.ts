import type { MaterialsBySection, ServiceMaterial, ShoppingList } from "@ai-fsm/domain";

export function shoppingListToMaterialsBySection(list: ShoppingList): MaterialsBySection[] {
  return list.sections.map((section) => ({
    section: section.section,
    items: [
      ...section.computed_items,
      ...section.specified_items.map((item, index) => ({
        material: {
          id: `specified-${item.service_code}-${index}`,
          price_book_id: null,
          category: null,
          material_name: item.name,
          description: item.notes,
          quantity_type: "static",
          scope_component_key: null,
          quantity_multiplier: null,
          quantity_flat: item.units_to_order,
          waste_factor: item.waste_factor,
          unit: item.unit_label,
          unit_cost_cents: item.unit_cost_cents ?? 0,
          store_section: item.store_section,
          is_consumable: false,
          is_optional: false,
          condition_factor_key: null,
          sort_order: section.computed_items.length + index,
        } satisfies ServiceMaterial,
        quantity: item.units_to_order,
        total_cost_cents: (item.unit_cost_cents ?? 0) * item.units_to_order,
      })),
    ],
    section_total_cents: section.section_total_cents,
  }));
}
