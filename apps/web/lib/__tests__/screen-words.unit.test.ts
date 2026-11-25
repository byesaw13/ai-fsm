/**
 * TASK-235: every screen says Customer, Property, Estimate, Invoice
 * (owner decision 2026-11-22, docs/canonical/DOMAIN_MODEL.md).
 *
 * Scans the text people read — JSX text and string values — in staff screens,
 * components, helpers and API messages, and fails on the retired words.
 * Covers staff screens and what customers see (portal, estimate response,
 * booking, intake, print pages, PDF, email, SMS). Code names, routes, imports,
 * test ids, log lines and AI prompts are skipped.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const WEB = path.resolve(__dirname, "../..");
const ROOTS = [
  "app/app",
  "app/api",
  "app/portal",
  "app/estimate",
  "app/booking",
  "components",
  "lib",
];

/** AI prompts are instructions to the model, not screen text. */
const SKIP_FILES: RegExp[] = [/^lib\/estimates\/(ai-draft|item-suggester|interview-agent)\.ts$/];

const RETIRED = /\b(Clients?|clients?|People|Persons?|Houses?|Quotes?|quotes?|Bills?)\b/;

/** Real uses of the words that are not the retired nouns. Keep this short. */
const ALLOWED: RegExp[] = [
  /Supply House/i, // the store type
  /House numbers/, // the numbers on a house
  /Person-hours/i, // the unit
  /People pay what they still remember/, // plain English, not the noun
  /Client concierge/, // realtor-sponsored purpose: the realtor's client
  /^Bill To$/, // the standard billing-address heading on invoices and printed estimates
];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!["__tests__", "node_modules", ".next"].includes(entry.name)) out.push(...files(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function isCode(text: string): boolean {
  const t = text.trim();
  return (
    /^[a-z0-9_.:/?=&@#-]*$/.test(t) || // ids, routes, keys
    t === "use client" ||
    (t.includes("/") && !/\s/.test(t)) ||
    /^(\[|[a-z]|POST |GET |You |Summarize |Prior estimates)/.test(t) || // logs and prompts
    /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b/.test(t)
  );
}

function retiredWordsIn(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind);
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    let text: string | null = null;
    if (ts.isJsxText(node)) {
      text = node.text;
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const p = node.parent;
      const structural =
        ts.isImportDeclaration(p) ||
        ts.isExportDeclaration(p) ||
        ts.isLiteralTypeNode(p) ||
        ts.isElementAccessExpression(p) ||
        ts.isCaseClause(p) ||
        (ts.isPropertyAssignment(p) && p.name === node) ||
        (ts.isBinaryExpression(p) &&
          (p.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
            p.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken));
      if (!structural) text = node.text;
    }
    if (text && !isCode(text) && RETIRED.test(text) && !ALLOWED.some((a) => a.test(text!))) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      hits.push(`${path.relative(WEB, file)}:${line}: ${text.trim().slice(0, 100)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe("screens speak Customer, Property, Estimate, Invoice", () => {
  it("no staff or customer screen, helper or message uses a retired word", () => {
    const hits = ROOTS.flatMap((root) => files(path.join(WEB, root)))
      .filter((file) => !SKIP_FILES.some((skip) => skip.test(path.relative(WEB, file))))
      .flatMap(retiredWordsIn);
    expect(hits).toEqual([]);
  });

  it("flags the retired words in readable text, not in code", () => {
    expect(RETIRED.test("Send to Client")).toBe(true);
    expect(RETIRED.test("New Quote")).toBe(true);
    expect(RETIRED.test("Bills")).toBe(true);
    expect(RETIRED.test("Houses")).toBe(true);
    expect(RETIRED.test("Send to Customer")).toBe(false);
    expect(isCode("Send to Client")).toBe(false);
    expect(isCode("use client")).toBe(true);
    expect(isCode("/app/clients")).toBe(true);
  });
});
