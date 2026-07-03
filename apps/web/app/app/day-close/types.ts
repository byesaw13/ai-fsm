export type DayCloseRowStatus = "ok" | "blocked" | "warning";

export type DayCloseStatusPayload = {
  clockOpen: boolean;
  activeActivity: { id: string; activityType: string; label: string } | null;
  openSession: { id: string; vehicleName: string | null; startOdometer: number } | null;
  missingReceiptPhotos: number;
  visitsToday: number;
  notesAcknowledged: boolean;
};

export type DayCloseDerived = {
  canClose: boolean;
  hardBlockerCount: number;
  softWarningCount: number;
  readyCount: number;
  totalTasks: number;
  rows: {
    payroll: { status: DayCloseRowStatus };
    activity: { status: DayCloseRowStatus };
    mileage: { status: DayCloseRowStatus };
    expenses: { status: DayCloseRowStatus };
    notes: { status: DayCloseRowStatus };
  };
  closeButtonHint: string;
};