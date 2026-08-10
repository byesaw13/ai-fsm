import Link from "next/link";
import type { Route } from "next";
import { formatCents } from "@/lib/money";
import { summarizeStoreRun } from "@/lib/jobs/buy-list";
import type { BuyListLine } from "./BuyListClient";

export function StoreRunSummary({
  jobId,
  runStartLines,
  finalLines,
  purchasedIds,
}: {
  jobId: string;
  runStartLines: BuyListLine[];
  finalLines: BuyListLine[];
  purchasedIds: ReadonlySet<string>;
}) {
  const finalById = new Map(finalLines.map((line) => [line.id, line]));
  const summary = summarizeStoreRun(
    runStartLines.map((line) => finalById.get(line.id) ?? line),
    purchasedIds,
  );

  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <div>
        <h2 style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-xl)" }}>
          Store Run Complete
        </h2>
        <p style={{ margin: 0, color: "var(--fg-secondary)" }}>
          Purchased {summary.purchasedCount} item{summary.purchasedCount === 1 ? "" : "s"}. {summary.stillNeededCount} still needed.
        </p>
        {summary.estimatedPurchasedTotalCents !== null && (
          <p style={{ margin: "var(--space-2) 0 0", fontWeight: 700 }}>
            Estimated purchased: {formatCents(summary.estimatedPurchasedTotalCents)}
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <Link
          href={`/app/expenses/new?mode=run&job=${jobId}` as Route}
          className="p7-btn p7-btn-primary p7-btn-lg"
          data-testid="store-run-upload-receipt"
        >
          Upload Receipt
        </Link>
        <Link href={`/app/jobs/${jobId}` as Route} className="p7-btn p7-btn-secondary p7-btn-lg">
          Back to Job
        </Link>
      </div>
    </div>
  );
}
