import type { InvoiceException } from "@/lib/invoices/review-exceptions";

export function InvoiceReview({ exceptions }: { exceptions: InvoiceException[] }) {
  if (exceptions.length === 0) {
    return (
      <p data-testid="invoice-review" style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)" }}>
        Nothing left to resolve before this bill goes out.
      </p>
    );
  }
  const noun = exceptions.length === 1 ? "issue" : "issues";
  return (
    <div
      data-testid="invoice-review"
      role="alert"
      style={{
        margin: "0 0 var(--space-4)",
        padding: "var(--space-3)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
      }}
    >
      <strong>Resolve {exceptions.length} {noun}</strong>
      <ul style={{ margin: "var(--space-2) 0 0", paddingLeft: "1.1rem" }}>
        {exceptions.map((issue) => (
          <li key={issue.id}>{issue.message}</li>
        ))}
      </ul>
    </div>
  );
}
