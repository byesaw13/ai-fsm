"use client";

import { useState } from "react";

interface Props {
  url: string;
  label?: string;
}

export function CopyPortalLinkButton({ url, label = "Copy client link" }: Props) {
  const [copied, setCopied] = useState(false);

  function handleClick() {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
      return;
    }
    // Fallback for HTTP (non-secure) contexts
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{ fontSize: "var(--text-sm)", color: copied ? "var(--color-success, #16a34a)" : "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
