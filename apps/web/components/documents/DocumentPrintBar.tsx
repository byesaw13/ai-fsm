"use client";

import { useCallback, useState } from "react";

interface Props {
  /** Server PDF endpoint — opens reliably on mobile (Share → Save to Files). */
  pdfUrl?: string;
}

/**
 * Print / save actions for document preview pages.
 * Mobile: bottom bar with Save PDF (primary) + Print. Desktop: top-right chip.
 */
export function DocumentPrintBar({ pdfUrl }: Props) {
  const [printing, setPrinting] = useState(false);

  const handlePrint = useCallback(() => {
    setPrinting(true);
    try {
      window.print();
    } finally {
      window.setTimeout(() => setPrinting(false), 600);
    }
  }, []);

  return (
    <>
      <style>{`
        @media print {
          .doc-print-bar { display: none !important; }
        }
        .doc-print-bar {
          position: fixed;
          z-index: 9999;
          display: flex;
          gap: 10px;
          padding: 10px 12px;
          background: rgba(17, 17, 17, 0.94);
          border-radius: 12px;
          box-shadow: 0 6px 24px rgba(0, 0, 0, 0.28);
          -webkit-tap-highlight-color: transparent;
        }
        .doc-print-bar button,
        .doc-print-bar a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 10px 18px;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          text-decoration: none;
          touch-action: manipulation;
          cursor: pointer;
          border: none;
          white-space: nowrap;
          font-family: inherit;
        }
        .doc-print-bar .doc-print-primary {
          background: #fff;
          color: #111;
        }
        .doc-print-bar .doc-print-secondary {
          background: transparent;
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.4);
        }
        @media (max-width: 767px) {
          .doc-print-bar {
            left: 12px;
            right: 12px;
            bottom: calc(12px + env(safe-area-inset-bottom, 0px));
            top: auto;
          }
          .doc-print-bar button,
          .doc-print-bar a {
            flex: 1;
          }
        }
        @media (min-width: 768px) {
          .doc-print-bar {
            top: calc(16px + env(safe-area-inset-top, 0px));
            right: 16px;
          }
        }
      `}</style>
      <div className="doc-print-bar no-print" role="toolbar" aria-label="Print and save">
        {pdfUrl && (
          <a
            href={pdfUrl}
            className="doc-print-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            Save PDF
          </a>
        )}
        <button
          type="button"
          className={pdfUrl ? "doc-print-secondary" : "doc-print-primary"}
          onClick={handlePrint}
          disabled={printing}
        >
          {printing ? "Opening…" : "Print"}
        </button>
      </div>
    </>
  );
}