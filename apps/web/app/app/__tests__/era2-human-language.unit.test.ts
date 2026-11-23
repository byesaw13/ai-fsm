import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = join(__dirname, "..");

function readApp(rel: string): string {
  return readFileSync(join(appRoot, rel), "utf8");
}

describe("Era 2 Wave F — human language on list/create surfaces", () => {
  it("customers list is Customers, with a New customer path and no visit/work-order empty state", () => {
    const src = readApp("clients/page.tsx");
    expect(src).toMatch(/title=\{UI\.customers\}|title="Customers"/);
    expect(src).not.toMatch(/title="Clients"/);
    expect(src).toMatch(/\+ New customer|New customer/);
    expect(src).not.toMatch(/Create First Client|\+ New Client/);
    expect(src.toLowerCase()).not.toMatch(/work order/);
    expect(src).not.toMatch(/scheduling jobs and visits/);
  });

  it("new customer page title is New customer, back to Customers", () => {
    const src = readApp("clients/new/page.tsx");
    expect(src).toMatch(/title="New customer"|title=\{`?New customer/);
    expect(src).not.toMatch(/title="New Client"/);
    expect(src).toMatch(/backLabel="Customers"|backLabel=\{UI\.customers\}/);
  });

  it("import page backs to Customers", () => {
    const src = readApp("clients/import/page.tsx");
    expect(src).toMatch(/backLabel="Customers"|backLabel=\{UI\.customers\}/);
    expect(src).not.toMatch(/backLabel="Clients"/);
  });

  it("work-orders list redirects to /app/jobs so humans never see a Work Orders board", () => {
    const src = readApp("work-orders/page.tsx");
    expect(src).toMatch(/redirect\(["']\/app\/jobs["']\)/);
    expect(src).not.toMatch(/title="Work Orders"/);
    expect(src).not.toContain("WorkOrderBoard");
  });

  it("work-orders/new redirects into job create", () => {
    const src = readApp("work-orders/new/page.tsx");
    expect(src).toMatch(/\/app\/jobs\/new/);
    expect(src).toMatch(/redirect\(/);
    expect(src).not.toMatch(/title="New Work Order"/);
    expect(src).not.toContain("WorkOrderForm");
  });
});
