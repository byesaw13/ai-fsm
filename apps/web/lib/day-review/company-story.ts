import { formatHours, looksLikeStorePlace } from "@ai-fsm/domain";
import { BUSINESS_TIMEZONE } from "@/lib/time/business-tz";

export type CompanyDayStoryHold = {
  houseLabel: string;
  clientName?: string | null;
  invoiceId?: string | null;
};

export type CompanyDayStoryReturn = {
  when: string | null;
  houseLabel: string;
  startHere: string | null;
};

export type CompanyDayStoryReceipt = {
  vendor: string;
  amountCents: number | null;
};

export type CompanyDayStoryInput = {
  houseCount: number;
  jobMinutes: number;
  miles: number | null;
  billsSent: number;
  billsOnHold: CompanyDayStoryHold[];
  comingBack: CompanyDayStoryReturn[];
  leftoverReceipts: CompanyDayStoryReceipt[];
  unansweredStops: number;
  clocksDisagree: boolean;
};

export type CompanyDayStory = {
  housesLine: string;
  billsLine: string;
  comingBackLine: string;
  leftoversLine: string;
  isQuietNight: boolean;
};

export type CompanyDayStoryLoaded = {
  productionHouses: string[];
  visitHouses: string[];
  stopHouses: string[];
  timeEntries: { activityType: string; durationMinutes: number }[];
  milesOdometer: number | null;
  milesGps: number | null;
  milesFlagged: boolean;
  clockedMinutes: number | null;
  attributedMinutes: number | null;
  bills: {
    id: string;
    status: string;
    houseLabel: string;
    clientName: string | null;
  }[];
  comingBack: CompanyDayStoryReturn[];
  leftoverReceipts: CompanyDayStoryReceipt[];
  unansweredStops: number;
};

const SENT_BILL_STATUSES = new Set(["sent", "partial", "paid", "overdue"]);
const HOLD_BILL_STATUSES = new Set(["draft"]);
const SKIP_BILL_STATUSES = new Set(["void", "cancelled"]);
const CLOCK_GAP_MINUTES = 20;

/** Street number + first word, so "4 Ash St, Salem, NH" reads "4 Ash". */
export function shortHouseLabel(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "House";
  const street = text.split(",")[0]?.trim() || text;
  const numbered = street.match(/^(\d+)\s+(\S+)/);
  if (numbered) return `${numbered[1]} ${numbered[2]}`;
  return street;
}

function firstName(name: string | null | undefined): string | null {
  const token = name?.trim().split(/\s+/)[0];
  return token || null;
}

function holdLabel(bill: CompanyDayStoryHold): string {
  return firstName(bill.clientName) ?? shortHouseLabel(bill.houseLabel);
}

function weekdayShort(when: string): string | null {
  const iso = when.length <= 10 ? `${when}T12:00:00` : when;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: BUSINESS_TIMEZONE,
  });
}

function formatMoney(cents: number): string {
  const dollars = cents / 100;
  if (Number.isInteger(dollars)) return `$${dollars}`;
  return `$${dollars.toFixed(2)}`;
}

function isNotAHouse(label: string): boolean {
  const p = label.trim().toLowerCase();
  if (!p || p === "home" || p === "private") return true;
  return looksLikeStorePlace(label);
}

function uniqueHouseCount(labels: string[]): number {
  const seen = new Set<string>();
  for (const raw of labels) {
    const label = raw.trim();
    if (!label || isNotAHouse(label)) continue;
    seen.add(label.toLowerCase());
  }
  return seen.size;
}

function roundMiles(odometer: number | null, gps: number | null): number | null {
  if (odometer != null && Number.isFinite(odometer)) return Math.round(odometer);
  if (gps != null && Number.isFinite(gps) && gps > 0) return Math.round(gps);
  return null;
}

function clocksDisagreeFromLoaded(loaded: CompanyDayStoryLoaded): boolean {
  if (loaded.milesFlagged) return true;
  if (loaded.clockedMinutes == null || loaded.attributedMinutes == null) return false;
  return Math.abs(loaded.clockedMinutes - loaded.attributedMinutes) > CLOCK_GAP_MINUTES;
}

export function assembleCompanyDayStoryInput(
  loaded: CompanyDayStoryLoaded,
): CompanyDayStoryInput {
  const billsOnHold: CompanyDayStoryHold[] = [];
  let billsSent = 0;
  for (const bill of loaded.bills) {
    if (SKIP_BILL_STATUSES.has(bill.status)) continue;
    if (HOLD_BILL_STATUSES.has(bill.status)) {
      billsOnHold.push({
        houseLabel: bill.houseLabel,
        clientName: bill.clientName,
        invoiceId: bill.id,
      });
    } else if (SENT_BILL_STATUSES.has(bill.status)) {
      billsSent += 1;
    }
  }

  const jobMinutes = loaded.timeEntries
    .filter((e) => e.activityType === "job_work")
    .reduce((sum, e) => sum + (e.durationMinutes || 0), 0);

  return {
    houseCount: uniqueHouseCount([
      ...loaded.productionHouses,
      ...loaded.visitHouses,
      ...loaded.stopHouses,
    ]),
    jobMinutes,
    miles: roundMiles(loaded.milesOdometer, loaded.milesGps),
    billsSent,
    billsOnHold,
    comingBack: loaded.comingBack,
    leftoverReceipts: loaded.leftoverReceipts,
    unansweredStops: loaded.unansweredStops,
    clocksDisagree: clocksDisagreeFromLoaded(loaded),
  };
}

function housesLine(input: CompanyDayStoryInput): string {
  const houses =
    input.houseCount === 0
      ? "No houses"
      : input.houseCount === 1
        ? "1 house"
        : `${input.houseCount} houses`;
  const parts = [`${houses}. ${formatHours(input.jobMinutes)} on jobs`];
  if (input.miles != null) parts.push(`${Math.round(input.miles)} miles`);
  return `${parts.join(". ")}.`;
}

function billsLine(input: CompanyDayStoryInput): string {
  const holdCount = input.billsOnHold.length;
  if (input.billsSent === 0 && holdCount === 0) return "Bills: none.";
  const parts: string[] = [];
  if (input.billsSent > 0) parts.push(`${input.billsSent} sent`);
  if (holdCount > 0) {
    let hold = `${holdCount} on Hold`;
    if (holdCount === 1) hold += ` (${holdLabel(input.billsOnHold[0])} — tap to send)`;
    parts.push(hold);
  }
  return `Bills: ${parts.join(", ")}.`;
}

function comingBackItem(item: CompanyDayStoryReturn): string {
  const bits = [
    item.when ? weekdayShort(item.when) : null,
    shortHouseLabel(item.houseLabel),
    item.startHere?.trim() || null,
  ].filter((bit): bit is string => Boolean(bit));
  return bits.join(" · ");
}

function comingBackLine(input: CompanyDayStoryInput): string {
  if (input.comingBack.length === 0) return "Coming back: none.";
  return `Coming back: ${input.comingBack.map(comingBackItem).join(". ")}.`;
}

function leftoverBits(input: CompanyDayStoryInput): string[] {
  const bits: string[] = [];
  const receipts = input.leftoverReceipts;
  if (receipts.length === 1) {
    const r = receipts[0];
    const vendor = r.vendor.trim() || "Receipt";
    const money = r.amountCents != null ? ` ${formatMoney(r.amountCents)}` : "";
    bits.push(`${vendor}${money} — which house?`);
  } else if (receipts.length > 1) {
    bits.push(`${receipts.length} receipts still need a house.`);
  }
  if (input.unansweredStops === 1) bits.push("1 stop still needs a reason.");
  else if (input.unansweredStops > 1) bits.push(`${input.unansweredStops} stops still need a reason.`);
  if (input.clocksDisagree) bits.push("The van and the clock don't match.");
  return bits;
}

function leftoversLine(input: CompanyDayStoryInput): string {
  const bits = leftoverBits(input);
  if (bits.length === 0) return "Leftovers: none.";
  return `Leftovers: ${bits.join(" · ")}`;
}

export function companyDayStory(input: CompanyDayStoryInput): CompanyDayStory {
  const leftovers = leftoverBits(input);
  const isQuietNight =
    input.houseCount === 0 &&
    input.jobMinutes === 0 &&
    (input.miles == null || input.miles === 0) &&
    input.billsSent === 0 &&
    input.billsOnHold.length === 0 &&
    input.comingBack.length === 0 &&
    leftovers.length === 0;

  return {
    housesLine: housesLine(input),
    billsLine: billsLine(input),
    comingBackLine: comingBackLine(input),
    leftoversLine: leftoversLine(input),
    isQuietNight,
  };
}
