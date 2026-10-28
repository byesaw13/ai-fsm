#!/usr/bin/env node
/**
 * Load owner-reviewed Craftsman reference hours onto price book codes (TASK-218).
 * The CSV holds licensed figures and stays outside git (garonhome:
 * ~/craftsman-reference/approved.csv). Every row must be valid or nothing is
 * written. Codes in the CSV have their reference_hours replaced; other codes
 * are untouched.
 *
 * CSV header:
 *   code,book,edition,line,unit,install_hours,remove_hours,reset_hours,minimum_hours,includes,captured_on,note
 *
 * Usage:
 *   node scripts/load-reference-hours.mjs --csv approved.csv --mode dry-run
 *   node scripts/load-reference-hours.mjs --csv approved.csv --mode sql > /tmp/ref-hours.sql
 *
 * Apply SQL (one transaction; any unknown code aborts it):
 *   docker exec -i ai-fsm-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < /tmp/ref-hours.sql
 */

import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const COLUMNS = [
  "code", "book", "edition", "line", "unit", "install_hours", "remove_hours",
  "reset_hours", "minimum_hours", "includes", "captured_on", "note",
];
const UNITS = new Set(["Ea", "LF", "SF", "SY", "step"]);
const DOLLAR_TAG = "$ref_hours$";

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

function hoursField(value, name, required, errors, at) {
  if (value === "") {
    if (required) errors.push(`${at}: ${name} is required`);
    return undefined;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    errors.push(`${at}: ${name} must be a number >= 0 (got "${value}")`);
    return undefined;
  }
  return n;
}

/** Parse and validate the CSV. Returns { byCode: Map<code, entry[]>, errors: string[] }. */
export function buildEntries(text) {
  const errors = [];
  const byCode = new Map();
  const rows = parseCsv(text);
  if (rows.length === 0) return { byCode, errors: ["CSV is empty"] };
  const header = rows[0].map((h) => h.trim());
  if (header.join(",") !== COLUMNS.join(",")) {
    return { byCode, errors: [`header must be: ${COLUMNS.join(",")}`] };
  }
  rows.slice(1).forEach((cells, i) => {
    const at = `row ${i + 2}`;
    if (cells.length !== COLUMNS.length) {
      errors.push(`${at}: expected ${COLUMNS.length} columns, got ${cells.length}`);
      return;
    }
    const r = Object.fromEntries(COLUMNS.map((c, j) => [c, cells[j].trim()]));
    if (!/^[0-9A-Za-z-]{1,10}$/.test(r.code)) errors.push(`${at}: bad code "${r.code}"`);
    if (!r.book) errors.push(`${at}: book is required`);
    if (!r.line) errors.push(`${at}: line is required`);
    if (!UNITS.has(r.unit)) errors.push(`${at}: unit must be one of ${[...UNITS].join(", ")}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.captured_on)) errors.push(`${at}: captured_on must be YYYY-MM-DD`);
    const entry = { source: "craftsman", book: r.book, line: r.line, unit: r.unit };
    if (r.edition) entry.edition = r.edition;
    entry.install_hours = hoursField(r.install_hours, "install_hours", true, errors, at);
    for (const k of ["remove_hours", "reset_hours", "minimum_hours"]) {
      const v = hoursField(r[k], k, false, errors, at);
      if (v !== undefined) entry[k] = v;
    }
    if (r.includes) entry.includes = r.includes;
    entry.captured_on = r.captured_on;
    if (r.note) entry.note = r.note;
    if (!byCode.has(r.code)) byCode.set(r.code, []);
    byCode.get(r.code).push(entry);
  });
  return { byCode, errors };
}

/** One transaction: fail if any code is missing, then replace each code's entries. */
export function toSql(byCode) {
  const codes = [...byCode.keys()];
  const lines = ["BEGIN;"];
  const list = codes.map((c) => `'${c}'`).join(", ");
  lines.push(
    "DO $check$",
    "DECLARE missing text;",
    "BEGIN",
    `  SELECT string_agg(c, ', ') INTO missing FROM unnest(ARRAY[${list}]::text[]) AS c`,
    "   WHERE NOT EXISTS (SELECT 1 FROM price_book p WHERE p.code = c);",
    "  IF missing IS NOT NULL THEN RAISE EXCEPTION 'unknown price book codes: %', missing; END IF;",
    "END $check$;",
  );
  for (const [code, entries] of byCode) {
    const json = JSON.stringify(entries);
    if (json.includes(DOLLAR_TAG)) throw new Error(`code ${code}: text contains ${DOLLAR_TAG}`);
    lines.push(
      `UPDATE price_book SET reference_hours = ${DOLLAR_TAG}${json}${DOLLAR_TAG}::jsonb, updated_at = now() WHERE code = '${code}';`,
    );
  }
  lines.push("COMMIT;");
  return lines.join("\n") + "\n";
}

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const csv = arg("--csv");
  const mode = arg("--mode") ?? "dry-run";
  if (!csv || !["dry-run", "sql"].includes(mode)) {
    console.error("usage: load-reference-hours.mjs --csv <file> --mode dry-run|sql");
    return 2;
  }
  const { byCode, errors } = buildEntries(fs.readFileSync(csv, "utf8"));
  if (errors.length) {
    console.error(`Nothing written. ${errors.length} problem(s):\n  ${errors.join("\n  ")}`);
    return 1;
  }
  if (mode === "sql") {
    process.stdout.write(toSql(byCode));
    return 0;
  }
  let total = 0;
  for (const [code, entries] of byCode) {
    total += entries.length;
    console.log(`${code}: ${entries.length} line(s)`);
    for (const e of entries) {
      const extra = [e.remove_hours !== undefined && `remove ${e.remove_hours}`, e.minimum_hours !== undefined && `min ${e.minimum_hours}`]
        .filter(Boolean).join(", ");
      console.log(`  ${e.book}: ${e.line} | ${e.install_hours} h/${e.unit}${extra ? ` (${extra})` : ""}`);
    }
  }
  console.log(`\n${byCode.size} code(s), ${total} line(s). Dry run: nothing written.`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
