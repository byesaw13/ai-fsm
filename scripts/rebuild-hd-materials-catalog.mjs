#!/usr/bin/env node
/**
 * One-shot: rebuild materials_price_book unit prices from Home Depot purchase CSV
 * using per-unit coercion (not line totals). Overwrites last/avg/count from a
 * clean recompute — does NOT stack on top of a previous import.
 *
 * Usage:
 *   node scripts/rebuild-hd-materials-catalog.mjs --csv path.csv --mode dry-run
 *   node scripts/rebuild-hd-materials-catalog.mjs --csv path.csv --mode sql > /tmp/hd-rebuild.sql
 *
 * Apply SQL:
 *   docker compose ... exec -T postgres psql -U ... -d ... -v ON_ERROR_STOP=1 -f - < /tmp/hd-rebuild.sql
 */

import fs from "node:fs";
import path from "node:path";

const CENTS_TOLERANCE = 2;

function coerceUnitCostCents({ quantity, unit_cost_cents, line_total_cents }) {
  const qty = quantity > 0 ? quantity : 1;
  let unit = Math.round(unit_cost_cents);
  if (unit <= 0) return 0;

  const hasTotal =
    typeof line_total_cents === "number" &&
    Number.isFinite(line_total_cents) &&
    line_total_cents > 0;
  const total = hasTotal ? Math.round(line_total_cents) : null;

  if (total != null) {
    // Normal: unit × qty ≈ line total
    if (Math.abs(unit * qty - total) <= CENTS_TOLERANCE) return unit;
    // HD swap: "Net Unit" actually holds the line total, extended holds the unit
    if (qty > 1 && Math.abs(total * qty - unit) <= CENTS_TOLERANCE) {
      return Math.max(1, total);
    }
    // Both fields hold the line total
    if (qty > 1 && Math.abs(unit - total) <= CENTS_TOLERANCE) {
      return Math.max(1, Math.round(total / qty));
    }
    if (qty > 1) {
      const derived = Math.round(total / qty);
      if (derived > 0 && Math.abs(derived * qty - total) <= CENTS_TOLERANCE) {
        return derived;
      }
    }
    if (qty === 1 && Math.abs(unit - total) > CENTS_TOLERANCE) return total;
  }
  return unit;
}

/**
 * HD purchase export: resolve per-unit cents from Net Unit + Extended + Quantity.
 * Handles (1) correct unit×qty=extended, (2) both fields = line total, (3) swapped columns.
 */
function resolveHdUnitCents(qty, netCents, extendedCents) {
  const q = qty > 0 ? qty : 1;
  const net = netCents != null && netCents > 0 ? netCents : null;
  const ext = extendedCents != null && extendedCents > 0 ? extendedCents : null;
  if (net == null && ext == null) return 0;
  if (q === 1) return net ?? ext ?? 0;
  if (net != null && ext != null) {
    // net is unit, ext is line total
    if (Math.abs(ext - net * q) <= CENTS_TOLERANCE) return net;
    // swapped: ext is unit, net is line total
    if (Math.abs(net - ext * q) <= CENTS_TOLERANCE) return ext;
    // both are line total
    if (Math.abs(net - ext) <= CENTS_TOLERANCE) {
      return Math.max(1, Math.round(net / q));
    }
  }
  if (net != null && ext == null) {
    // alone, prefer treating net as unit (cannot safely assume line total)
    return net;
  }
  // only extended: treat as line total when multi-qty
  return Math.max(1, Math.round((ext ?? 0) / q));
}

function parseMoneyToCents(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[$,\s]/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.round(n * 100);
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function mapDept(dept) {
  const d = (dept ?? "").toUpperCase();
  if (d.includes("PAINT") || d.includes("CAULK")) return "paint";
  if (d.includes("LUMBER") || d.includes("BUILDING MATERIAL")) return "lumber";
  if (d.includes("MILLWORK") || d.includes("MOULD") || d.includes("TRIM")) return "trim";
  if (d.includes("FLOOR") || d.includes("TILE") || d.includes("VINYL")) return "flooring";
  if (d.includes("CONCRETE") || d.includes("MASONRY")) return "concrete";
  if (d.includes("FASTENER") || d.includes("NAIL") || d.includes("SCREW")) return "fasteners";
  if (d.includes("SHEET") || d.includes("DRYWALL") || d.includes("PLYWOOD")) return "sheet_goods";
  if (
    d.includes("HARDWARE") ||
    d.includes("PLUMBING") ||
    d.includes("ELECTRICAL") ||
    d.includes("HVAC")
  ) {
    return "hardware";
  }
  return "other";
}

function parseHdCsv(csvText) {
  const rows = parseCsvRows(csvText);
  let headerIdx = -1;
  let headers = [];
  for (let i = 0; i < rows.length; i++) {
    const joined = rows[i].map((c) => c.trim().toLowerCase());
    if (
      joined.includes("date") &&
      joined.includes("sku number") &&
      joined.some((h) => h.includes("sku description"))
    ) {
      headerIdx = i;
      headers = joined;
      break;
    }
  }
  if (headerIdx < 0) throw new Error("HD header row not found");

  const col = (name) => headers.indexOf(name);
  const iDate = col("date");
  const iSku = col("sku number");
  const iDesc = col("sku description");
  const iNet =
    headers.indexOf("net unit price") >= 0
      ? headers.indexOf("net unit price")
      : headers.indexOf("unit price");
  const iExtended = headers.findIndex(
    (h) => h.includes("extended retail") || h === "extended" || h.includes("line total"),
  );
  const iDept = col("department name");
  const iQty = col("quantity");

  const lines = [];
  let skipped = 0;
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (idx) => (idx >= 0 && idx < row.length ? row[idx].trim() : "");
    const name = get(iDesc);
    const sku = get(iSku);
    const netCents = parseMoneyToCents(get(iNet));
    const extendedCents = iExtended >= 0 ? parseMoneyToCents(get(iExtended)) : null;
    const qtyRaw = get(iQty);
    const qty = qtyRaw && Number(qtyRaw) > 0 ? Number(qtyRaw) : 1;
    const dept = get(iDept) || null;
    const dateRaw = get(iDate);

    if (!name && !sku) {
      skipped++;
      continue;
    }
    if (netCents == null && (extendedCents == null || extendedCents === 0)) {
      skipped++;
      continue;
    }
    if ((netCents != null && netCents < 0) || (extendedCents != null && extendedCents < 0)) {
      skipped++;
      continue;
    }
    if (!name) {
      skipped++;
      continue;
    }

    const unit_cost_cents = resolveHdUnitCents(qty, netCents, extendedCents);
    if (unit_cost_cents <= 0) {
      skipped++;
      continue;
    }
    const coerced =
      netCents != null && qty > 1 && unit_cost_cents !== netCents;

    let purchasedAt = null;
    if (/^\d{4}-\d{2}-\d{2}/.test(dateRaw)) purchasedAt = dateRaw.slice(0, 10);
    else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(dateRaw)) {
      const [mm, dd, yy] = dateRaw.split(/[/\s]/)[0].split("/");
      const yyyy = yy.length === 2 ? `20${yy}` : yy;
      purchasedAt = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }

    lines.push({
      name,
      sku: sku || null,
      unit_cost_cents,
      raw_net_cents: netCents,
      raw_extended_cents: extendedCents,
      quantity: qty,
      purchasedAt,
      category: mapDept(dept),
      coerced,
    });
  }
  return { lines, skipped };
}

/** Pick most frequent non-empty name (HD store SKUs reuse IDs; longest name is often wrong). */
function majorityName(names) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const n of names) {
    const t = n.trim();
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best = "";
  let bestN = -1;
  for (const [name, n] of counts) {
    // Prefer higher count; break ties with moderate length (avoid 1-word SKUs and huge wrong titles)
    if (
      n > bestN ||
      (n === bestN &&
        Math.abs(name.length - 40) < Math.abs(best.length - 40))
    ) {
      best = name;
      bestN = n;
    }
  }
  return best || names[0] || "Unknown";
}

/** Aggregate observations → one catalog row per SKU (or name if no SKU). */
function aggregate(lines) {
  /** @type {Map<string, any>} */
  const map = new Map();
  for (const line of lines) {
    const key = line.sku
      ? `sku:${line.sku.trim().toLowerCase()}`
      : `name:${line.name.trim().toLowerCase()}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        sku: line.sku,
        names: [],
        category: line.category,
        obs: [],
        coercedCount: 0,
      };
      map.set(key, g);
    }
    g.names.push(line.name);
    if (line.sku) g.sku = line.sku;
    g.obs.push({
      unit: line.unit_cost_cents,
      date: line.purchasedAt,
      qty: line.quantity,
    });
    if (line.coerced) g.coercedCount++;
  }

  const rows = [];
  for (const g of map.values()) {
    const sorted = [...g.obs].sort((a, b) => {
      const da = a.date ?? "";
      const db = b.date ?? "";
      return da.localeCompare(db);
    });
    const last = sorted[sorted.length - 1];
    const sum = sorted.reduce((s, o) => s + o.unit, 0);
    const avg = Math.round(sum / sorted.length);
    rows.push({
      sku: g.sku,
      name: majorityName(g.names),
      category: g.category,
      unit_cost_cents: last.unit, // last paid = most recent observation's unit
      avg_paid_cents: avg,
      purchase_count: sorted.length, // replace, not stack
      last_purchased_at: last.date,
      observation_count: sorted.length,
      coerced_observations: g.coercedCount,
      min_unit: Math.min(...sorted.map((o) => o.unit)),
      max_unit: Math.max(...sorted.map((o) => o.unit)),
    });
  }
  return rows;
}

function sqlLiteral(s) {
  if (s == null) return "NULL";
  return `'${String(s).replace(/'/g, "''")}'`;
}

function buildSql(accountId, rows) {
  const lines = [];
  lines.push("BEGIN;");
  lines.push(`-- rebuild HD materials catalog for account ${accountId}`);
  lines.push(`-- ${rows.length} aggregated SKUs/names; purchase_count replaced from CSV (no stack)`);
  lines.push("");

  for (const r of rows) {
    const name = sqlLiteral(r.name.slice(0, 255));
    const sku = r.sku ? sqlLiteral(r.sku.slice(0, 100)) : "NULL";
    const cat = sqlLiteral(r.category);
    const lastDate = r.last_purchased_at ? sqlLiteral(r.last_purchased_at) : "NULL";
    const notes = sqlLiteral("Rebuilt from HD purchase CSV (per-unit coerce); purchase_count reset");

    // Prefer SKU match, then same name+unit (avoids unique index collisions on insert).
    lines.push(`
WITH target AS (
  SELECT id FROM materials_price_book
  WHERE account_id = ${sqlLiteral(accountId)}
    AND is_active = true
    AND (
      ${
        r.sku
          ? `(sku IS NOT NULL AND lower(btrim(sku)) = lower(btrim(${sku})))
             OR (lower(btrim(name)) = lower(btrim(${name})) AND unit = 'each')`
          : `lower(btrim(name)) = lower(btrim(${name})) AND unit = 'each'`
      }
    )
  ORDER BY
    CASE
      WHEN ${r.sku ? `sku IS NOT NULL AND lower(btrim(sku)) = lower(btrim(${sku}))` : "false"}
      THEN 0 ELSE 1
    END,
    last_purchased_at DESC NULLS LAST,
    updated_at DESC NULLS LAST
  LIMIT 1
),
upd AS (
  UPDATE materials_price_book m SET
    -- Prices always overwrite from clean CSV recompute (no count stacking).
    unit_cost_cents = ${r.unit_cost_cents},
    avg_paid_cents = ${r.avg_paid_cents},
    purchase_count = ${r.purchase_count},
    last_purchased_at = ${lastDate}::date,
    category = ${cat},
    supplier = COALESCE(NULLIF(btrim(m.supplier), ''), 'Home Depot'),
    -- Only change name/sku when it will not violate unique indexes.
    name = CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM materials_price_book o
        WHERE o.account_id = m.account_id AND o.is_active AND o.id <> m.id
          AND lower(btrim(o.name)) = lower(btrim(${name})) AND o.unit = m.unit
      ) THEN btrim(${name})
      ELSE m.name
    END,
    sku = CASE
      WHEN ${sku} IS NULL THEN m.sku
      WHEN NOT EXISTS (
        SELECT 1 FROM materials_price_book o
        WHERE o.account_id = m.account_id AND o.is_active AND o.id <> m.id
          AND o.sku IS NOT NULL AND lower(btrim(o.sku)) = lower(btrim(${sku}))
      ) THEN ${sku}
      ELSE m.sku
    END,
    notes = ${notes},
    updated_at = now()
  FROM target t
  WHERE m.id = t.id
  RETURNING m.id
)
INSERT INTO materials_price_book
  (account_id, name, category, unit, unit_cost_cents, supplier, sku,
   last_purchased_at, avg_paid_cents, purchase_count, notes, is_active)
SELECT
  ${sqlLiteral(accountId)}, btrim(${name}), ${cat}, 'each', ${r.unit_cost_cents},
  'Home Depot', ${sku}, ${lastDate}::date, ${r.avg_paid_cents}, ${r.purchase_count},
  ${notes}, true
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (
    SELECT 1 FROM materials_price_book
    WHERE account_id = ${sqlLiteral(accountId)}
      AND is_active = true
      AND lower(btrim(name)) = lower(btrim(${name}))
      AND unit = 'each'
  )
  AND (
    ${sku} IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM materials_price_book
      WHERE account_id = ${sqlLiteral(accountId)}
        AND is_active = true
        AND sku IS NOT NULL
        AND lower(btrim(sku)) = lower(btrim(${sku}))
    )
  );
`.trim());
  }

  lines.push("");
  lines.push("COMMIT;");
  return lines.join("\n");
}

function parseArgs(argv) {
  const out = {
    csv: null,
    mode: "dry-run",
    accountId: "aaaaaaaa-0000-0000-0000-000000000001",
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--csv") out.csv = argv[++i];
    else if (argv[i] === "--mode") out.mode = argv[++i];
    else if (argv[i] === "--account") out.accountId = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.csv) {
    console.error("Usage: --csv <path> [--mode dry-run|sql] [--account uuid]");
    process.exit(2);
  }
  const csvPath = path.resolve(args.csv);
  const text = fs.readFileSync(csvPath, "utf8");
  const { lines, skipped } = parseHdCsv(text);
  const rows = aggregate(lines);
  const coercedLines = lines.filter((l) => l.coerced).length;

  if (args.mode === "sql") {
    process.stdout.write(buildSql(args.accountId, rows));
    return;
  }

  // dry-run report
  const report = {
    csv: csvPath,
    accountId: args.accountId,
    parsed_lines: lines.length,
    skipped_lines: skipped,
    aggregated_catalog_rows: rows.length,
    lines_with_unit_coercion: coercedLines,
    sample_coerced: lines
      .filter((l) => l.coerced)
      .slice(0, 12)
      .map((l) => ({
        name: l.name.slice(0, 50),
        sku: l.sku,
        qty: l.quantity,
        raw_net_cents: l.raw_net_cents,
        unit_cost_cents: l.unit_cost_cents,
        date: l.purchasedAt,
      })),
    sample_skus: rows
      .sort((a, b) => (b.purchase_count || 0) - (a.purchase_count || 0))
      .slice(0, 10)
      .map((r) => ({
        sku: r.sku,
        name: r.name.slice(0, 50),
        last: r.unit_cost_cents,
        avg: r.avg_paid_cents,
        n: r.purchase_count,
        coerced_obs: r.coerced_observations,
        last_date: r.last_purchased_at,
      })),
  };
  console.log(JSON.stringify(report, null, 2));
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) main();

export { parseHdCsv, aggregate, buildSql, coerceUnitCostCents };
