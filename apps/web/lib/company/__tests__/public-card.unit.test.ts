import { describe, it, expect, vi, afterEach } from "vitest";
import { publicCardSettingsSchema, resolvePublicCard, toE164 } from "../public-card";
import { triggerSiteRebuild } from "../site-rebuild";

describe("toE164", () => {
  it("accepts 10- and 11-digit US numbers in any format", () => {
    expect(toE164("(603) 479-1094")).toBe("+16034791094");
    expect(toE164("603.479.1094")).toBe("+16034791094");
    expect(toE164("+1 603 479 1094")).toBe("+16034791094");
  });
  it("rejects anything else", () => {
    expect(toE164("479-1094")).toBeNull();
    expect(toE164("")).toBeNull();
  });
});

describe("resolvePublicCard", () => {
  it("falls back to what the site showed before when nothing is saved", () => {
    const card = resolvePublicCard(null);
    expect(card.nickname).toBe("Nick");
    expect(card.phoneE164).toBe("+16034791094");
    expect(card.badges).toEqual(["Free estimates", "Insured"]);
  });

  it("uses saved values, trimmed", () => {
    const card = resolvePublicCard({
      card_nickname: "  Nicky ",
      company_phone: "603-555-0100",
      company_email: "nick@example.com",
      card_badges: [" Licensed ", ""],
    });
    expect(card.nickname).toBe("Nicky");
    expect(card.phoneDisplay).toBe("603-555-0100");
    expect(card.phoneE164).toBe("+16035550100");
    expect(card.email).toBe("nick@example.com");
    expect(card.badges).toEqual(["Licensed"]);
  });

  it("keeps an emptied badge list empty", () => {
    expect(resolvePublicCard({ card_badges: [] }).badges).toEqual([]);
  });

  it("never publishes a phone the call button can't dial", () => {
    const card = resolvePublicCard({ company_phone: "call the office" });
    expect(card.phoneDisplay).toBe("(603) 479-1094");
    expect(card.phoneE164).toBe("+16034791094");
  });

  it("does not expose other account settings", () => {
    const card = resolvePublicCard({ invoice_terms: "secret" } as never);
    expect(JSON.stringify(card)).not.toContain("secret");
  });
});

describe("publicCardSettingsSchema", () => {
  it("caps badges at three", () => {
    expect(publicCardSettingsSchema.safeParse({ card_badges: ["a", "b", "c", "d"] }).success).toBe(false);
  });
});

describe("triggerSiteRebuild", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does nothing without a token", async () => {
    vi.stubEnv("SITE_REBUILD_GITHUB_TOKEN", "");
    const fetchImpl = vi.fn();
    expect(await triggerSiteRebuild(fetchImpl as never)).toBe("not_configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends a repository_dispatch to the site repo", async () => {
    vi.stubEnv("SITE_REBUILD_GITHUB_TOKEN", "tok");
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    expect(await triggerSiteRebuild(fetchImpl as never)).toBe("queued");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/byesaw13/mydovetails-site/dispatches");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ event_type: "business-card-updated" });
  });

  it("reports a rejected or failed dispatch", async () => {
    vi.stubEnv("SITE_REBUILD_GITHUB_TOKEN", "tok");
    expect(await triggerSiteRebuild(vi.fn().mockResolvedValue({ ok: false, status: 401 }) as never)).toBe("failed");
    expect(await triggerSiteRebuild(vi.fn().mockRejectedValue(new Error("offline")) as never)).toBe("failed");
  });
});
