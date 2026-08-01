"use client";

import { useState } from "react";

interface Props {
  supplyPo: string;
  /** Optional formal job number shown as secondary text */
  jobNumber?: string | null;
  size?: "sm" | "md";
}

/**
 * One-tap copy of the spoken supply-house PO (J260029).
 * Shown on the project page so techs can paste / dictate at the register.
 */
export function CopySupplyPoButton({ supplyPo, jobNumber, size = "md" }: Props) {
  const [copied, setCopied] = useState(false);

  function handleClick() {
    const write = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(supplyPo).then(write).catch(() => {
        fallbackCopy(supplyPo);
        write();
      });
      return;
    }
    fallbackCopy(supplyPo);
    write();
  }

  const fontSize = size === "sm" ? "var(--text-xs)" : "var(--text-sm)";

  return (
    <span
      data-testid="supply-po"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        fontSize,
      }}
    >
      <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>Supply PO</span>
      <code
        data-testid="supply-po-value"
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "var(--fg)",
          background: "var(--bg-muted, #f4f4f5)",
          padding: "2px 8px",
          borderRadius: 6,
          border: "1px solid var(--border)",
        }}
      >
        {supplyPo}
      </code>
      <button
        type="button"
        data-testid="supply-po-copy"
        onClick={handleClick}
        className="p7-btn p7-btn-secondary p7-btn-sm"
        style={{ fontSize }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      {jobNumber && jobNumber !== supplyPo ? (
        <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
          Job {jobNumber}
        </span>
      ) : null}
    </span>
  );
}

function fallbackCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}
