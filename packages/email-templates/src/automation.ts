import { wrap } from "./layout.js";
import type {
  ClientReactivationEmailData,
  RecurringInspectionEmailData,
  SeasonalReminderEmailData,
} from "./types.js";

export function clientReactivationHtml(d: ClientReactivationEmailData): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">We Miss You!</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, it's been about ${d.monthsSinceLastService} month${d.monthsSinceLastService !== 1 ? "s" : ""} since we last worked together, and we wanted to check in.</p>
    <p style="margin:0 0 16px;font-size:15px;color:#18181b;">Whether it's routine maintenance, a repair, or a new project — we're here when you need us. As a past client, you're always a priority on our schedule.</p>
    <p style="margin:0;font-size:13px;color:#71717a;">Just reply to this email or give us a call to get back on the books. We'd love to hear from you!</p>
  `);
}

export function seasonalReminderHtml(d: SeasonalReminderEmailData): string {
  const isSpring = d.season === "spring";
  const heading = isSpring ? "Spring Is Here — Time for a Home Checkup" : "Fall Is Here — Get Your Home Ready";
  const body = isSpring
    ? "As the weather warms up, it's a great time to address any winter wear and get your home in shape for the season ahead. We're booking spring appointments now."
    : "Before the cold sets in, let's make sure your home is ready. From weatherproofing to pre-winter maintenance, we're booking fall appointments now.";
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">${heading}</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, ${body}</p>
    <p style="margin:0;font-size:13px;color:#71717a;">Reply to this email or reach out to schedule — spots fill up fast this time of year!</p>
  `);
}

export function recurringInspectionHtml(d: RecurringInspectionEmailData): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Time for Your Annual Inspection</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, your ${d.planName} includes an annual inspection and it's time to schedule yours.</p>
    ${d.propertyAddress ? `<p style="margin:0 0 16px;font-size:14px;color:#52525b;"><strong>Property:</strong> ${d.propertyAddress}</p>` : ""}
    <p style="margin:0 0 16px;font-size:15px;color:#18181b;">Annual inspections help catch small issues before they become costly repairs — and they're included in your plan at no extra charge.</p>
    <p style="margin:0;font-size:13px;color:#71717a;">Just reply to this email to pick a date that works for you. We look forward to seeing you!</p>
  `);
}