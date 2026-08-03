import { describe, expect, it } from "vitest";
import {
  readWorkspaceModeCookie,
  resolvePostLoginHref,
} from "../post-login-destination";

describe("resolvePostLoginHref", () => {
  it("sends tech to My Work", () => {
    expect(resolvePostLoginHref("tech", { isPhone: false })).toBe("/app/my-work");
    expect(resolvePostLoginHref("tech", { isPhone: true })).toBe("/app/my-work");
  });

  it("sends admin to Overview", () => {
    expect(resolvePostLoginHref("admin", { isPhone: true })).toBe("/app");
  });

  it("sends desktop owner (auto) to Overview", () => {
    expect(resolvePostLoginHref("owner", { isPhone: false })).toBe("/app");
  });

  it("sends phone owner (auto) to My Work", () => {
    expect(resolvePostLoginHref("owner", { isPhone: true })).toBe("/app/my-work");
  });

  it("honors dv_ws_mode=field cookie for owner on desktop", () => {
    expect(
      resolvePostLoginHref("owner", {
        isPhone: false,
        cookieHeader: "other=1; dv_ws_mode=field",
      }),
    ).toBe("/app/my-work");
  });

  it("honors dv_ws_mode=office cookie for owner on phone", () => {
    expect(
      resolvePostLoginHref("owner", {
        isPhone: true,
        cookieHeader: "dv_ws_mode=office",
      }),
    ).toBe("/app");
  });
});

describe("readWorkspaceModeCookie", () => {
  it("returns null for missing or invalid values", () => {
    expect(readWorkspaceModeCookie(null)).toBeNull();
    expect(readWorkspaceModeCookie("foo=bar")).toBeNull();
    expect(readWorkspaceModeCookie("dv_ws_mode=auto")).toBeNull();
  });
});
