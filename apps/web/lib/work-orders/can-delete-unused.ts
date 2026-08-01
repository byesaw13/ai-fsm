/**
 * Unused work packets: draft or cancelled, and no field days.
 * Visits.work_order_id is RESTRICT — cannot delete if visits remain.
 */
export function canDeleteUnusedWorkOrder(wo: {
  status: string;
  visit_count: number;
}): boolean {
  if ((Number(wo.visit_count) || 0) > 0) return false;
  return wo.status === "draft" || wo.status === "cancelled";
}
