import { logger } from "@/lib/logger";

export type SiteRebuild = "queued" | "not_configured" | "failed";

/**
 * Ask GitHub to rebuild mydovetails.com (a repository_dispatch the site's
 * deploy workflow listens for). Off unless SITE_REBUILD_GITHUB_TOKEN is set:
 * a fine-grained token on the site repo with Contents read/write.
 */
export async function triggerSiteRebuild(fetchImpl: typeof fetch = fetch): Promise<SiteRebuild> {
  const token = process.env.SITE_REBUILD_GITHUB_TOKEN;
  if (!token) return "not_configured";
  const repo = process.env.SITE_REBUILD_REPO || "byesaw13/mydovetails-site";
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_type: "business-card-updated" }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return "queued";
    logger.warn("Site rebuild dispatch rejected", { status: res.status });
    return "failed";
  } catch (error) {
    logger.error("Site rebuild dispatch failed", error);
    return "failed";
  }
}
