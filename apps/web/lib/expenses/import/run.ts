/**
 * Store purchase import, both modes (TASK-211; docs/working/estimating-assistant-phase3.md §3).
 *
 * - history: price observations only; never an expense, a line item or a job link.
 * - book:    one expense per trip with its line items, plus price observations.
 *
 * Both modes key observations by transaction identity, so a trip imported first as
 * history and later as a booked purchase never doubles the price evidence. A trip
 * that may already be in the books becomes a review record (reviews.ts) and adds
 * nothing until the owner confirms it.
 */
import type { PoolClient } from "pg";
import { appendAuditLog } from "@/lib/db/audit";
import { findOrCreateVariant, recordObservations, type NewObservation } from "@/lib/materials/ledger";
import {
  classifyTrip,
  expenseDateKey,
  vendorFamily,
  type ExpenseFingerprint,
  type ReviewReason,
} from "../duplicate-match";
import type { ExpenseCategory, ImportLineItem } from "./homedepot";
import { transactionIdentity, tripObservationKeys } from "./identity";
import { createReview } from "./reviews";

export type ImportMode = "history" | "book";
export type ImportSource = "home_depot_csv" | "lowes_csv";

export interface ImportTrip {
  trip_key: string;
  external_ref: string | null;
  store_number: string | null;
  date: string;
  vendor: string;
  amount_cents: number;
  expense_category: ExpenseCategory;
  line_items: ImportLineItem[];
  is_return?: boolean;
  job_id?: string | null;
  client_id?: string | null;
  notes?: string | null;
}

export interface Actor {
  accountId: string;
  userId: string;
  traceId?: string | null;
}

export type TripPlan =
  | { action: "return" }
  | { action: "already_imported" }
  | { action: "review"; reason: ReviewReason; matchId?: string }
  | { action: "link"; matchId: string }
  | { action: "import" };

/** Existing expenses on the dates a file covers. */
export async function loadExpenseFingerprints(
  client: PoolClient,
  accountId: string,
  dates: string[],
): Promise<ExpenseFingerprint[]> {
  if (dates.length === 0) return [];
  const { rows } = await client.query<{
    id: string;
    vendor_name: string;
    amount_cents: number;
    expense_date: string | Date;
    external_ref: string | null;
    store_number: string | null;
    source: string | null;
  }>(
    `SELECT id, vendor_name, amount_cents, expense_date, external_ref, store_number, source
     FROM expenses
     WHERE account_id = $1 AND expense_date = ANY($2::date[])`,
    [accountId, dates],
  );
  return rows.map((r) => ({ ...r, expense_date: expenseDateKey(r.expense_date) }));
}

function fingerprintOf(trip: ImportTrip): ExpenseFingerprint {
  return {
    vendor_name: trip.vendor,
    expense_date: trip.date,
    amount_cents: trip.amount_cents,
    external_ref: trip.external_ref,
    store_number: trip.store_number,
  };
}

/** The key a trip's review record is stored under (one record per trip and mode). */
export function reviewIdentity(trip: ImportTrip): string {
  return (
    transactionIdentity(trip) ??
    `nt:${vendorFamily(trip.vendor)}:${trip.trip_key}:${trip.amount_cents}`
  );
}

/**
 * What to do with each trip. `existing` gains each planned trip, so a second trip
 * in the same file with the same transaction ID at another store is a conflict.
 * `knownKeys` holds observation keys already in the ledger (history mode only).
 */
export function planTrips(
  trips: ImportTrip[],
  existing: ExpenseFingerprint[],
  mode: ImportMode,
  knownKeys: Set<string>,
): TripPlan[] {
  const seen = [...existing];
  return trips.map((trip) => {
    if (trip.is_return || trip.amount_cents <= 0) return { action: "return" };
    const identity = transactionIdentity(trip);
    const c = classifyTrip(fingerprintOf(trip), seen, identity !== null);
    seen.push({ ...fingerprintOf(trip), source: "home_depot_csv", id: `file:${trip.trip_key}` });
    if (c.status === "already_imported") return { action: "already_imported" };
    if (c.status === "review") {
      return { action: "review", reason: c.reason!, matchId: c.matchId?.startsWith("file:") ? undefined : c.matchId };
    }
    if (c.status === "auto_link") return { action: "link", matchId: c.matchId! };
    if (mode === "history" && identity) {
      const keys = tripObservationKeys(identity, pricedLines(trip));
      if (keys.length > 0 && keys.every((k) => knownKeys.has(k))) return { action: "already_imported" };
    }
    return { action: "import" };
  });
}

/** Lines that are price evidence: priced, positive quantity. Returns and $0 lines never are. */
export function pricedLines(trip: Pick<ImportTrip, "line_items">): ImportLineItem[] {
  return trip.line_items.filter((li) => li.unit_cost_cents > 0 && li.quantity > 0 && li.name.trim());
}

/** Observation keys already in the ledger for these trips. */
export async function loadKnownKeys(client: PoolClient, accountId: string, trips: ImportTrip[]): Promise<Set<string>> {
  const keys = trips.flatMap((t) => {
    const identity = transactionIdentity(t);
    return identity ? tripObservationKeys(identity, pricedLines(t)) : [];
  });
  if (keys.length === 0) return new Set();
  const { rows } = await client.query<{ dedupe_key: string }>(
    `SELECT dedupe_key FROM price_observations WHERE account_id = $1 AND dedupe_key = ANY($2::text[])`,
    [accountId, keys],
  );
  return new Set(rows.map((r) => r.dedupe_key));
}

/** Price observations for one trip, keyed by `scope` (its identity, or `review:<id>`). */
export async function tripObservations(
  client: PoolClient,
  actor: Actor,
  source: ImportSource,
  trip: ImportTrip,
  scope: string,
): Promise<NewObservation[]> {
  const lines = pricedLines(trip);
  const keys = tripObservationKeys(scope, lines);
  const rows: NewObservation[] = [];
  for (const [i, li] of lines.entries()) {
    const variant = await findOrCreateVariant(
      client,
      actor.accountId,
      { name: li.name, sku: li.sku, supplier: trip.vendor, category: li.category },
      actor.userId,
    );
    if (!variant) continue;
    rows.push({
      variantId: variant.id,
      kind: "supplier_csv",
      observedOn: trip.date,
      unitPriceCents: li.unit_cost_cents,
      storeFamily: variant.storeFamily,
      storeNumber: trip.store_number,
      isSale: li.discounted === true,
      sourceRef: `import:${source}:${scope}`,
      dedupeKey: keys[i],
      enteredBy: actor.userId,
    });
  }
  return rows;
}

/** True when a receipt already carries price observations (it then counts once). */
async function receiptHasPrices(client: PoolClient, accountId: string, expenseId: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM price_observations
     WHERE account_id = $1 AND source_ref = $2 AND status = 'active' LIMIT 1`,
    [accountId, `expense:${expenseId}`],
  );
  return rows.length > 0;
}

/** Book a trip as its own expense with its line items. Returns the expense id. */
export async function bookTrip(client: PoolClient, actor: Actor, source: ImportSource, trip: ImportTrip): Promise<string> {
  const label = source === "lowes_csv" ? "Lowe's" : "Home Depot";
  const notes = trip.notes ?? `${trip.line_items.length} item(s) · imported from ${label}`;
  const insert = (externalRef: string | null) =>
    client.query<{ id: string }>(
      `INSERT INTO expenses
         (account_id, job_id, client_id, vendor_name, category, amount_cents,
          expense_date, notes, source, external_ref, store_number, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11, $12)
       ON CONFLICT (account_id, source, external_ref)
         WHERE source IS NOT NULL AND external_ref IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [
        actor.accountId, trip.job_id ?? null, trip.client_id ?? null, trip.vendor, trip.expense_category,
        trip.amount_cents, trip.date, notes, source, externalRef, trip.store_number, actor.userId,
      ],
    );
  let ins = await insert(trip.external_ref);
  // The same transaction number at another store (confirmed as a different trip).
  if (!ins.rows[0] && trip.external_ref) ins = await insert(`${trip.external_ref} @${trip.store_number ?? "?"}`);
  if (!ins.rows[0]) throw new Error(`Transaction ${trip.external_ref} is already booked`);
  const expenseId = ins.rows[0].id;

  for (const [i, li] of pricedLines(trip).entries()) {
    await client.query(
      `INSERT INTO expense_line_items (account_id, expense_id, name, quantity, unit_cost_cents, sku, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [actor.accountId, expenseId, li.name.slice(0, 255), li.quantity, li.unit_cost_cents, li.sku ?? null, i],
    );
  }
  return expenseId;
}

/** Attach a trip to the receipt it is the same as: fill what the receipt lacks. */
export async function linkTrip(
  client: PoolClient,
  actor: Actor,
  source: ImportSource,
  trip: ImportTrip,
  expenseId: string,
): Promise<void> {
  await client.query(
    `UPDATE expenses SET
       source = COALESCE(source, $3),
       external_ref = COALESCE(external_ref, $4),
       store_number = COALESCE(store_number, $5),
       job_id = COALESCE(job_id, $6),
       client_id = COALESCE(client_id, $7),
       updated_at = now()
     WHERE id = $1 AND account_id = $2`,
    [expenseId, actor.accountId, source, trip.external_ref, trip.store_number, trip.job_id ?? null, trip.client_id ?? null],
  );
}

/**
 * Observations for a trip that is the same purchase as an existing receipt. The
 * receipt's own lines win when it has any, so the purchase counts once.
 */
export async function linkedTripObservations(
  client: PoolClient,
  actor: Actor,
  source: ImportSource,
  trip: ImportTrip,
  expenseId: string,
  scope: string,
): Promise<NewObservation[]> {
  if (await receiptHasPrices(client, actor.accountId, expenseId)) return [];
  return tripObservations(client, actor, source, trip, scope);
}

export interface ImportReport {
  mode: ImportMode;
  source: ImportSource;
  rowsRead: number;
  trips: number;
  imported: number;
  linked: number;
  alreadyImported: number;
  pending: number;
  returns: number;
  observations: number;
  rejected: number;
}

/**
 * Import trips in the caller's transaction. The plan is recomputed here (the
 * client's preview is never trusted). Each item's price cache is recomputed once.
 */
export async function importTrips(
  client: PoolClient,
  actor: Actor,
  input: { mode: ImportMode; source: ImportSource; trips: ImportTrip[]; rowsRead?: number; rejected?: number },
): Promise<ImportReport> {
  const { mode, source, trips } = input;
  const existing = await loadExpenseFingerprints(client, actor.accountId, [...new Set(trips.map((t) => t.date))]);
  const known = mode === "history" ? await loadKnownKeys(client, actor.accountId, trips) : new Set<string>();
  const plans = planTrips(trips, existing, mode, known);

  const report: ImportReport = {
    mode, source, rowsRead: input.rowsRead ?? trips.reduce((s, t) => s + t.line_items.length, 0),
    trips: trips.length, imported: 0, linked: 0, alreadyImported: 0, pending: 0, returns: 0, observations: 0,
    rejected: input.rejected ?? 0,
  };
  const observations: NewObservation[] = [];

  for (const [i, trip] of trips.entries()) {
    const plan = plans[i];
    const identity = transactionIdentity(trip);
    switch (plan.action) {
      case "return":
        report.returns++;
        break;
      case "already_imported":
        report.alreadyImported++;
        break;
      case "review": {
        const r = await createReview(client, actor, {
          mode,
          identityKey: reviewIdentity(trip),
          reason: plan.reason,
          payload: { source, trip },
          valueCents: trip.amount_cents,
          matchExpenseId: plan.matchId ?? null,
        });
        // A trip already reviewed (confirmed or dismissed) stays as the owner left it.
        if (r.status === "pending") report.pending++;
        else report.alreadyImported++;
        break;
      }
      case "link":
        if (mode === "book") await linkTrip(client, actor, source, trip, plan.matchId);
        observations.push(...(await linkedTripObservations(client, actor, source, trip, plan.matchId, identity!)));
        report.linked++;
        break;
      case "import":
        if (mode === "book") await bookTrip(client, actor, source, trip);
        observations.push(...(await tripObservations(client, actor, source, trip, identity!)));
        report.imported++;
        break;
    }
  }

  const { inserted } = await recordObservations(client, actor.accountId, observations);
  report.observations = inserted;

  await appendAuditLog(client, {
    account_id: actor.accountId,
    entity_type: "expense_import",
    entity_id: crypto.randomUUID(), // batch id — audit_log.entity_id is a uuid
    action: "insert",
    actor_id: actor.userId,
    trace_id: actor.traceId ?? null,
    new_value: { ...report },
  });
  return report;
}
