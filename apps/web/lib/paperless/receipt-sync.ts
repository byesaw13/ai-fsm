/**
 * Receipt → Paperless bridge.
 *
 * When a receipt is uploaded to an expense, mirror it into Paperless so the
 * same capture lands in the permanent, OCR-searchable archive, then link the
 * resulting Paperless document back to the expense via document_links.
 *
 * Best-effort by design (ADR-020): Paperless being down, slow, or rejecting
 * the file never affects the expense workflow. Runs after the response is
 * sent — never on the request critical path.
 */

import type { SessionPayload } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { uploadPaperlessDocument, waitForPaperlessDocument, isPaperlessEnabled } from "./client";
import { withDocumentContext, createDocumentLink } from "./db";

export interface ReceiptSyncInput {
  session: SessionPayload;
  expenseId: string;
  vendorName: string | null;
  /** YYYY-MM-DD */
  expenseDate: string | null;
  data: Buffer | Uint8Array;
  filename: string;
  mimeType: string;
  traceId?: string;
}

/** Compose a human-meaningful Paperless title for an expense receipt. */
export function buildReceiptTitle(vendorName: string | null, expenseDate: string | null): string {
  const vendor = vendorName?.trim() || "Receipt";
  return expenseDate ? `${vendor} receipt ${expenseDate}` : `${vendor} receipt`;
}

/**
 * Upload a receipt to Paperless and link the consumed document to the
 * expense. Returns the created link's paperless_doc_id, or null when skipped
 * or failed (already logged). Never throws.
 */
export async function syncReceiptToPaperless(input: ReceiptSyncInput): Promise<number | null> {
  if (!isPaperlessEnabled()) return null;

  const { session, expenseId, traceId } = input;
  try {
    const title = buildReceiptTitle(input.vendorName, input.expenseDate);
    const taskId = await uploadPaperlessDocument({
      data: input.data,
      filename: input.filename,
      mimeType: input.mimeType,
      title,
    });
    if (!taskId) {
      logger.warn("Paperless receipt upload rejected or unreachable", { expenseId, traceId });
      return null;
    }

    const docId = await waitForPaperlessDocument(taskId);
    if (docId === null) {
      logger.warn("Paperless receipt consume did not complete", { expenseId, taskId, traceId });
      return null;
    }

    await withDocumentContext(session, (client) =>
      createDocumentLink(client, session.accountId, {
        entityType: "expense",
        entityId: expenseId,
        paperlessDocId: docId,
        title,
        originalFilename: input.filename,
        createdBy: session.userId,
      })
    );

    logger.info("Receipt synced to Paperless", { expenseId, paperlessDocId: docId, traceId });
    return docId;
  } catch (error) {
    logger.error("Receipt → Paperless sync failed", error, { expenseId, traceId });
    return null;
  }
}
