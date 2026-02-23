import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// PageContainer — max-width wrapper with responsive padding
// ---------------------------------------------------------------------------

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PageContainer({ children, className = "" }: PageContainerProps) {
  return (
    <div className={`p7-page-container ${className}`}>
      {children}
    </div>
  );
}
