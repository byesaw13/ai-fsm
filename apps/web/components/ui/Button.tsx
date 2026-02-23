"use client";

import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";

// ---------------------------------------------------------------------------
// Button — primary/secondary/danger/ghost variants, sm/default/lg sizes
// ---------------------------------------------------------------------------

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "default" | "lg";

/** Returns the CSS class string for a button given variant and size */
export function getButtonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "default",
  loading = false,
  className = ""
): string {
  const parts = ["p7-btn", `p7-btn-${variant}`];
  if (size !== "default") parts.push(`p7-btn-${size}`);
  if (loading) parts.push("p7-btn-loading");
  if (className) parts.push(className);
  return parts.join(" ");
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

/** Button — standard interactive button element */
export function Button({
  variant = "primary",
  size = "default",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={getButtonClass(variant, size, loading, className)}
    >
      {children}
    </button>
  );
}

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

/** LinkButton — anchor-styled as a button (uses next/link for internal routes) */
export function LinkButton({
  href,
  variant = "primary",
  size = "default",
  className = "",
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      href={href as Route}
      {...rest}
      className={getButtonClass(variant, size, false, className)}
    >
      {children}
    </Link>
  );
}
