"use client";

import { Button } from "@/components/ui";
import { quoteSaveOffersReload } from "@/components/QuoteVersion";

/** The failure a quote save shows, with Reload when the server asked for it. */
export function QuoteSaveAlert({ message }: { message: string }) {
  const reload = quoteSaveOffersReload(message);
  return (
    <div className="p7-card-danger" role="alert" data-testid="quote-save-alert">
      {reload ? (
        <p style={{ margin: 0, fontWeight: 600 }}>This quote changed</p>
      ) : null}
      <p style={{ margin: reload ? "var(--space-1) 0 0" : 0 }} data-testid="edit-form-error">
        {message}
      </p>
      {reload ? (
        <Button
          type="button"
          variant="primary"
          onClick={() => window.location.reload()}
          style={{ marginTop: "var(--space-2)" }}
        >
          Reload
        </Button>
      ) : null}
    </div>
  );
}
