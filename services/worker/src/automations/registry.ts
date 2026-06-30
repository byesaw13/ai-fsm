import type { Client } from "pg";
import { findDueReminders, processVisitReminder } from "../visit-reminder.js";
import { findDueFollowups, processInvoiceFollowup } from "../invoice-followup.js";
import {
  findDueBookingConfirmations,
  processBookingConfirmation,
} from "../booking-confirmed.js";
import { findDueReviewRequests, processReviewRequests } from "../review-request.js";
import { findDueEstimateFollowups, processEstimateFollowups } from "../estimate-followup.js";
import { findDueLeadFollowups, processLeadFollowups } from "../lead-followup.js";
import { findDueStaleJobNudges, processStaleJobs } from "../stale-job-nudge.js";
import { findDuePropertyIssueScans, processPropertyIssueScan } from "../property-issue-scan.js";
import {
  findDueClientReactivations,
  processClientReactivation,
} from "../client-reactivation.js";
import {
  findDueSeasonalSpring,
  findDueSeasonalFall,
  processSeasonalReminder,
} from "../seasonal-reminder.js";
import {
  findDueRecurringInspections,
  processRecurringInspections,
} from "../recurring-inspection.js";
import {
  advanceVisitReminderNextRun,
  advanceInvoiceFollowupNextRun,
  advanceBookingConfirmedNextRun,
  advanceReviewRequestNextRun,
  advanceEstimateFollowupNextRun,
  advanceLeadFollowupNextRun,
  advanceStaleJobNudgeNextRun,
  advancePropertyIssueScanNextRun,
  advanceClientReactivationNextRun,
  advanceSeasonalNextRun,
  advanceRecurringInspectionNextRun,
} from "./lifecycle.js";
import type { AutomationRow, RunResult } from "./types.js";

export const DISPATCHED_AUTOMATION_TYPES = [
  "visit_reminder",
  "invoice_followup",
  "booking_confirmed",
  "review_request",
  "estimate_followup",
  "lead_followup",
  "stale_job_nudge",
  "property_issue_scan",
  "client_reactivation",
  "seasonal_reminder_spring",
  "seasonal_reminder_fall",
  "recurring_inspection",
] as const;

export type DispatchedAutomationType = (typeof DISPATCHED_AUTOMATION_TYPES)[number];

export interface AutomationDefinition {
  type: string;
  logLabel: string;
  findDue: (client: Client) => Promise<AutomationRow[]>;
  process: (client: Client, automation: AutomationRow) => Promise<RunResult>;
  advanceNextRun: (client: Client, automation: AutomationRow, result: RunResult) => Promise<void>;
}

export const visitReminderDef: AutomationDefinition = {
  type: "visit_reminder",
  logLabel: "visit-reminder",
  findDue: findDueReminders,
  process: processVisitReminder,
  advanceNextRun: advanceVisitReminderNextRun,
};

export const invoiceFollowupDef: AutomationDefinition = {
  type: "invoice_followup",
  logLabel: "invoice-followup",
  findDue: findDueFollowups,
  process: processInvoiceFollowup,
  advanceNextRun: advanceInvoiceFollowupNextRun,
};

export const bookingConfirmedDef: AutomationDefinition = {
  type: "booking_confirmed",
  logLabel: "booking-confirmed",
  findDue: findDueBookingConfirmations,
  process: processBookingConfirmation,
  advanceNextRun: advanceBookingConfirmedNextRun,
};

export const reviewRequestDef: AutomationDefinition = {
  type: "review_request",
  logLabel: "review-request",
  findDue: findDueReviewRequests,
  process: processReviewRequests,
  advanceNextRun: advanceReviewRequestNextRun,
};

export const estimateFollowupDef: AutomationDefinition = {
  type: "estimate_followup",
  logLabel: "estimate-followup",
  findDue: findDueEstimateFollowups,
  process: processEstimateFollowups,
  advanceNextRun: advanceEstimateFollowupNextRun,
};

export const leadFollowupDef: AutomationDefinition = {
  type: "lead_followup",
  logLabel: "lead-followup",
  findDue: findDueLeadFollowups,
  process: processLeadFollowups,
  advanceNextRun: advanceLeadFollowupNextRun,
};

export const staleJobNudgeDef: AutomationDefinition = {
  type: "stale_job_nudge",
  logLabel: "stale-job-nudge",
  findDue: findDueStaleJobNudges,
  process: processStaleJobs,
  advanceNextRun: advanceStaleJobNudgeNextRun,
};

export const propertyIssueScanDef: AutomationDefinition = {
  type: "property_issue_scan",
  logLabel: "property-issue-scan",
  findDue: findDuePropertyIssueScans,
  process: processPropertyIssueScan,
  advanceNextRun: advancePropertyIssueScanNextRun,
};

export const clientReactivationDef: AutomationDefinition = {
  type: "client_reactivation",
  logLabel: "client-reactivation",
  findDue: findDueClientReactivations,
  process: processClientReactivation,
  advanceNextRun: advanceClientReactivationNextRun,
};

export const seasonalSpringDef: AutomationDefinition = {
  type: "seasonal_reminder_spring",
  logLabel: "seasonal-reminder-spring",
  findDue: findDueSeasonalSpring,
  process: processSeasonalReminder,
  advanceNextRun: advanceSeasonalNextRun,
};

export const seasonalFallDef: AutomationDefinition = {
  type: "seasonal_reminder_fall",
  logLabel: "seasonal-reminder-fall",
  findDue: findDueSeasonalFall,
  process: processSeasonalReminder,
  advanceNextRun: advanceSeasonalNextRun,
};

export const recurringInspectionDef: AutomationDefinition = {
  type: "recurring_inspection",
  logLabel: "recurring-inspection",
  findDue: findDueRecurringInspections,
  process: processRecurringInspections,
  advanceNextRun: advanceRecurringInspectionNextRun,
};

export const AUTOMATION_REGISTRY: AutomationDefinition[] = [
  visitReminderDef,
  invoiceFollowupDef,
  bookingConfirmedDef,
  reviewRequestDef,
  estimateFollowupDef,
  leadFollowupDef,
  staleJobNudgeDef,
  propertyIssueScanDef,
  clientReactivationDef,
  seasonalSpringDef,
  seasonalFallDef,
  recurringInspectionDef,
];