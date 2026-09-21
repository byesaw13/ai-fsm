/** Covering tech is a Today user, not a dispatch board seat. */
export function coveringTechFieldLabel(): string {
  return "Covering tech";
}

export function coveringTechFieldHint(): string {
  return "They see this job on Today.";
}

export function coveringTechAssignedToast(assigned: boolean): string {
  return assigned ? coveringTechFieldHint() : "Nobody is on Today for this job.";
}

export type CoveringTechTodayAccess = {
  userId: string;
  workOrderAssignedUserId: string | null | undefined;
  visitAssignedUserIds: Array<string | null | undefined>;
};

/** Today shows the job if this user is the lead or covering a live visit. */
export function coveringTechSeesJobOnToday(input: CoveringTechTodayAccess): boolean {
  if (input.workOrderAssignedUserId === input.userId) return true;
  return input.visitAssignedUserIds.some((id) => id === input.userId);
}

export function coveringTechCanOpenJob(input: CoveringTechTodayAccess): boolean {
  return coveringTechSeesJobOnToday(input);
}

/** Coming-back first-up waiting on Today for the covering tech. */
export function coveringTechStartHere(firstUp: string | null | undefined): string | null {
  const note = firstUp?.trim();
  return note ? note : null;
}

/** SQL predicate: WO lead or covering an open visit. `userParam` is `$2` / `$3`. */
export function todayCoveringTechSql(userParam: string): string {
  return `(
    w.assigned_user_id = ${userParam}
    OR EXISTS (
      SELECT 1 FROM visits cv
      WHERE cv.work_order_id = w.id
        AND cv.account_id = w.account_id
        AND cv.assigned_user_id = ${userParam}
        AND cv.status NOT IN ('completed','cancelled')
    )
  )`;
}
