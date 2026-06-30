import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let _transporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter(): Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!,
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    });
  }
  return _transporter;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { ok: false, error: "Email not configured" };
  }
  try {
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER!;
    await getTransporter().sendMail({ from, ...opts });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}