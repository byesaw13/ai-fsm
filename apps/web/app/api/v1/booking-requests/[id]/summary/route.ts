import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { withRole } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db";
import { logger } from "@/lib/logger";
import { scoreJobFit } from "@ai-fsm/domain";
import { INTAKE_QUESTIONS, INTAKE_METADATA_LABELS } from "@/lib/intake/questions";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  general_repairs:     "General Repairs",
  plumbing:            "Plumbing",
  electrical:          "Electrical",
  carpentry_furniture: "Carpentry / Furniture",
  painting_finishes:   "Painting & Finishes",
  outdoor_seasonal:    "Outdoor / Seasonal",
  mounting_installs:   "Mounting & Installs",
  maintenance_small:   "Small Maintenance",
  specialty_expansion: "Specialty / Expansion",
};

const REFERRAL_LABELS: Record<string, string> = {
  online: "found online",
  friend_neighbor: "friend or neighbor referral",
  realtor: "realtor referral",
  repeat: "repeat client",
  other: "other",
};

type BookingRow = {
  id: string;
  name: string;
  service_category: string;
  service_description: string;
  preferred_date: string;
  address: string;
  city: string | null;
  routing_path: string | null;
  walkthrough_score: number | null;
  referral_source: string | null;
  referral_name: string | null;
  intake_metadata: Record<string, string> | null;
};

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const { id } = await (request as NextRequest & { params?: Promise<{ id: string }> })
    .json().catch(() => ({})) as { id?: string };

  // id comes from the URL path, not the body
  const pathId = request.nextUrl.pathname.split("/").at(-2);
  if (!pathId) {
    return NextResponse.json({ error: { message: "Missing booking request ID" } }, { status: 400 });
  }

  const br = await queryOne<BookingRow>(
    `SELECT id, name, service_category, service_description, preferred_date,
            address, city, routing_path, walkthrough_score,
            referral_source, referral_name, intake_metadata
     FROM booking_requests
     WHERE id = $1 AND account_id = $2`,
    [pathId, session.accountId]
  );

  if (!br) {
    return NextResponse.json({ error: { message: "Not found" } }, { status: 404 });
  }

  const fit = scoreJobFit({
    service_category: br.service_category,
    referral_source: br.referral_source,
    intake_metadata: br.intake_metadata,
    walkthrough_score: br.walkthrough_score,
  });

  const metadataLines = br.intake_metadata
    ? INTAKE_QUESTIONS[br.service_category]
        ?.filter((q) => br.intake_metadata![q.key])
        .map((q) => `- ${q.label} ${INTAKE_METADATA_LABELS[q.key]?.[br.intake_metadata![q.key]] ?? br.intake_metadata![q.key]}`)
        .join("\n") ?? ""
    : "";

  const location = [br.address, br.city].filter(Boolean).join(", ");

  const prompt = `Summarize this service intake for a handyman business owner reviewing their queue. Write 2–3 sentences. Be direct and practical — what is the job, what should they know, and what is the recommended next step.

Client: ${br.name}
Category: ${CATEGORY_LABELS[br.service_category] ?? br.service_category}
Description: ${br.service_description}
Location: ${location}
Preferred date: ${br.preferred_date}
${br.referral_source ? `Referral: ${REFERRAL_LABELS[br.referral_source] ?? br.referral_source}${br.referral_name ? ` (${br.referral_name})` : ""}` : ""}
${metadataLines ? `Details:\n${metadataLines}` : ""}
Routing recommendation: ${br.routing_path === "site_visit" ? "site visit recommended before estimating" : br.routing_path === "remote_estimate" ? "can proceed to remote estimate" : "pending"}
Job fit score: ${fit.score}/100 (${fit.label})${fit.reasons.length ? ` — ${fit.reasons.slice(0, 2).join(", ")}` : ""}

Write the summary now:`;

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const summary = (message.content[0] as { type: string; text: string }).text?.trim() ?? "";
    return NextResponse.json({ summary }, { status: 200 });
  } catch (err) {
    logger.error("POST /api/v1/booking-requests/[id]/summary error", err as Error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { message: "Failed to generate summary" } },
      { status: 500 }
    );
  }
});
