/** Money that cleared. Pending links and refund rows are not cash collected. */
export const COLLECTED_CASH_STATUS = "paid";

export function countsAsCollectedCash(status: string): boolean {
  return status === COLLECTED_CASH_STATUS;
}

export function collectedCashStatusSql(): string {
  if (!/^[a-z]+$/.test(COLLECTED_CASH_STATUS)) {
    throw new Error("Refusing to interpolate payment status");
  }
  return `status = '${COLLECTED_CASH_STATUS}'`;
}
