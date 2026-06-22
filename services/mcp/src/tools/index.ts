import type { ToolModule } from "./types.js";
import searchClients from "./search-clients.js";
import getClientSummary from "./get-client-summary.js";
import getInvoiceStatus from "./get-invoice-status.js";
import listUnpaidInvoices from "./list-unpaid-invoices.js";
import listOpenEstimates from "./list-open-estimates.js";
import getJobSummary from "./get-job-summary.js";
import getRecentPayments from "./get-recent-payments.js";
import getDailyOperationsLog from "./get-daily-operations-log.js";

/** All read-only tools exposed by the server, in a stable order. */
export const tools: ToolModule[] = [
  searchClients,
  getClientSummary,
  getInvoiceStatus,
  listUnpaidInvoices,
  listOpenEstimates,
  getJobSummary,
  getRecentPayments,
  getDailyOperationsLog,
];

export type { ToolModule };
