// TASK-028 (EPIC-006): the field-workday UI now lives in `WorkdayPanel` so the
// Technician My Day surface can reuse it. This file is a thin compatibility
// alias — `/app` (the owner dashboard) still renders `DailyCommandCenter`, which
// is `WorkdayPanel`. Behavior is unchanged. The field/business separation is a
// later phase (TASK-030).
export type { CountAction, CommandVisit, MaterialJob } from "./DashboardWidgets";
export type { VehicleOption, OpenSession, EndWarnings } from "./WorkdayPanel";
export { WorkdayPanel as DailyCommandCenter } from "./WorkdayPanel";
