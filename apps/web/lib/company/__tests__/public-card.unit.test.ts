import { describe, it, expect, vi, afterEach } from "vitest";
import { publicCardSettingsSchema, resolvePublicCard, toE164, type PublicCard } from "../public-card";
import { businessCardDocument, triggerSiteRebuild } from "../site-rebuild";

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
    expect(card.phoneDisplay).toBe("(603) 555-0100");
    expect(card.phoneE164).toBe("+16035550100");
    expect(card.email).toBe("nick@example.com");
    expect(card.badges).toEqual(["Licensed"]);
  });

  it("formats the phone the same way however it was typed", () => {
    expect(resolvePublicCard({ company_phone: "6034791094" }).phoneDisplay).toBe("(603) 479-1094");
  });

  it("uses the business email on the card unless the card has its own", () => {
    expect(resolvePublicCard({ company_email: "hello@example.com" }).cardEmail).toBe("hello@example.com");
    const card = resolvePublicCard({ company_email: "hello@example.com", card_email: " nick@example.com " });
    expect(card.email).toBe("hello@example.com");
    expect(card.cardEmail).toBe("nick@example.com");
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

const card: PublicCard = resolvePublicCard({
  company_email: "sales@example.com",
  card_email: "nick@example.com",
});

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("triggerSiteRebuild", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does nothing without a token", async () => {
    vi.stubEnv("SITE_REBUILD_GITHUB_TOKEN", "");
    const fetchImpl = vi.fn();
    expect(await triggerSiteRebuild(card, fetchImpl as never)).toBe("not_configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("commits the card file when master does not have it yet", async () => {
    vi.stubEnv("SITE_REBUILD_GITHUB_TOKEN", "tok");
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({}, 201));
    expect(await triggerSiteRebuild(card, fetchImpl as never)).toBe("queued");
    const [url, init] = fetchImpl.mock.calls[1];
    expect(url).toBe("https://api.github.com/repos/byesaw13/mydovetails-site/contents/src/data/business-card.json");
    expect(init.method).toBe("PUT");
    expect(init.headers.Authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body);
    expect(body.branch).toBe("master");
    expect(body.sha).toBeUndefined();
    expect(Buffer.from(body.content, "base64").toString("utf8")).toBe(businessCardDocument(card));
  });

  it("does not commit when the file already matches", async () => {
    vi.stubEnv("SITE_REBUILD_GITHUB_TOKEN", "tok");
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({
      sha: "abc",
      content: Buffer.from(businessCardDocument(card)).toString("base64"),
    }));
    expect(await triggerSiteRebuild(card, fetchImpl as never)).toBe("unchanged");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports a rejected read or a failed publish", async () => {
    vi.stubEnv("SITE_REBUILD_GITHUB_TOKEN", "tok");
    expect(await triggerSiteRebuild(card, vi.fn().mockResolvedValue(jsonResponse({}, 401)) as never)).toBe("failed");
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({}, 422));
    expect(await triggerSiteRebuild(card, fetchImpl as never)).toBe("failed");
    expect(await triggerSiteRebuild(card, vi.fn().mockRejectedValue(new Error("offline")) as never)).toBe("failed");
  });
});
