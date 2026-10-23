import { logger } from "@/lib/logger";
import type { PublicCard } from "./public-card";

export type SiteRebuild = "queued" | "unchanged" | "not_configured" | "failed";

/** File the site build reads. GitHub Actions gets HTTP 403 from Cloudflare on the app. */
export const BUSINESS_CARD_PATH = "src/data/business-card.json";

/** Same bytes every time, so an unchanged card does not commit. */
export function businessCardDocument(card: PublicCard): string {
  return `${JSON.stringify(card, null, "\t")}\n`;
}

/**
 * Commit the public card onto mydovetails-site master. That push runs the
 * existing Pages deploy. Off unless SITE_REBUILD_GITHUB_TOKEN is set: a
 * fine-grained token on the site repo with Contents read/write.
 */
export async function triggerSiteRebuild(
  card: PublicCard,
  fetchImpl: typeof fetch = fetch,
): Promise<SiteRebuild> {
  const token = process.env.SITE_REBUILD_GITHUB_TOKEN?.trim();
  if (!token) return "not_configured";
  const repo = process.env.SITE_REBUILD_REPO || "byesaw13/mydovetails-site";
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const document = businessCardDocument(card);
  try {
    const current = await fetchImpl(
      `https://api.github.com/repos/${repo}/contents/${BUSINESS_CARD_PATH}?ref=master`,
      { headers, signal: AbortSignal.timeout(8000) },
    );
    let sha: string | undefined;
    if (current.ok) {
      const body = (await current.json()) as { sha?: string; content?: string };
      sha = body.sha;
      const existing = Buffer.from((body.content ?? "").replace(/\n/g, ""), "base64").toString("utf8");
      if (existing === document) return "unchanged";
    } else if (current.status !== 404) {
      logger.warn("Site card read rejected", { status: current.status });
      return "failed";
    }

    const put = await fetchImpl(`https://api.github.com/repos/${repo}/contents/${BUSINESS_CARD_PATH}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: "Update the public business card",
        content: Buffer.from(document).toString("base64"),
        branch: "master",
        ...(sha ? { sha } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (put.ok) return "queued";
    logger.warn("Site card publish rejected", { status: put.status });
    return "failed";
  } catch (error) {
    logger.error("Site card publish failed", error);
    return "failed";
  }
}
