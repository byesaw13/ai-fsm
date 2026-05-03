import type { ReactNode } from "react";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="portal-shell">
      {children}
    </div>
  );
}
