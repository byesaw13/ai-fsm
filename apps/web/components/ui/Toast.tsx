"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Toast — lightweight client-side notification system
// ---------------------------------------------------------------------------

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  autoDismiss?: boolean;
  dismissAfterMs?: number;
}

interface ToastContextValue {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, "id">) => string;
  removeToast: (id: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

const TOAST_ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
};

const DEFAULT_DISMISS_MS: Record<ToastType, number> = {
  success: 4000,
  error: 0,     // manual dismiss for errors
  info: 4000,
};

/** ToastProvider — wraps the app layout. Provides useToast() hook. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<ToastItem, "id">): string => {
    const id = genId();
    setToasts((prev) => {
      // Keep max 3; remove oldest first
      const next = [...prev, { ...toast, id }];
      return next.length > 3 ? next.slice(next.length - 3) : next;
    });
    return id;
  }, []);

  const success = useCallback(
    (message: string) => addToast({ type: "success", message }),
    [addToast]
  );
  const error = useCallback(
    (message: string) =>
      addToast({ type: "error", message, autoDismiss: false }),
    [addToast]
  );
  const info = useCallback(
    (message: string) => addToast({ type: "info", message }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, info }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

/** useToast — access toast controls from any client component */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// ---- Internal ---------------------------------------------------------------

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="p7-toast-container" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <ToastNotification key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastNotification({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const autoDismiss = toast.autoDismiss !== false;
  const ms = toast.dismissAfterMs ?? DEFAULT_DISMISS_MS[toast.type];

  useEffect(() => {
    if (!autoDismiss || ms === 0) return;
    const t = setTimeout(() => onDismiss(toast.id), ms);
    return () => clearTimeout(t);
  }, [toast.id, autoDismiss, ms, onDismiss]);

  return (
    <div className={`p7-toast p7-toast-${toast.type}`} role="alert">
      <span className="p7-toast-icon" aria-hidden="true">
        {TOAST_ICONS[toast.type]}
      </span>
      <span className="p7-toast-message">{toast.message}</span>
      <button
        type="button"
        className="p7-toast-dismiss"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}
