interface Props {
  paidAt?: string | null;
  /** compact = smaller stamp for portal cards */
  variant?: "default" | "compact";
}

export function PaidStamp({ paidAt, variant = "default" }: Props) {
  const paidDate =
    paidAt &&
    new Date(paidAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const isCompact = variant === "compact";

  return (
    <div
      aria-label="Paid in full"
      style={{
        position: "absolute",
        top: isCompact ? 72 : 140,
        right: isCompact ? 12 : 48,
        transform: "rotate(-14deg)",
        border: `${isCompact ? 3 : 4}px solid #b91c1c`,
        outline: `${isCompact ? 1 : 2}px solid #b91c1c`,
        outlineOffset: isCompact ? 3 : 4,
        color: "#b91c1c",
        fontWeight: 800,
        fontSize: isCompact ? 28 : 44,
        letterSpacing: "0.18em",
        padding: isCompact ? "4px 14px" : "6px 22px",
        opacity: 0.88,
        pointerEvents: "none",
        userSelect: "none",
        lineHeight: 1,
        textAlign: "center",
        background: "rgba(255,255,255,0.75)",
      }}
    >
      PAID
      {paidDate && (
        <div
          style={{
            fontSize: isCompact ? 9 : 11,
            letterSpacing: "0.06em",
            marginTop: isCompact ? 4 : 6,
            fontWeight: 700,
          }}
        >
          {paidDate}
        </div>
      )}
    </div>
  );
}