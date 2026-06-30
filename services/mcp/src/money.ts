import { formatCents } from "@ai-fsm/money";

export { formatCents };

/** Structured money value: always includes both raw cents and a display string. */
export function money(cents: number | null | undefined): { cents: number; formatted: string } {
  const value = cents ?? 0;
  return { cents: value, formatted: formatCents(value) };
}