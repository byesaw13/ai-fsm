import type { DayEntry } from "@/lib/activities/summary";

/**
 * Shared field-day DTO types. Types-only module so client components and the
 * server data-loader can both import them without crossing the client/server
 * boundary (previously defined inside page components).
 */

export type VehicleOption = {
  id: string;
  nickname: string;
  plate: string | null;
  current_odometer: number | null;
};

export type OpenSession = {
  id: string;
  session_date: string;
  vehicle_id: string | null;
  vehicle_nickname: string | null;
  vehicle_plate: string | null;
  start_odometer: number;
  started_at?: string | null;
};

export type ActivityEntryDto = DayEntry & {
  id: string;
  entity_type: string | null;
  entity_id: string | null;
  assignment_kind: string | null;
  labor_bucket: string | null;
  note: string | null;
};
