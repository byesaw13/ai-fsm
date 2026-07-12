/**
 * Server-side PDF generation for client-facing documents (invoices & estimates).
 *
 * Uses pdf-lib (pure JS, no native deps, no font files on disk) so it runs
 * cleanly inside the Next.js server runtime and on the garonhome mini PC.
 *
 * Layout mirrors the HTML print pages (Forest & Cedar): serif body, branded
 * letterhead with forest accent rule, Bill To + Service Location columns,
 * section headers, line-item table, totals, notes, and payment/estimate terms.
 */
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from "pdf-lib";
import { DOCUMENT_STANDARD_VERSION } from "@ai-fsm/domain";

const DEFAULT_BRAND = "Dovetails Services LLC";
const DEFAULT_BRAND_URL = "mydovetails.com";

const PAGE_W = 612; // US Letter @ 72dpi
const PAGE_H = 792;
/** ~0.75" margins — matches HTML print page breathing room. */
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Forest & Cedar identity (tokens.css): deep forest accent + warm stone neutrals.
const INK = rgb(0.11, 0.1, 0.09); // slate-900 #1c1917
const MUTED = rgb(0.34, 0.33, 0.31); // stone-600 #57534e (print meta-label)
const MUTED_SOFT = rgb(0.47, 0.44, 0.42); // slate-500 #78716c (footer)
const RULE_STRONG = rgb(0.16, 0.15, 0.14); // near ink for table header/totals
const ACCENT = rgb(0.086, 0.396, 0.204); // forest-800 #166534
const ROW_RULE = rgb(0.91, 0.9, 0.89); // slate-200-ish
const PAID_RED = rgb(0.725, 0.11, 0.11); // #b91c1c — matches PaidStamp

export interface PdfLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface EstimateOptionGroup {
  label: string;
  description?: string | null;
  isRecommended: boolean;
  totalCents: number;
  lineItems: PdfLineItem[];
}

/** Optional company branding so the PDF matches Settings / print letterhead. */
export interface PdfBranding {
  name?: string | null;
  tagline?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  /** Absolute path to a PNG/JPEG logo on disk. */
  logoPath?: string | null;
  invoiceTerms?: string | null;
  estimateTerms?: string | null;
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
  paidAt?: string | Date | null;
  subtotalCents: number;
  taxCents?: number | null;
  totalCents: number;
  paidCents: number;
  notes?: string | null;
  lineItems: PdfLineItem[];
  branding?: PdfBranding | null;
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
  /** When set (multi_option estimates), render priced option sections instead
   *  of a flat line-item table + parent total. */
  options?: EstimateOptionGroup[];
  branding?: PdfBranding | null;
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

function fmtPaidStampDate(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Strip internal markers customers should not see. */
function cleanDescription(text: string): string {
  return (text ?? "")
    .replace(/<!--travel-charge-->/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

/**
 * Word-wrap preserving intentional newlines (e.g. travel title + description).
 * Flatten only runs of spaces/tabs within each paragraph.
 */
function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const cleaned = cleanDescription(text);
  if (!cleaned) return [""];
  const paragraphs = cleaned.split("\n");
  const out: string[] = [];
  for (const para of paragraphs) {
    const words = para.replace(/[ \t]+/g, " ").trim().split(" ");
    if (words.length === 0 || words[0] === "") {
      out.push("");
      continue;
    }
    let cur = "";
    for (const w of words) {
      const candidate = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) > maxW && cur) {
        out.push(cur);
        cur = w;
      } else {
        cur = candidate;
      }
    }
    if (cur) out.push(cur);
  }
  return out.length ? out : [""];
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
  if (ctx.y - needed < MARGIN + 48) newPage(ctx);
}

interface RenderInput {
  docType: "Invoice" | "Estimate";
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
  optionGroups?: EstimateOptionGroup[];
  notes?: string | null;
  /** Body section (Payment Terms / Estimate Terms) — matches HTML print. */
  terms?: string | null;
  termsTitle?: string;
  footer: string;
  branding?: PdfBranding | null;
  /** When true, draw a red PAID stamp (invoices only). */
  isPaid?: boolean;
  paidAt?: string | Date | null;
}

async function renderDocument(input: RenderInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${input.docType} ${input.ref}`);
  const producer = input.branding?.name?.trim() || DEFAULT_BRAND;
  doc.setProducer(producer);
  doc.setCreator(producer);

  // Times-Roman ≈ Georgia / Times New Roman used on the HTML print page.
  // Helvetica made downloads feel "more basic" next to the serif print preview.
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const ctx: Ctx = { doc, page: doc.addPage([PAGE_W, PAGE_H]), font, bold, y: PAGE_H - MARGIN };

  const text = (s: string, x: number, y: number, size: number, f: PDFFont = font, color = INK) =>
    ctx.page.drawText(s, { x, y, size, font: f, color });
  const rightText = (s: string, rightX: number, y: number, size: number, f: PDFFont = font, color = INK) =>
    ctx.page.drawText(s, { x: rightX - f.widthOfTextAtSize(s, size), y, size, font: f, color });

  // --- Header (account branding when provided) ------------------------------
  const brandName = input.branding?.name?.trim() || DEFAULT_BRAND;
  const brandUrl = (input.branding?.website?.trim() || DEFAULT_BRAND_URL).replace(/^https?:\/\//, "");
  const brandTagline = input.branding?.tagline?.trim() || null;
  const brandContact: string[] = [];
  if (input.branding?.address) {
    brandContact.push(
      ...input.branding.address.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    );
  }
  if (input.branding?.phone) brandContact.push(input.branding.phone);
  if (input.branding?.email) brandContact.push(input.branding.email);

  // Optional logo (PNG/JPG) — left of company name when present
  let headerLeft = MARGIN;
  let logoBottom = ctx.y;
  if (input.branding?.logoPath) {
    try {
      const fs = await import("fs");
      const bytes = fs.readFileSync(input.branding.logoPath);
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
      const img = isPng ? await ctx.doc.embedPng(bytes) : await ctx.doc.embedJpg(bytes);
      const maxH = 48;
      const maxW = 140;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.page.drawImage(img, {
        x: MARGIN,
        y: ctx.y - h + 10,
        width: w,
        height: h,
      });
      headerLeft = MARGIN + w + 14;
      logoBottom = ctx.y - h + 10;
    } catch {
      /* logo optional — fall back to text brand */
    }
  }

  text(brandName, headerLeft, ctx.y, 16, bold, ACCENT);
  let headerY = ctx.y - 15;
  if (brandTagline) {
    text(brandTagline, headerLeft, headerY, 9, font, MUTED);
    headerY -= 13;
  }
  text(brandUrl, headerLeft, headerY, 9, font, MUTED);
  headerY -= 13;
  for (const line of brandContact.slice(0, 3)) {
    text(line, headerLeft, headerY, 8, font, MUTED);
    headerY -= 11;
  }

  const rightX = PAGE_W - MARGIN;
  // Title case to match HTML print ("Invoice" / "Estimate")
  rightText(input.docType, rightX, ctx.y, 22, bold, INK);
  rightText(input.ref, rightX, ctx.y - 18, 10, font, MUTED);
  rightText(`Document standard: ${DOCUMENT_STANDARD_VERSION}`, rightX, ctx.y - 32, 8, font, MUTED);
  let metaY = ctx.y - 46;
  if (input.dateValue1) {
    rightText(`${input.dateLabel1}: ${input.dateValue1}`, rightX, metaY, 9, font, MUTED);
    metaY -= 13;
  }
  if (input.dateValue2) {
    rightText(`${input.dateLabel2}: ${input.dateValue2}`, rightX, metaY, 9, font, MUTED);
    metaY -= 13;
  }
  rightText(input.status.toUpperCase(), rightX, metaY, 9, bold, ACCENT);
  metaY -= 4;

  ctx.y = Math.min(headerY, metaY, logoBottom) - 14;
  // Accent rule under letterhead (matches print-page .header-row border)
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 1.5,
    color: ACCENT,
  });
  ctx.y -= 28;

  // --- PAID stamp (matches HTML PaidStamp) ----------------------------------
  if (input.isPaid) {
    drawPaidStamp(ctx, input.paidAt);
  }

  // --- Bill To + Service Location (two columns, like print .bill-row) -------
  const colMid = MARGIN + CONTENT_W / 2 + 12;
  const colW = CONTENT_W / 2 - 20;
  const billTop = ctx.y;

  // Left: Bill To
  text("BILL TO", MARGIN, billTop, 9, bold, ACCENT);
  ctx.page.drawLine({
    start: { x: MARGIN, y: billTop - 4 },
    end: { x: MARGIN + colW, y: billTop - 4 },
    thickness: 1.2,
    color: ACCENT,
  });
  let leftY = billTop - 20;
  text(input.clientName ?? "—", MARGIN, leftY, 11, bold);
  leftY -= 15;
  if (input.clientEmail) {
    text(input.clientEmail, MARGIN, leftY, 10, font, MUTED);
    leftY -= 14;
  }

  // Right: Service Location
  text("SERVICE LOCATION", colMid, billTop, 9, bold, ACCENT);
  ctx.page.drawLine({
    start: { x: colMid, y: billTop - 4 },
    end: { x: colMid + colW, y: billTop - 4 },
    thickness: 1.2,
    color: ACCENT,
  });
  let rightColY = billTop - 20;
  const loc = (input.propertyAddress ?? "Address not on file").trim() || "Address not on file";
  for (const ln of wrap(loc, font, 10, colW)) {
    text(ln, colMid, rightColY, 10);
    rightColY -= 14;
  }

  ctx.y = Math.min(leftY, rightColY) - 18;

  // --- Job section ----------------------------------------------------------
  if (input.jobTitle && input.jobTitle.trim()) {
    ensureSpace(ctx, 40);
    drawSectionHeader(ctx, "JOB");
    for (const ln of wrap(input.jobTitle.trim(), font, 11, CONTENT_W)) {
      ensureSpace(ctx, 16);
      text(ln, MARGIN, ctx.y, 11);
      ctx.y -= 15;
    }
    ctx.y -= 8;
  }

  // --- Line-item table ------------------------------------------------------
  const colDescX = MARGIN;
  const colQtyRight = MARGIN + CONTENT_W - 200;
  const colUnitRight = MARGIN + CONTENT_W - 100;
  const colAmtRight = PAGE_W - MARGIN;
  const descW = colQtyRight - colDescX - 70;
  const totalsLabelX = PAGE_W - MARGIN - 200;

  const drawTableHeader = () => {
    text("DESCRIPTION", colDescX, ctx.y, 8, bold, MUTED);
    rightText("QTY", colQtyRight, ctx.y, 8, bold, MUTED);
    rightText("UNIT PRICE", colUnitRight, ctx.y, 8, bold, MUTED);
    rightText("TOTAL", colAmtRight, ctx.y, 8, bold, MUTED);
    ctx.y -= 8;
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: PAGE_W - MARGIN, y: ctx.y },
      thickness: 1.5,
      color: RULE_STRONG,
    });
    ctx.y -= 16;
  };

  const drawRows = (items: PdfLineItem[]) => {
    for (const item of items) {
      const lines = wrap(item.description || "—", font, 10, descW);
      const rowH = Math.max(lines.length * 13, 14) + 8;
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
        color: ROW_RULE,
      });
    }
    if (items.length === 0) {
      text("No line items recorded.", colDescX, ctx.y, 10, font, MUTED);
      ctx.y -= 18;
    }
  };

  const drawTotals = (totals: RenderInput["totals"]) => {
    ctx.y -= 10;
    ensureSpace(ctx, totals.length * 18 + 30);
    // Top rule under line items (print tfoot border-top)
    ctx.page.drawLine({
      start: { x: totalsLabelX, y: ctx.y + 14 },
      end: { x: PAGE_W - MARGIN, y: ctx.y + 14 },
      thickness: 1.5,
      color: RULE_STRONG,
    });
    for (const t of totals) {
      const f = t.strong ? bold : font;
      const size = t.strong ? 12 : 10;
      text(t.label, totalsLabelX, ctx.y, size, f, t.strong ? ACCENT : MUTED);
      rightText(t.value, colAmtRight, ctx.y, size, f, t.strong ? ACCENT : INK);
      ctx.y -= t.strong ? 20 : 16;
    }
  };

  if (input.optionGroups && input.optionGroups.length > 0) {
    // Multi-option estimate: render each option as its own priced section.
    input.optionGroups.forEach((group, gi) => {
      ensureSpace(ctx, 70);
      if (gi > 0) ctx.y -= 6;
      text(`OPTION ${gi + 1}: ${group.label}`, MARGIN, ctx.y, 12, bold, ACCENT);
      if (group.isRecommended) rightText("RECOMMENDED", colAmtRight, ctx.y, 9, bold, ACCENT);
      ctx.y -= 18;
      if (group.description && group.description.trim()) {
        for (const ln of wrap(group.description.trim(), font, 9, CONTENT_W)) {
          ensureSpace(ctx, 14);
          text(ln, MARGIN, ctx.y, 9, font, MUTED);
          ctx.y -= 12;
        }
        ctx.y -= 4;
      }
      drawTableHeader();
      drawRows(group.lineItems);
      ctx.y -= 4;
      ctx.page.drawLine({
        start: { x: totalsLabelX, y: ctx.y + 12 },
        end: { x: PAGE_W - MARGIN, y: ctx.y + 12 },
        thickness: 1.5,
        color: RULE_STRONG,
      });
      text(`Option ${gi + 1} total`, totalsLabelX, ctx.y, 11, bold, INK);
      rightText(money(group.totalCents), colAmtRight, ctx.y, 11, bold, ACCENT);
      ctx.y -= 22;
    });
  } else {
    ensureSpace(ctx, 50);
    drawSectionHeader(ctx, "LINE ITEMS");
    drawTableHeader();
    drawRows(input.lineItems);
    drawTotals(input.totals);
  }

  // --- Notes ----------------------------------------------------------------
  if (input.notes && input.notes.trim()) {
    ctx.y -= 14;
    ensureSpace(ctx, 60);
    drawSectionHeader(ctx, "NOTES");
    for (const ln of wrap(input.notes.trim(), font, 10, CONTENT_W)) {
      ensureSpace(ctx, 16);
      text(ln, MARGIN, ctx.y, 10, font, INK);
      ctx.y -= 14;
    }
  }

  // --- Payment / Estimate Terms (body section, not just footer) -------------
  if (input.terms && input.terms.trim()) {
    ctx.y -= 14;
    ensureSpace(ctx, 60);
    drawSectionHeader(ctx, input.termsTitle ?? "PAYMENT TERMS");
    for (const ln of wrap(input.terms.trim(), font, 10, CONTENT_W)) {
      ensureSpace(ctx, 16);
      text(ln, MARGIN, ctx.y, 10, font, INK);
      ctx.y -= 14;
    }
  }

  // --- Footer thanks (bottom of last page) ----------------------------------
  const footerLines = wrap(input.footer, font, 9, CONTENT_W);
  // If content would collide with footer, push to a new page
  const footerBlockH = footerLines.length * 11 + 8;
  if (ctx.y < MARGIN + footerBlockH + 20) newPage(ctx);
  footerLines.forEach((ln, i) =>
    ctx.page.drawText(ln, {
      x: MARGIN,
      y: MARGIN - 4 - i * 11,
      size: 9,
      font,
      color: MUTED_SOFT,
    }),
  );

  return doc.save();
}

/** Section title + forest underline — matches print h2. */
function drawSectionHeader(ctx: Ctx, title: string): void {
  ctx.page.drawText(title, {
    x: MARGIN,
    y: ctx.y,
    size: 10,
    font: ctx.bold,
    color: ACCENT,
  });
  ctx.y -= 6;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 1.2,
    color: ACCENT,
  });
  ctx.y -= 16;
}

/** Red PAID stamp — same angle/color as the HTML PaidStamp component. */
function drawPaidStamp(ctx: Ctx, paidAt?: string | Date | null): void {
  const stampDate = fmtPaidStampDate(paidAt);
  const cx = PAGE_W - MARGIN - 70;
  const cy = PAGE_H - MARGIN - 130;
  const rot = degrees(-14);
  const page = ctx.page;

  const label = "PAID";
  const size = 36;
  const labelW = ctx.bold.widthOfTextAtSize(label, size);

  const boxW = 110;
  const boxH = stampDate ? 48 : 36;
  page.drawRectangle({
    x: cx - boxW / 2,
    y: cy - 14,
    width: boxW,
    height: boxH,
    borderColor: PAID_RED,
    borderWidth: 3,
    borderOpacity: 0.85,
    rotate: rot,
  });

  page.drawText(label, {
    x: cx - labelW / 2,
    y: cy,
    size,
    font: ctx.bold,
    color: PAID_RED,
    opacity: 0.88,
    rotate: rot,
  });

  if (stampDate) {
    const dSize = 9;
    const dW = ctx.bold.widthOfTextAtSize(stampDate, dSize);
    page.drawText(stampDate, {
      x: cx - dW / 2,
      y: cy - 12,
      size: dSize,
      font: ctx.bold,
      color: PAID_RED,
      opacity: 0.88,
      rotate: rot,
    });
  }
}

export async function buildInvoicePdf(d: InvoicePdfData): Promise<Uint8Array> {
  const balance = d.totalCents - d.paidCents;
  const totals: RenderInput["totals"] = [
    { label: "Subtotal", value: money(d.subtotalCents) },
  ];
  if (d.taxCents && d.taxCents > 0) totals.push({ label: "Tax", value: money(d.taxCents) });
  totals.push({ label: "Total", value: money(d.totalCents), strong: true });
  if (d.paidCents > 0) totals.push({ label: "Paid", value: `-${money(d.paidCents)}` });
  totals.push({ label: "Balance Due", value: money(balance), strong: true });

  const terms =
    d.branding?.invoiceTerms?.trim() ||
    "Payment is due upon completion (the listed due date) unless alternate terms are agreed in writing.";
  const footer =
    `Thank you for your business. Please reference ${d.invoiceNumber} with any payment.`;

  const isPaid =
    d.status === "paid" ||
    (d.totalCents > 0 && d.paidCents >= d.totalCents);

  return renderDocument({
    docType: "Invoice",
    ref: d.invoiceNumber,
    status: d.status,
    clientName: d.clientName,
    clientEmail: d.clientEmail,
    jobTitle: d.jobTitle,
    propertyAddress: d.propertyAddress,
    dateLabel1: "Issued",
    dateValue1: fmtDate(d.issueDate),
    dateLabel2: "Due",
    dateValue2: fmtDate(d.dueDate),
    lineItems: d.lineItems,
    totals,
    notes: d.notes,
    terms,
    termsTitle: "PAYMENT TERMS",
    footer,
    branding: d.branding,
    isPaid,
    paidAt: d.paidAt,
  });
}

export async function buildEstimatePdf(d: EstimatePdfData): Promise<Uint8Array> {
  const multiOption = !!(d.options && d.options.length > 0);
  const totals: RenderInput["totals"] = [
    { label: "Subtotal", value: money(d.subtotalCents) },
  ];
  if (d.taxCents && d.taxCents > 0) totals.push({ label: "Tax", value: money(d.taxCents) });
  totals.push({ label: "Total", value: money(d.totalCents), strong: true });
  if (d.depositCents && d.depositCents > 0) {
    totals.push({ label: "Deposit due", value: money(d.depositCents), strong: true });
  }

  const site = (d.branding?.website?.trim() || DEFAULT_BRAND_URL).replace(/^https?:\/\//, "");
  const terms =
    d.branding?.estimateTerms?.trim() ||
    "This estimate is provided in good faith and may be adjusted if scope or conditions change.";
  const footer = `Questions? Reach us at ${site}. Thank you for considering us.`;

  return renderDocument({
    optionGroups: multiOption ? d.options : undefined,
    docType: "Estimate",
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
    terms,
    termsTitle: "ESTIMATE TERMS",
    footer,
    branding: d.branding,
  });
}
