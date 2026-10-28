import assert from "node:assert/strict";
import test from "node:test";
import { buildEntries, COLUMNS, parseCsv, toSql } from "./load-reference-hours.mjs";

// Made-up figures; no licensed Craftsman values in tests.
const header = COLUMNS.join(",");
const good = [
  header,
  '1001,Test Book,1st,"Patch, small",Ea,0.5,,,2,"board, mud",2026-10-27,',
  "1001,Test Book,,Texture,SF,0.01,,,,,2026-10-27,owner note",
  "2001,Other Book,,Faucet,Ea,0.4,0.3,0.6,,,2026-10-27,",
].join("\n");

test("parseCsv handles quoted commas and doubled quotes", () => {
  assert.deepEqual(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\n'), [["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
});

test("valid CSV groups entries by code", () => {
  const { byCode, errors } = buildEntries(good);
  assert.deepEqual(errors, []);
  assert.equal(byCode.size, 2);
  assert.equal(byCode.get("1001").length, 2);
  assert.deepEqual(byCode.get("1001")[0], {
    source: "craftsman", book: "Test Book", line: "Patch, small", unit: "Ea", edition: "1st",
    install_hours: 0.5, minimum_hours: 2, includes: "board, mud", captured_on: "2026-10-27",
  });
  assert.deepEqual(byCode.get("2001")[0].remove_hours, 0.3);
});

test("any invalid row fails the whole file", () => {
  const bad = [good, "2005,Test Book,,Toilet,gallon,-1,,,,,10/27/2026,"].join("\n");
  const { errors } = buildEntries(bad);
  assert.equal(errors.length, 3);
  assert.match(errors.join(" "), /unit must be/);
  assert.match(errors.join(" "), /install_hours must be a number/);
  assert.match(errors.join(" "), /captured_on/);
});

test("wrong header is rejected", () => {
  assert.match(buildEntries("code,book\n1001,x").errors[0], /header must be/);
});

test("SQL checks codes exist and replaces only the listed codes in one transaction", () => {
  const sql = toSql(buildEntries(good).byCode);
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /COMMIT;\n$/);
  assert.match(sql, /RAISE EXCEPTION 'unknown price book codes/);
  assert.match(sql, /ARRAY\['1001', '2001'\]/);
  assert.equal((sql.match(/UPDATE price_book/g) ?? []).length, 2);
  assert.match(sql, /WHERE code = '1001';/);
});
