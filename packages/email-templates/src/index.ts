export * from "./types.js";

export { BRAND, btn, wrap } from "./layout.js";

export {
  invoiceEmailHtml,
  invoiceEmailText,
  invoiceFollowupEmailHtml,
} from "./invoice.js";

export {
  estimateEmailHtml,
  estimateEmailText,
  estimateFollowupHtml,
} from "./estimate.js";

export {
  visitReminderEmailHtml,
  onMyWayEmailHtml,
  bookingConfirmedEmailHtml,
} from "./visit.js";

export {
  intakeInviteEmailHtml,
  intakeInviteEmailText,
} from "./intake.js";

export { reviewRequestEmailHtml } from "./review.js";

export {
  clientReactivationHtml,
  seasonalReminderHtml,
  recurringInspectionHtml,
} from "./automation.js";

import { bookingConfirmedEmailHtml } from "./visit.js";
import { invoiceFollowupEmailHtml } from "./invoice.js";
import { reviewRequestEmailHtml } from "./review.js";
import { visitReminderEmailHtml } from "./visit.js";
import type { BookingConfirmedEmailData, InvoiceFollowupEmailData, ReviewRequestEmailData } from "./types.js";

/** @deprecated Use visitReminderEmailHtml */
export function visitReminderHtml(d: {
  clientName: string;
  jobTitle: string;
  when: string;
  propertyAddress: string | null;
  techName: string | null;
}): string {
  return visitReminderEmailHtml({
    clientName: d.clientName,
    jobTitle: d.jobTitle,
    scheduledStart: d.when,
    propertyAddress: d.propertyAddress,
    techName: d.techName,
  });
}

/** @deprecated Use invoiceFollowupEmailHtml */
export const invoiceFollowupHtml: (d: InvoiceFollowupEmailData) => string = invoiceFollowupEmailHtml;

/** @deprecated Use bookingConfirmedEmailHtml */
export const bookingConfirmedHtml: (d: BookingConfirmedEmailData) => string = bookingConfirmedEmailHtml;

/** @deprecated Use reviewRequestEmailHtml */
export const reviewRequestHtml: (d: ReviewRequestEmailData) => string = reviewRequestEmailHtml;