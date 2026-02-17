import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const traceId = randomUUID();
  let dbStatus: "ok" | "error" | "unconfigured" = "unconfigured";

  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    try {
      // Dynamic import is build-safe: pg is only loaded at runtime when
      // DATABASE_URL is present, preventing build-time connection attempts.
      const { Client } = await import("pg");
      const client = new Client({ connectionString: databaseUrl });
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      dbStatus = "ok";
    } catch {
      dbStatus = "error";
    }
  }

  const healthy = dbStatus !== "error";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      service: "web",
      db: dbStatus,
      traceId,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
