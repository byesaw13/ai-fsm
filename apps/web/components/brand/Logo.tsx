import type { CSSProperties } from "react";

/**
 * Dovetails logo. Files live in /public/brand/svg.
 * variant: icon | stacked | horizontal
 * tone:    color (light backgrounds) | reverse (dark backgrounds) | mono (one color)
 * chimney: outline (Logo A, default) | solid (Logo A2)
 * ink:     for tone="mono", "navy" or "white"
 */
type Props = {
  variant?: "icon" | "stacked" | "horizontal";
  tone?: "color" | "reverse" | "mono";
  chimney?: "outline" | "solid";
  ink?: "navy" | "white";
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
  alt?: string;
};

const RATIO = { icon: 605 / 510, stacked: 616 / 509, horizontal: 624 / 164 } as const;

export function logoSrc(
  variant: Props["variant"] = "horizontal",
  tone: Props["tone"] = "color",
  chimney: Props["chimney"] = "outline",
  ink: Props["ink"] = "navy"
) {
  const t = tone === "mono" ? (ink === "white" ? "mono-white" : "mono") : tone;
  return `/brand/svg/dovetails-${variant}-${t}${chimney === "solid" ? "-solid-chimney" : ""}.svg`;
}

export function Logo({
  variant = "horizontal",
  tone = "color",
  chimney = "outline",
  ink = "navy",
  width,
  height,
  className,
  style,
  alt = "Dovetails Home Services",
}: Props) {
  const r = RATIO[variant];
  const h = height ?? (width ? Math.round(width / r) : 40);
  const w = width ?? Math.round(h * r);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand SVG
    <img
      src={logoSrc(variant, tone, chimney, ink)}
      width={w}
      height={h}
      alt={alt}
      className={className}
      style={{ display: "block", ...style }}
    />
  );
}

export default Logo;
