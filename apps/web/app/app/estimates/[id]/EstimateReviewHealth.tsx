export function EstimateReviewHealth({
  total,
  ready,
  needsReview,
}: {
  total: number;
  ready: number;
  needsReview: number;
}) {
  const reviewWord = needsReview === 1 ? "needs" : "need";
  const itemWord = needsReview === 1 ? "item" : "items";
  return (
    <div
      data-testid="estimate-review-health"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        flexWrap: "wrap",
        margin: "0 0 var(--space-4)",
        padding: "var(--space-3)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
      }}
    >
      <strong>
        {total} items • {ready} ready • {needsReview} {reviewWord} review
      </strong>
      {needsReview > 0 && (
        <a href="#estimate-lines" data-testid="estimate-review-action">
          Review {needsReview} {itemWord}
        </a>
      )}
    </div>
  );
}
