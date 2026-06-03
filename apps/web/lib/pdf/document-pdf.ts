/**
 * Server-side PDF generation for client-facing documents (invoices & estimates).
 *
 * Uses pdf-lib (pure JS, no native deps, no font files on disk) so it runs
 * cleanly inside the Next.js server runtime and on the garonhome mini PC.
 *
 * Layout is intentionally simple: a branded header, bill-to block, a line-item
 * table, a totals block, and optional notes. Both document types share the same
 * primitives via `renderDocument`.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const BRAND = "Dovetails Services LLC";
const BRAND_URL = "mydovetails.com";

const PAGE_W = 612; // US Letter @ 72dpi
const PAGE_H = 792;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.82, 0.84, 0.87);
const ACCENT = rgb(0.13, 0.32, 0.52);

export interface PdfLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  status: string;
  clientName: string | null;
  clientEmail?: string | null;
  jobTitle?: string | null;
  propertyAddress?: string | null;
  issueDate?: string | Date | null;
  dueDate?: string | Date | null;
  subtotalCents: number;
  taxCents?: number | null;
  totalCents: number;
  paidCents: number;
  notes?: string | null;
  lineItems: PdfLineItem[];
}

export interface EstimatePdfData {
  estimateRef: string;
  status: string;
  clientName: string | null;
  clientEmail?: string | null;
  jobTitle?: string | null;
  propertyAddress?: string | null;
  issueDate?: string | Date | null;
  expiresDate?: string | Date | null;
  subtotalCents: number;
  taxCents?: number | null;
  totalCents: number;
  depositCents?: number | null;
  notes?: string | null;
  lineItems: PdfLineItem[];
}

function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const v = Math.abs(cents) / 100;
  return `${sign}$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtDate(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** Greedy word-wrap to a max pixel width for the given font/size. */
function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = (text ?? "").replace(/\s+/g, " ").trim().split(" ");
  if (words.length === 0 || words[0] === "") return [""];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN;
}

function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN + 40) newPage(ctx);
}

interface RenderInput {
  docType: "INVOICE" | "ESTIMATE";
  ref: string;
  status: string;
  clientName: string | null;
  clientEmail?: string | null;
  jobTitle?: string | null;
  propertyAddress?: string | null;
  dateLabel1: string;
  dateValue1: string | null;
  dateLabel2: string;
  dateValue2: string | null;
  lineItems: PdfLineItem[];
  totals: { label: string; value: string; strong?: boolean }[];
  notes?: string | null;
  footer: string;
}

async function renderDocument(input: RenderInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${input.docType} ${input.ref}`);
  doc.setProducer(BRAND);
  doc.setCreator(BRAND);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, page: doc.addPage([PAGE_W, PAGE_H]), font, bold, y: PAGE_H - MARGIN };

  const text = (s: string, x: number, y: number, size: number, f: PDFFont = font, color = INK) =>
    ctx.page.drawText(s, { x, y, size, font: f, color });
  const rightText = (s: string, rightX: number, y: number, size: number, f: PDFFont = font, color = INK) =>
    ctx.page.drawText(s, { x: rightX - f.widthOfTextAtSize(s, size), y, size, font: f, color });

  // --- Header ---------------------------------------------------------------
  text(BRAND, MARGIN, ctx.y, 20, bold, ACCENT);
  text(BRAND_URL, MARGIN, ctx.y - 16, 9, font, MUTED);

  const rightX = PAGE_W - MARGIN;
  rightText(input.docType, rightX, ctx.y, 20, bold, INK);
  rightText(`#${input.ref}`, rightX, ctx.y - 16, 10, font, MUTED);
  rightText(input.status.toUpperCase(), rightX, ctx.y - 30, 9, bold, ACCENT);

  ctx.y -= 46;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 1,
    color: RULE,
  });
  ctx.y -= 22;

  // --- Bill-to + meta -------------------------------------------------------
  const metaTop = ctx.y;
  text("BILL TO", MARGIN, ctx.y, 8, bold, MUTED);
  ctx.y -= 14;
  text(input.clientName ?? "—", MARGIN, ctx.y, 11, bold);
  ctx.y -= 14;
  if (input.propertyAddress) {
    text(input.propertyAddress, MARGIN, ctx.y, 10, font, MUTED);
    ctx.y -= 13;
  }
  if (input.clientEmail) {
    text(input.clientEmail, MARGIN, ctx.y, 10, font, MUTED);
    ctx.y -= 13;
  }
  if (input.jobTitle) {
    text(input.jobTitle, MARGIN, ctx.y, 10, font, MUTED);
    ctx.y -= 13;
  }

  // meta column (right)
  let my = metaTop;
  const metaLabelX = PAGE_W - MARGIN - 170;
  const drawMeta = (label: string, value: string | null) => {
    if (!value) return;
    text(label, metaLabelX, my, 9, bold, MUTED);
    rightText(value, rightX, my, 10, font, INK);
    my -= 15;
  };
  drawMeta(input.dateLabel1, input.dateValue1);
  drawMeta(input.dateLabel2, input.dateValue2);

  ctx.y = Math.min(ctx.y, my) - 18;

  // --- Line-item table ------------------------------------------------------
  const colDescX = MARGIN;
  const colQtyRight = MARGIN + CONTENT_W - 200;
  const colUnitRight = MARGIN + CONTENT_W - 100;
  const colAmtRight = PAGE_W - MARGIN;
  const descW = colQtyRight - colDescX - 70;

  const drawTableHeader = () => {
    text("DESCRIPTION", colDescX, ctx.y, 8, bold, MUTED);
    rightText("QTY", colQtyRight, ctx.y, 8, bold, MUTED);
    rightText("UNIT", colUnitRight, ctx.y, 8, bold, MUTED);
    rightText("AMOUNT", colAmtRight, ctx.y, 8, bold, MUTED);
    ctx.y -= 8;
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: PAGE_W - MARGIN, y: ctx.y },
      thickness: 0.75,
      color: RULE,
    });
    ctx.y -= 16;
  };
  drawTableHeader();

  for (const item of input.lineItems) {
    const lines = wrap(item.description || "—", font, 10, descW);
    const rowH = Math.max(lines.length * 13, 14) + 6;
    ensureSpace(ctx, rowH + 10);
    if (ctx.y === PAGE_H - MARGIN) drawTableHeader(); // redrew header on new page
    const rowTop = ctx.y;
    lines.forEach((ln, i) => text(ln, colDescX, rowTop - i * 13, 10));
    rightText(qty(item.quantity), colQtyRight, rowTop, 10);
    rightText(money(item.unitPriceCents), colUnitRight, rowTop, 10);
    rightText(money(item.totalCents), colAmtRight, rowTop, 10);
    ctx.y = rowTop - rowH;
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y + 6 },
      end: { x: PAGE_W - MARGIN, y: ctx.y + 6 },
      thickness: 0.4,
      color: rgb(0.92, 0.93, 0.95),
    });
  }

  if (input.lineItems.length === 0) {
    text("No line items recorded for this document.", colDescX, ctx.y, 10, font, MUTED);
    ctx.y -= 18;
  }

  // --- Totals ---------------------------------------------------------------
  ctx.y -= 10;
  ensureSpace(ctx, input.totals.length * 16 + 30);
  const totalsLabelX = PAGE_W - MARGIN - 200;
  for (const t of input.totals) {
    const f = t.strong ? bold : font;
    const size = t.strong ? 12 : 10;
    if (t.strong) {
      ctx.page.drawLine({
        start: { x: totalsLabelX, y: ctx.y + 12 },
        end: { x: PAGE_W - MARGIN, y: ctx.y + 12 },
        thickness: 0.75,
        color: RULE,
      });
    }
    text(t.label, totalsLabelX, ctx.y, size, f, t.strong ? INK : MUTED);
    rightText(t.value, colAmtRight, ctx.y, size, f, t.strong ? ACCENT : INK);
    ctx.y -= t.strong ? 20 : 16;
  }

  // --- Notes ----------------------------------------------------------------
  if (input.notes && input.notes.trim()) {
    ctx.y -= 14;
    ensureSpace(ctx, 60);
    text("NOTES", MARGIN, ctx.y, 8, bold, MUTED);
    ctx.y -= 14;
    for (const ln of wrap(input.notes.trim(), font, 10, CONTENT_W)) {
      ensureSpace(ctx, 16);
      text(ln, MARGIN, ctx.y, 10, font, INK);
      ctx.y -= 13;
    }
  }

  // --- Footer ---------------------------------------------------------------
  const footerLines = wrap(input.footer, font, 9, CONTENT_W);
  footerLines.forEach((ln, i) =>
    ctx.page.drawText(ln, {
      x: MARGIN,
      y: MARGIN - 6 - i * 11,
      size: 9,
      font,
      color: MUTED,
    }),
  );

  return doc.save();
}

export async function buildInvoicePdf(d: InvoicePdfData): Promise<Uint8Array> {
  const balance = d.totalCents - d.paidCents;
  const totals: RenderInput["totals"] = [
    { label: "Subtotal", value: money(d.subtotalCents) },
  ];
  if (d.taxCents && d.taxCents > 0) totals.push({ label: "Tax", value: money(d.taxCents) });
  totals.push({ label: "Total", value: money(d.totalCents) });
  if (d.paidCents > 0) totals.push({ label: "Paid", value: `-${money(d.paidCents)}` });
  totals.push({ label: "Balance Due", value: money(balance), strong: true });

  return renderDocument({
    docType: "INVOICE",
    ref: d.invoiceNumber,
    status: d.status,
    clientName: d.clientName,
    clientEmail: d.clientEmail,
    jobTitle: d.jobTitle,
    propertyAddress: d.propertyAddress,
    dateLabel1: "Issue Date",
    dateValue1: fmtDate(d.issueDate),
    dateLabel2: "Due Date",
    dateValue2: fmtDate(d.dueDate),
    lineItems: d.lineItems,
    totals,
    notes: d.notes,
    footer:
      "Thank you for your business. Please reference the invoice number with any payment. " +
      `Questions? Reply to this email or reach us at ${BRAND_URL}.`,
  });
}

export async function buildEstimatePdf(d: EstimatePdfData): Promise<Uint8Array> {
  const totals: RenderInput["totals"] = [
    { label: "Subtotal", value: money(d.subtotalCents) },
  ];
  if (d.taxCents && d.taxCents > 0) totals.push({ label: "Tax", value: money(d.taxCents) });
  totals.push({ label: "Total", value: money(d.totalCents), strong: true });
  if (d.depositCents && d.depositCents > 0) {
    totals.push({ label: "Deposit to Schedule", value: money(d.depositCents) });
  }

  return renderDocument({
    docType: "ESTIMATE",
    ref: d.estimateRef,
    status: d.status,
    clientName: d.clientName,
    clientEmail: d.clientEmail,
    jobTitle: d.jobTitle,
    propertyAddress: d.propertyAddress,
    dateLabel1: "Issued",
    dateValue1: fmtDate(d.issueDate),
    dateLabel2: "Valid Until",
    dateValue2: fmtDate(d.expiresDate),
    lineItems: d.lineItems,
    totals,
    notes: d.notes,
    footer:
      "This estimate is provided in good faith and may be adjusted if scope or conditions change. " +
      `Questions? Reply to this email or reach us at ${BRAND_URL}.`,
  });
}
