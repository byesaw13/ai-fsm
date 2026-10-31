"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * One loaded quote timestamp for the prepared-scope panel and the edit form.
 * A save in either one updates it, so the next save in this tab still matches.
 */
const QuoteVersionContext = createContext<{
  updatedAt: string;
  setUpdatedAt: (value: string) => void;
} | null>(null);

export function QuoteVersionProvider({
  initialUpdatedAt,
  children,
}: {
  initialUpdatedAt: string;
  children: ReactNode;
}) {
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  return (
    <QuoteVersionContext.Provider value={{ updatedAt, setUpdatedAt }}>
      {children}
    </QuoteVersionContext.Provider>
  );
}

export function useQuoteVersion(): { updatedAt: string; setUpdatedAt: (value: string) => void } {
  const ctx = useContext(QuoteVersionContext);
  const [updatedAt, setUpdatedAt] = useState("");
  return ctx ?? { updatedAt, setUpdatedAt };
}

/** True when the server told this page to reload before another save. */
export function quoteSaveOffersReload(message: string): boolean {
  return /reload to see the latest/i.test(message);
}

export function rememberQuoteVersion(
  data: { updated_at?: unknown },
  setUpdatedAt: (value: string) => void,
) {
  if (typeof data.updated_at === "string" && data.updated_at) setUpdatedAt(data.updated_at);
}
