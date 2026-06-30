import { BRAND, wrap } from "./layout.js";
import type { BookingConfirmedEmailData, OnMyWayEmailData, VisitReminderEmailData } from "./types.js";

export function visitReminderEmailHtml(d: VisitReminderEmailData): string {
  const when = new Date(d.scheduledStart).toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Visit Reminder</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, this is a reminder about your upcoming service visit.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Service:</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${d.jobTitle}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">When:</td><td style="padding:4px 0;font-size:13px;">${when}</td></tr>
      ${d.propertyAddress ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Where:</td><td style="padding:4px 0;font-size:13px;">${d.propertyAddress}</td></tr>` : ""}
      ${d.techName ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Technician:</td><td style="padding:4px 0;font-size:13px;">${d.techName}</td></tr>` : ""}
    </table>
    <p style="margin:0;font-size:14px;color:#52525b;">Questions? Please contact us and we'll be happy to help.</p>
  `);
}

export function onMyWayEmailHtml(d: OnMyWayEmailData): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">On My Way!</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, your technician is on their way to your service visit.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Service:</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${d.jobTitle}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Scheduled:</td><td style="padding:4px 0;font-size:13px;">${d.when}</td></tr>
      ${d.propertyAddress ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Location:</td><td style="padding:4px 0;font-size:13px;">${d.propertyAddress}</td></tr>` : ""}
      ${d.techName ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Technician:</td><td style="padding:4px 0;font-size:13px;">${d.techName}</td></tr>` : ""}
    </table>
    <p style="margin:0;font-size:14px;color:#52525b;">Please ensure someone is available to provide access. Questions? Contact us and we'll be happy to help.</p>
  `);
}

export function bookingConfirmedEmailHtml(d: BookingConfirmedEmailData): string {
  const start = new Date(d.scheduledStart).toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  const end = new Date(d.scheduledEnd).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit",
  });
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#16a34a;">Booking Confirmed</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, your visit with ${BRAND} is confirmed. We look forward to seeing you!</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Service:</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${d.jobTitle}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Date &amp; Time:</td><td style="padding:4px 0;font-size:13px;">${start} – ${end}</td></tr>
      ${d.propertyAddress ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Location:</td><td style="padding:4px 0;font-size:13px;">${d.propertyAddress}</td></tr>` : ""}
      ${d.techName ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Technician:</td><td style="padding:4px 0;font-size:13px;">${d.techName}</td></tr>` : ""}
    </table>
    <p style="margin:0;font-size:14px;color:#52525b;">Need to reschedule or have questions? Just reply to this email or give us a call — we're happy to help.</p>
  `);
}