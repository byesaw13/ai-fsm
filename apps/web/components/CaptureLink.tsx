import type { AnchorHTMLAttributes, CSSProperties, ReactNode } from "react";

export const CAPTURE_HREF = "/app/capture";

/**
 * Full document navigation to Capture.
 * Next.js <Link> keeps the current document Permissions-Policy
 * (microphone=() on every page except /app/capture), so getUserMedia fails.
 */
export function CaptureLink({
  children,
  className,
  style,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <a href={CAPTURE_HREF} className={className} style={style} {...rest}>
      {children}
    </a>
  );
}
