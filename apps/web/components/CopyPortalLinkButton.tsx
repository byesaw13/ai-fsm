"use client";

import { useState } from "react";

interface Props {
  url: string;
  label?: string;
}

export function CopyPortalLinkButton({ url, label = "Copy client link" }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    await navigator.clipboard.writeText(url);
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
