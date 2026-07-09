import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { queryOne } from "@/lib/db";
import { accountLogoDir, type CompanyProfileSettings } from "@/lib/company/branding";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const row = await queryOne<{ account_id: string; settings: CompanyProfileSettings }>(
    `SELECT i.account_id, a.settings
     FROM invoices i
     JOIN accounts a ON a.id = i.account_id
     WHERE i.share_token = $1`,
    [token],
  );
  if (!row?.settings?.logo_filename) {
    return new NextResponse(null, { status: 404 });
  }

  const filePath = path.join(accountLogoDir(row.account_id), path.basename(row.settings.logo_filename));
  if (!fs.existsSync(filePath)) {
    return new NextResponse(null, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : "image/jpeg";
  return new NextResponse(buffer, {
    status: 200,
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
  });
}