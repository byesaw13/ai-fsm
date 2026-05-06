"use client";

export function PrintButton() {
  return (
    <button
      className="no-print"
      onClick={() => window.print()}
      style={{
        position: "fixed", top: 16, right: 16,
        padding: "8px 20px", background: "#111", color: "#fff",
        border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14,
      }}
    >
      Print / Save PDF
    </button>
  );
}
