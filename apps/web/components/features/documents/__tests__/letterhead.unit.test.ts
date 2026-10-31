import { describe, it, expect } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ResolvedCompanyBranding } from "@/lib/company/branding";

// The component is compiled with the classic JSX runtime under vitest.
(globalThis as { React?: typeof React }).React = React;

import { Letterhead } from "../Letterhead";

const BRANDING: ResolvedCompanyBranding = {
  name: "Dovetails Home Services", tagline: "Fully Insured", address: null, phone: "(603) 479-1094",
  email: "hello@mydovetails.com", website: "mydovetails.com", invoiceTerms: "", estimateTerms: "",
  depositPercent: 0, depositTerms: "", logoPath: "/x/logo.png", logoIsWordmark: true,
};

describe("Letterhead (TASK-226)", () => {
  it("a wordmark logo replaces the name line; contact lines follow", () => {
    const html = renderToStaticMarkup(createElement(Letterhead, { branding: BRANDING, logoSrc: "/api/v1/account/logo?t=new.png" }));
    expect(html).toContain('alt="Dovetails Home Services"');
    expect(html).not.toContain(">Dovetails Home Services<");
    expect(html).toContain("(603) 479-1094");
    expect(html).toContain("mydovetails.com");
  });

  it("without a logo, the name is printed", () => {
    const html = renderToStaticMarkup(createElement(Letterhead, { branding: { ...BRANDING, logoPath: null }, logoSrc: null }));
    expect(html).toContain(">Dovetails Home Services<");
  });

  it("prints an address only when one is set", () => {
    const html = renderToStaticMarkup(createElement(Letterhead, { branding: { ...BRANDING, address: "84 Broadway" }, logoSrc: null }));
    expect(html).toContain("84 Broadway");
    expect(renderToStaticMarkup(createElement(Letterhead, { branding: BRANDING, logoSrc: null }))).not.toContain("Broadway");
  });
});
