"use client";

import { useEffect, useRef, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Modal — overlay with focus trap, title, and close button
// ---------------------------------------------------------------------------

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  "data-testid"?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  "data-testid": testId,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus the close button when modal opens
  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    }
  }, [open]);

  // Trap focus within modal + close on Escape
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const el = dialogRef.current;
      if (!el) return;

      const focusable = el.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="p7-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      data-testid={testId}
    >
      <div className="p7-modal" ref={dialogRef}>
        <div className="p7-modal-header">
          <h2 className="p7-modal-title" id="modal-title">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="p7-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <div className="p7-modal-body">{children}</div>
        {footer && <div className="p7-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
