import { describe, it, expect } from "vitest";
import { run } from "../search-clients.js";
import { makeExec, TEST_SESSION } from "./helpers.js";

describe("search_clients", () => {
  it("returns matching clients and scopes to the account + search term", async () => {
    const { exec, calls } = makeExec([
      {
        match: /FROM clients/,
        rows: [{ id: "c1", name: "Jane Doe", email: "jane@x.com", phone: "555-1212" }],
      },
    ]);

    const result = (await run(exec, TEST_SESSION, { query: "jane" })) as {
      count: number;
      clients: Array<{ id: string }>;
    };

    expect(result.count).toBe(1);
    expect(result.clients[0].id).toBe("c1");
    expect(calls[0].params).toEqual([TEST_SESSION.accountId, "%jane%", 20]);
  });

  it("honors the limit and clamps to 50", async () => {
    const { exec, calls } = makeExec([{ match: /FROM clients/, rows: [] }]);
    await run(exec, TEST_SESSION, { query: "x", limit: 50 });
    expect(calls[0].params?.[2]).toBe(50);
    await expect(run(exec, TEST_SESSION, { query: "x", limit: 999 })).rejects.toThrow();
  });

  it("rejects an empty query", async () => {
    const { exec } = makeExec([{ match: /FROM clients/, rows: [] }]);
    await expect(run(exec, TEST_SESSION, { query: "" })).rejects.toThrow();
  });
});
