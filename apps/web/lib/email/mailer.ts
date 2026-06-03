import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let _transporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function getTransporter(): Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!,
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    });
  }
  return _transporter;
}

export interface EmailAttachment {
  /** Filename shown to the recipient, e.g. "Invoice-123.pdf". */
  filename: string;
  /** Raw file bytes. */
  content: Buffer | Uint8Array;
  /** MIME type, e.g. "application/pdf". Defaults to application/octet-stream. */
  contentType?: string;
}

export interface SendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Optional file attachments (combined size should stay well under 25MB). */
  attachments?: EmailAttachment[];
}

export async function sendEmail(opts: SendOptions): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { ok: false, error: "Email not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing)" };
  }
  try {
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER!;
    const { attachments, ...rest } = opts;
    await getTransporter().sendMail({
      from,
      ...rest,
      ...(attachments && attachments.length
        ? {
            attachments: attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
              contentType: a.contentType ?? "application/octet-stream",
            })),
          }
        : {}),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
