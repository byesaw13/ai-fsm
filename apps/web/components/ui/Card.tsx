import type { HTMLAttributes, ReactNode, ElementType } from "react";

// ---------------------------------------------------------------------------
// Card — container with shadow and optional hover state
// ---------------------------------------------------------------------------

interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  hover?: boolean;
  as?: ElementType;
  padding?: "sm" | "default" | "lg" | "none";
}

const paddingMap = {
  none: "",
  sm: "var(--space-3)",
  default: "var(--space-4)",
  lg: "var(--space-6)",
};

export function Card({
  children,
  hover = false,
  as: Tag = "div",
  padding = "default",
  className = "",
  style,
  ...rest
}: CardProps) {
  const classes = [
    "p7-card",
    hover ? "p7-card-hover" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const paddingValue = padding !== "default" ? paddingMap[padding] : undefined;

  return (
    <Tag
      {...rest}
      className={classes}
      style={paddingValue ? { padding: paddingValue, ...style } : style}
    >
      {children}
    </Tag>
  );
}
