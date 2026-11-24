import type { ReactNode } from "react";

/**
 * A money amount in the mono font, so figures line up (TASK-241).
 * Wrap an already formatted amount: <Money>{formatCents(c)}</Money>.
 */
export function Money({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={className ? `p7-money ${className}` : "p7-money"}>{children}</span>;
}
