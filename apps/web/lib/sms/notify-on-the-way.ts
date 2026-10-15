/** Best-effort. Navigate must still open if the text cannot be sent. */
export function notifyOnTheWay(visitId: string): void {
  void fetch(`/api/v1/visits/${visitId}/on-the-way`, { method: "POST", keepalive: true }).catch(() => {});
}
